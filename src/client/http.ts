import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { HttpServerConfig } from "../config/schemas.ts";

export function createHttpTransport(
  config: HttpServerConfig,
  authProvider?: OAuthClientProvider,
): StreamableHTTPClientTransport {
  const requestInit: RequestInit = {};
  if (config.headers) {
    requestInit.headers = config.headers;
  }

  return new StreamableHTTPClientTransport(new URL(config.url), {
    authProvider,
    requestInit: Object.keys(requestInit).length > 0 ? requestInit : undefined,
  });
}
