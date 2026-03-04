import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { McpOAuthProvider, startCallbackServer } from "../../src/client/oauth.ts";
import type { AuthFile } from "../../src/config/schemas.ts";

function makeProvider(auth: AuthFile = {}, serverName = "test-server") {
  const configDir = "/tmp/mcpcli-test";
  return new McpOAuthProvider({ serverName, configDir, auth });
}

describe("McpOAuthProvider", () => {
  test("tokens() returns undefined for unknown server", () => {
    const provider = makeProvider();
    expect(provider.tokens()).toBeUndefined();
  });

  test("saveTokens() + tokens() round-trip", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcpcli-oauth-"));
    const auth: AuthFile = {};
    const provider = new McpOAuthProvider({ serverName: "srv", configDir: dir, auth });

    await provider.saveTokens({
      access_token: "abc",
      token_type: "Bearer",
    });

    const tokens = provider.tokens();
    expect(tokens?.access_token).toBe("abc");
    expect(tokens?.token_type).toBe("Bearer");

    await rm(dir, { recursive: true });
  });

  test("saveTokens() computes expires_at from expires_in", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcpcli-oauth-"));
    const auth: AuthFile = {};
    const provider = new McpOAuthProvider({ serverName: "srv", configDir: dir, auth });

    const before = Date.now();
    await provider.saveTokens({
      access_token: "abc",
      token_type: "Bearer",
      expires_in: 3600,
    });
    const after = Date.now();

    const expiresAt = new Date(auth["srv"]!.expires_at!).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000);
    expect(expiresAt).toBeLessThanOrEqual(after + 3600 * 1000);

    await rm(dir, { recursive: true });
  });

  test("clientInformation() / saveClientInformation() round-trip", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcpcli-oauth-"));
    const auth: AuthFile = {};
    const provider = new McpOAuthProvider({ serverName: "srv", configDir: dir, auth });

    expect(provider.clientInformation()).toBeUndefined();

    await provider.saveClientInformation({
      client_id: "my-client",
      client_secret: "secret",
    });

    const info = provider.clientInformation();
    expect(info?.client_id).toBe("my-client");

    await rm(dir, { recursive: true });
  });

  test("codeVerifier in-memory round-trip", async () => {
    const provider = makeProvider();
    await provider.saveCodeVerifier("verifier-123");
    expect(provider.codeVerifier()).toBe("verifier-123");
  });

  test("codeVerifier() throws when unset", () => {
    const provider = makeProvider();
    expect(() => provider.codeVerifier()).toThrow("Code verifier not set");
  });

  test("isExpired() returns true for past date", () => {
    const auth: AuthFile = {
      "test-server": {
        tokens: { access_token: "t", token_type: "Bearer" },
        expires_at: new Date(Date.now() - 60000).toISOString(),
      },
    };
    const provider = makeProvider(auth);
    expect(provider.isExpired()).toBe(true);
  });

  test("isExpired() returns false for future date", () => {
    const auth: AuthFile = {
      "test-server": {
        tokens: { access_token: "t", token_type: "Bearer" },
        expires_at: new Date(Date.now() + 60000).toISOString(),
      },
    };
    const provider = makeProvider(auth);
    expect(provider.isExpired()).toBe(false);
  });

  test("isExpired() returns false when no expires_at", () => {
    const auth: AuthFile = {
      "test-server": {
        tokens: { access_token: "t", token_type: "Bearer" },
      },
    };
    const provider = makeProvider(auth);
    expect(provider.isExpired()).toBe(false);
  });

  test("invalidateCredentials clears tokens scope", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcpcli-oauth-"));
    const auth: AuthFile = {
      srv: {
        tokens: { access_token: "t", token_type: "Bearer" },
        client_info: { client_id: "c" },
      },
    };
    const provider = new McpOAuthProvider({ serverName: "srv", configDir: dir, auth });

    await provider.invalidateCredentials("tokens");
    expect(provider.tokens()?.access_token).toBeUndefined();
    // client_info should be preserved
    expect(provider.clientInformation()?.client_id).toBe("c");

    await rm(dir, { recursive: true });
  });

  test("invalidateCredentials clears all scope", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcpcli-oauth-"));
    const auth: AuthFile = {
      srv: {
        tokens: { access_token: "t", token_type: "Bearer" },
        client_info: { client_id: "c" },
      },
    };
    const provider = new McpOAuthProvider({ serverName: "srv", configDir: dir, auth });

    await provider.invalidateCredentials("all");
    expect(provider.tokens()).toBeUndefined();
    expect(provider.clientInformation()).toBeUndefined();

    await rm(dir, { recursive: true });
  });

  test("redirectUrl includes callback port", () => {
    const provider = makeProvider();
    provider.setCallbackPort(12345);
    expect(provider.redirectUrl).toBe("http://127.0.0.1:12345/callback");
  });
});

describe("refreshIfNeeded", () => {
  test("no-op when token is not expired", async () => {
    const auth: AuthFile = {
      "test-server": {
        tokens: { access_token: "t", token_type: "Bearer" },
        expires_at: new Date(Date.now() + 60000).toISOString(),
      },
    };
    const provider = makeProvider(auth);
    // Should not throw — token is still valid
    await provider.refreshIfNeeded("http://example.com");
  });

  test("throws when expired with no refresh token", async () => {
    const auth: AuthFile = {
      "test-server": {
        tokens: { access_token: "t", token_type: "Bearer" },
        expires_at: new Date(Date.now() - 60000).toISOString(),
      },
    };
    const provider = makeProvider(auth);
    await expect(provider.refreshIfNeeded("http://example.com")).rejects.toThrow(
      "no refresh token available",
    );
  });
});

describe("startCallbackServer", () => {
  let server: ReturnType<typeof Bun.serve> | undefined;

  afterEach(() => {
    if (server) {
      server.stop();
      server = undefined;
    }
  });

  test("returns authorization code on /callback?code=xxx", async () => {
    const result = startCallbackServer();
    server = result.server;

    const url = `http://127.0.0.1:${server.port}/callback?code=test-code-123`;
    const response = await fetch(url);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Authenticated");

    const code = await result.authCodePromise;
    expect(code).toBe("test-code-123");
  });

  test("rejects on /callback?error=access_denied", async () => {
    const result = startCallbackServer();
    server = result.server;

    // Catch rejection to prevent unhandled rejection
    const errorPromise = result.authCodePromise.catch((err) => err);

    const url = `http://127.0.0.1:${server.port}/callback?error=access_denied&error_description=User+denied`;
    await fetch(url);

    const err = await errorPromise;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("OAuth error: User denied");
  });

  test("returns 404 on unknown paths", async () => {
    const result = startCallbackServer();
    server = result.server;

    const response = await fetch(`http://127.0.0.1:${server.port}/other`);
    expect(response.status).toBe(404);
  });
});
