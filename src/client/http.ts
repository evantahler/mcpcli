import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { buildTransportInit, type TransportDeps } from "./transport-options.ts";

export function createHttpTransport(deps: TransportDeps): StreamableHTTPClientTransport {
  return new StreamableHTTPClientTransport(new URL(deps.config.url), buildTransportInit(deps));
}
