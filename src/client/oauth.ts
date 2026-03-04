import { exec } from "child_process";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import {
  auth,
  discoverOAuthServerInfo,
  refreshAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientMetadata,
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthFile } from "../config/schemas.ts";
import { saveAuth } from "../config/loader.ts";
import type { FormatOptions } from "../output/formatter.ts";
import { startSpinner } from "../output/spinner.ts";

export class McpOAuthProvider implements OAuthClientProvider {
  private serverName: string;
  private configDir: string;
  private auth: AuthFile;
  private _codeVerifier?: string;
  private _callbackPort = 0;

  constructor(opts: { serverName: string; configDir: string; auth: AuthFile }) {
    this.serverName = opts.serverName;
    this.configDir = opts.configDir;
    this.auth = opts.auth;
  }

  get redirectUrl(): string {
    return `http://127.0.0.1:${this._callbackPort}/callback`;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [`http://127.0.0.1:${this._callbackPort}/callback`],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: "mcpcli",
      token_endpoint_auth_method: "none",
    };
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    const entry = this.auth[this.serverName];
    // During an active auth flow, return client_info even if incomplete.
    // For normal usage (transport), the manager checks isComplete() separately.
    return entry?.client_info;
  }

  async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
    if (!this.auth[this.serverName]) {
      this.auth[this.serverName] = { tokens: {} as OAuthTokens };
    }
    this.auth[this.serverName]!.client_info = info;
    await saveAuth(this.configDir, this.auth);
  }

  tokens(): OAuthTokens | undefined {
    return this.auth[this.serverName]?.tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    if (!this.auth[this.serverName]) {
      this.auth[this.serverName] = { tokens };
    } else {
      this.auth[this.serverName]!.tokens = tokens;
    }

    // Compute expires_at from expires_in
    if (tokens.expires_in) {
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
      this.auth[this.serverName]!.expires_at = expiresAt.toISOString();
    }

    // Mark auth as complete — tokens have been successfully obtained
    this.auth[this.serverName]!.complete = true;

    await saveAuth(this.configDir, this.auth);
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    const urlStr = url.toString();

    if (process.stderr.isTTY) {
      const { dim } = await import("ansis");
      process.stderr.write(`${dim(urlStr)}\n`);
    }

    const cmd =
      process.platform === "darwin"
        ? `open "${urlStr}"`
        : process.platform === "win32"
          ? `start "${urlStr}"`
          : `xdg-open "${urlStr}"`;

    return new Promise((resolve, reject) => {
      exec(cmd, (err) => (err ? reject(err) : resolve()));
    });
  }

  async saveCodeVerifier(v: string): Promise<void> {
    this._codeVerifier = v;
  }

  codeVerifier(): string {
    if (!this._codeVerifier) {
      throw new Error("Code verifier not set");
    }
    return this._codeVerifier;
  }

  async invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery",
  ): Promise<void> {
    const entry = this.auth[this.serverName];
    if (!entry) return;

    switch (scope) {
      case "all":
        delete this.auth[this.serverName];
        break;
      case "client":
        delete entry.client_info;
        break;
      case "tokens":
        delete this.auth[this.serverName];
        // Re-create entry without tokens but keep client_info
        if (entry.client_info) {
          this.auth[this.serverName] = {
            tokens: {} as OAuthTokens,
            client_info: entry.client_info,
          };
        }
        break;
      case "verifier":
        this._codeVerifier = undefined;
        return; // No need to persist
      case "discovery":
        return; // Nothing to clear locally
    }

    await saveAuth(this.configDir, this.auth);
  }

  /** Whether the auth flow completed successfully (tokens were obtained) */
  isComplete(): boolean {
    return !!this.auth[this.serverName]?.complete;
  }

  /** Clear any incomplete auth state from a previously cancelled flow */
  async clearIncomplete(): Promise<void> {
    const entry = this.auth[this.serverName];
    if (entry && !entry.complete) {
      delete this.auth[this.serverName];
      await saveAuth(this.configDir, this.auth);
    }
  }

  setCallbackPort(port: number): void {
    this._callbackPort = port;
  }

  isExpired(): boolean {
    const entry = this.auth[this.serverName];
    if (!entry?.expires_at) return false;
    return new Date(entry.expires_at) <= new Date();
  }

  hasRefreshToken(): boolean {
    const tokens = this.auth[this.serverName]?.tokens;
    return !!tokens?.refresh_token;
  }

  async refreshIfNeeded(serverUrl: string): Promise<void> {
    if (!this.isExpired()) return;

    if (!this.hasRefreshToken()) {
      throw new Error(
        `Token expired for "${this.serverName}" and no refresh token available. Run: mcpcli auth ${this.serverName}`,
      );
    }

    const clientInfo = this.clientInformation();
    if (!clientInfo) {
      throw new Error(
        `No client information for "${this.serverName}". Run: mcpcli auth ${this.serverName}`,
      );
    }

    const tokens = await refreshAuthorization(serverUrl, {
      clientInformation: clientInfo,
      refreshToken: this.auth[this.serverName]!.tokens.refresh_token!,
    });

    await this.saveTokens(tokens);
  }
}

