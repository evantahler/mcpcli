import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { cyan, dim, green, red, yellow } from "ansis";
import { logger } from "../output/logger.ts";

export interface TraceOptions {
  json: boolean;
  serverName: string;
}

interface PendingRequest {
  method: string;
  sentAt: number;
}

/**
 * Wrap a transport with JSON-RPC message tracing.
 * Logs all outgoing/incoming messages to stderr.
 * Uses a Proxy so all other transport properties pass through transparently.
 */
export function wrapTransportWithTrace(transport: Transport, options: TraceOptions): Transport {
  const pending = new Map<string | number, PendingRequest>();
  const isTTY = process.stderr.isTTY ?? false;

  let clientOnMessage: ((message: JSONRPCMessage, extra?: unknown) => void) | undefined;

  return new Proxy(transport, {
    get(target, prop, receiver) {
      if (prop === "send") {
        return async (message: JSONRPCMessage) => {
          logOutgoing(message, pending, options, isTTY);
          return target.send(message);
        };
      }
      if (prop === "onmessage") {
        return clientOnMessage;
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value) {
      if (prop === "onmessage") {
        clientOnMessage = value;
        target.onmessage = (message: JSONRPCMessage, extra?: unknown) => {
          logIncoming(message, pending, options, isTTY);
          clientOnMessage?.(message, extra);
        };
        return true;
      }
      return Reflect.set(target, prop, value);
    },
  });
}

function logOutgoing(
  message: JSONRPCMessage,
  pending: Map<string | number, PendingRequest>,
  options: TraceOptions,
  isTTY: boolean,
): void {
  // Track pending requests for timing (needed in both modes)
  if ("id" in message && "method" in message) {
    const m = message as { id: string | number; method: string };
    pending.set(m.id, { method: m.method, sentAt: performance.now() });
  }

  if (options.json) {
    logger.writeRaw(
      JSON.stringify({ trace: "outgoing", server: options.serverName, message }) + "\n",
    );
    return;
  }

  if ("id" in message && "method" in message) {
    const m = message as { id: string | number; method: string; params?: unknown };
    const arrow = isTTY ? cyan("→") : "→";
    const detail = summarizeParams(m.method, m.params);
    const detailStr = detail ? ` ${detail}` : "";
    logger.writeRaw(`${arrow} ${dim(`${m.method} (id: ${m.id})${detailStr}`)}\n`);
  } else if ("method" in message) {
    const m = message as { method: string };
    const arrow = isTTY ? cyan("→") : "→";
    logger.writeRaw(`${arrow} ${dim(m.method)}\n`);
  }
}

function logIncoming(
  message: JSONRPCMessage,
  pending: Map<string | number, PendingRequest>,
  options: TraceOptions,
  isTTY: boolean,
): void {
  if ("id" in message && !("method" in message)) {
    // Response to a request
    const m = message as { id: string | number; result?: unknown; error?: unknown };
    const req = pending.get(m.id);
    pending.delete(m.id);
    const elapsed = req ? Math.round(performance.now() - req.sentAt) : undefined;
    const method = req?.method ?? "unknown";

    if (options.json) {
      logger.writeRaw(
        JSON.stringify({
          trace: "incoming",
          server: options.serverName,
          message,
          ...(elapsed !== undefined && { elapsed_ms: elapsed }),
          request_method: method,
        }) + "\n",
      );
      return;
    }

    const isError = m.error !== undefined;
    const arrow = isTTY ? (isError ? red("←") : green("←")) : "←";
    const timing = elapsed !== undefined ? ` [${elapsed}ms]` : "";
    const summary = summarizeResult(method, m.result);
    const summaryStr = summary ? ` — ${summary}` : "";
    logger.writeRaw(`${arrow} ${dim(`${method} (id: ${m.id})${timing}${summaryStr}`)}\n`);
  } else if ("method" in message) {
    // Notification (incoming)
    const m = message as { method: string; params?: unknown };

    if (options.json) {
      logger.writeRaw(
        JSON.stringify({ trace: "incoming", server: options.serverName, message }) + "\n",
      );
      return;
    }

    const arrow = isTTY ? yellow("←") : "←";
    const params = m.params ? ` ${JSON.stringify(m.params)}` : "";
    logger.writeRaw(`${arrow} ${dim(`${m.method}${params}`)}\n`);
  }
}

function summarizeParams(method: string, params: unknown): string | undefined {
  if (!params || typeof params !== "object") return undefined;
  const p = params as Record<string, unknown>;

  switch (method) {
    case "tools/call": {
      const name = p.name as string | undefined;
      const args = p.arguments;
      if (!name) return undefined;
      const argsStr = args ? ` ${JSON.stringify(args)}` : "";
      return `${name}${argsStr}`;
    }
    case "resources/read":
      return p.uri ? String(p.uri) : undefined;
    case "prompts/get":
      return p.name ? String(p.name) : undefined;
    default:
      return undefined;
  }
}

function summarizeResult(method: string, result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const r = result as Record<string, unknown>;

  switch (method) {
    case "tools/list":
      return Array.isArray(r.tools) ? `${r.tools.length} tools` : undefined;
    case "resources/list":
      return Array.isArray(r.resources) ? `${r.resources.length} resources` : undefined;
    case "resources/templates/list":
      return Array.isArray(r.resourceTemplates)
        ? `${r.resourceTemplates.length} templates`
        : undefined;
    case "prompts/list":
      return Array.isArray(r.prompts) ? `${r.prompts.length} prompts` : undefined;
    case "initialize": {
      const info = r.serverInfo as { name?: string; version?: string } | undefined;
      if (info?.name) return info.version ? `${info.name} v${info.version}` : info.name;
      return undefined;
    }
    case "tools/call":
      return r.isError ? "error" : "ok";
    case "ping":
      return "pong";
    default:
      return "ok";
  }
}
