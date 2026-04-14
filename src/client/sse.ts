import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { buildTransportInit, type TransportDeps } from "./transport-options.ts";

export function createSseTransport(deps: TransportDeps): SSEClientTransport {
	return new SSEClientTransport(new URL(deps.config.url), buildTransportInit(deps));
}