/** Start a local callback server to receive the OAuth authorization code */
export function startCallbackServer(): {
  server: ReturnType<typeof Bun.serve>;
  authCodePromise: Promise<string>;
} {
  let resolveCode: (code: string) => void;
  let rejectCode: (err: Error) => void;

  const authCodePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname !== "/callback") {
        return new Response("Not found", { status: 404 });
      }

      const error = url.searchParams.get("error");
      if (error) {
        const desc = url.searchParams.get("error_description") || error;
        rejectCode!(new Error(`OAuth error: ${desc}`));
        return new Response(
          "<html><body><h1>Authentication Failed</h1><p>You can close this window.</p></body></html>",
          { headers: { "Content-Type": "text/html" } },
        );
      }

      const code = url.searchParams.get("code");
      if (!code) {
        rejectCode!(new Error("No authorization code received"));
        return new Response(
          "<html><body><h1>Error</h1><p>No authorization code received.</p></body></html>",
          { headers: { "Content-Type": "text/html" } },
        );
      }

      resolveCode!(code);
      return new Response(
        "<html><body><h1>Authenticated!</h1><p>You can close this window.</p></body></html>",
        { headers: { "Content-Type": "text/html" } },
      );
    },
  });

  return { server, authCodePromise };
}

/** Probe for OAuth support and run the auth flow if the server supports it.
 * Returns true if auth ran, false if server doesn't support OAuth (silent skip). */
export async function tryOAuthIfSupported(
  serverName: string,
  serverUrl: string,
  configDir: string,
  auth: AuthFile,
  formatOptions: FormatOptions,
): Promise<boolean> {
  let oauthSupported: boolean;
  try {
    const info = await discoverOAuthServerInfo(serverUrl);
    oauthSupported = info.authorizationServerMetadata !== undefined;
  } catch {
    return false;
  }

  if (!oauthSupported) return false;

  const provider = new McpOAuthProvider({ serverName, configDir, auth });
  const spinner = startSpinner(`Authenticating with "${serverName}"…`, formatOptions);
  try {
    await runOAuthFlow(serverUrl, provider);
    spinner.success(`Authenticated with "${serverName}"`);
    return true;
  } catch (err) {
    spinner.error(`Authentication failed: ${err instanceof Error ? err.message : err}`);
    throw err;
  }
}

/** Run a full OAuth authorization flow for an HTTP MCP server */
export async function runOAuthFlow(serverUrl: string, provider: McpOAuthProvider): Promise<void> {
  // Clear any leftover state from a previously cancelled auth flow
  await provider.clearIncomplete();

  const { server, authCodePromise } = startCallbackServer();
  try {
    provider.setCallbackPort(server.port);

    const result = await auth(provider, { serverUrl });
    if (result === "REDIRECT") {
      const code = await authCodePromise;
      await auth(provider, { serverUrl, authorizationCode: code });
    }
  } finally {
    server.stop();
  }
}
