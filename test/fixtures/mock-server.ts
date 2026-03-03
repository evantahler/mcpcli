#!/usr/bin/env bun

/**
 * Minimal MCP server over stdio for testing.
 * Implements just enough of the protocol to support initialize, listTools, and callTool.
 */

import { readFileSync } from "fs";

let buffer = "";

process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk: string) => {
  buffer += chunk;
  processBuffer();
});

function processBuffer() {
  while (true) {
    const newlineIndex = buffer.indexOf("\n");
    if (newlineIndex === -1) break;
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (line) handleMessage(line);
  }
}

function handleMessage(line: string) {
  let msg: { jsonrpc: string; id?: number; method: string; params?: unknown };
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }

  if (msg.method === "initialize") {
    respond(msg.id, {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "mock-server", version: "1.0.0" },
    });
  } else if (msg.method === "notifications/initialized") {
    // No response needed for notifications
  } else if (msg.method === "tools/list") {
    respond(msg.id, {
      tools: [
        {
          name: "echo",
          description: "Echoes back the input",
          inputSchema: {
            type: "object",
            properties: {
              message: { type: "string", description: "Message to echo" },
            },
            required: ["message"],
          },
        },
        {
          name: "add",
          description: "Adds two numbers",
          inputSchema: {
            type: "object",
            properties: {
              a: { type: "number" },
              b: { type: "number" },
            },
            required: ["a", "b"],
          },
        },
        {
          name: "secret",
          description: "A secret tool",
          inputSchema: { type: "object" },
        },
      ],
    });
  } else if (msg.method === "tools/call") {
    const params = msg.params as { name: string; arguments?: Record<string, unknown> };
    if (params.name === "echo") {
      respond(msg.id, {
        content: [{ type: "text", text: String(params.arguments?.message ?? "") }],
      });
    } else if (params.name === "add") {
      const a = Number(params.arguments?.a ?? 0);
      const b = Number(params.arguments?.b ?? 0);
      respond(msg.id, {
        content: [{ type: "text", text: String(a + b) }],
      });
    } else {
      respond(msg.id, {
        content: [{ type: "text", text: `unknown tool: ${params.name}` }],
        isError: true,
      });
    }
  } else if (msg.method === "ping") {
    respond(msg.id, {});
  }
}

function respond(id: number | undefined, result: unknown) {
  if (id === undefined) return;
  const response = JSON.stringify({ jsonrpc: "2.0", id, result });
  process.stdout.write(response + "\n");
}
