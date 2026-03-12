import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { HttpServerConfig } from "../config/schemas.ts";
import pkg from "../../package.json";
import { createDebugFetch } from "./debug-fetch.ts";

export function createHttpTransport(
  config: HttpServerConfig,
  authProvider?: OAuthClientProvider,
  verbose = false,
  showSecrets = false,
): StreamableHTTPClientTransport {
  const requestInit: RequestInit = {};
  const userAgent = `${pkg.name}/${pkg.version}`;
  requestInit.headers = {
    "User-Agent": userAgent,
    ...config.headers,
  };

  return new StreamableHTTPClientTransport(new URL(config.url), {
    authProvider,
    requestInit,
    fetch: verbose ? createDebugFetch(showSecrets) : undefined,
  });
}
