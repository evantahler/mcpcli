import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { HttpServerConfig } from "../config/schemas.ts";
import { createDebugFetch } from "./debug-fetch.ts";

export function createSseTransport(
  config: HttpServerConfig,
  authProvider?: OAuthClientProvider,
  verbose = false,
  showSecrets = false,
): SSEClientTransport {
  return new SSEClientTransport(new URL(config.url), {
    authProvider,
    requestInit: config.headers ? { headers: config.headers } : undefined,
    fetch: verbose ? createDebugFetch(showSecrets) : undefined,
  });
}
