#!/usr/bin/env bun

/**
 * Minimal MCP server over Streamable HTTP for testing.
 * Starts on a random port and prints the URL to stdout for test discovery.
 * Implements the same tools/resources/prompts as mock-server.ts but over HTTP.
 */

const tools = [
  {
    name: "echo",
    description: "Echoes back the input",
    inputSchema: {
      type: "object",
      properties: { message: { type: "string", description: "Message to echo" } },
      required: ["message"],
    },
  },
  {
    name: "add",
    description: "Adds two numbers",
    inputSchema: {
      type: "object",
      properties: { a: { type: "number" }, b: { type: "number" } },
      required: ["a", "b"],
    },
  },
  {
    name: "noop",
    description: "A tool that takes no arguments",
    inputSchema: { type: "object", properties: {} },
  },
];

const resources = [
  {
    uri: "file:///hello.txt",
    name: "Hello File",
    description: "A simple greeting file",
    mimeType: "text/plain",
  },
];

const prompts = [
  {
    name: "greet",
    description: "Generate a greeting message",
    arguments: [{ name: "name", description: "Name to greet", required: true }],
  },
];

// Track active SSE sessions for session-based routing
const sessions = new Map<string, boolean>();

function handleJsonRpc(msg: { jsonrpc: string; id?: number; method: string; params?: unknown }) {
  if (msg.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: { name: "mock-http-server", version: "1.0.0" },
      },
    };
  }

  if (msg.method === "notifications/initialized") {
    return null; // No response for notifications
  }

  if (msg.method === "tools/list") {
    return { jsonrpc: "2.0", id: msg.id, result: { tools } };
  }

  if (msg.method === "tools/call") {
    const params = msg.params as { name: string; arguments?: Record<string, unknown> };
    if (params.name === "echo") {
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: { content: [{ type: "text", text: String(params.arguments?.message ?? "") }] },
      };
    }
    if (params.name === "add") {
      const a = Number(params.arguments?.a ?? 0);
      const b = Number(params.arguments?.b ?? 0);
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: { content: [{ type: "text", text: String(a + b) }] },
      };
    }
    if (params.name === "noop") {
      return { jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "ok" }] } };
    }
    return {
      jsonrpc: "2.0",
      id: msg.id,
      result: { content: [{ type: "text", text: `unknown tool: ${params.name}` }], isError: true },
    };
  }

  if (msg.method === "resources/list") {
    return { jsonrpc: "2.0", id: msg.id, result: { resources } };
  }

  if (msg.method === "resources/read") {
    const params = msg.params as { uri: string };
    if (params.uri === "file:///hello.txt") {
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: { contents: [{ uri: params.uri, mimeType: "text/plain", text: "Hello, World!" }] },
      };
    }
    return {
      jsonrpc: "2.0",
      id: msg.id,
      error: { code: -32602, message: `Resource not found: ${params.uri}` },
    };
  }

  if (msg.method === "prompts/list") {
    return { jsonrpc: "2.0", id: msg.id, result: { prompts } };
  }

  if (msg.method === "prompts/get") {
    const params = msg.params as { name: string; arguments?: Record<string, string> };
    if (params.name === "greet") {
      const name = params.arguments?.name ?? "World";
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          description: "A greeting prompt",
          messages: [{ role: "user", content: { type: "text", text: `Hello, ${name}!` } }],
        },
      };
    }
    return {
      jsonrpc: "2.0",
      id: msg.id,
      error: { code: -32602, message: `Prompt not found: ${params.name}` },
    };
  }

  if (msg.method === "ping") {
    return { jsonrpc: "2.0", id: msg.id, result: {} };
  }

  return {
    jsonrpc: "2.0",
    id: msg.id,
    error: { code: -32601, message: `Method not found: ${msg.method}` },
  };
}

function generateSessionId(): string {
  return crypto.randomUUID();
}

const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);

    // Only handle /mcp endpoint
    if (url.pathname !== "/mcp") {
      return new Response("Not found", { status: 404 });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const response = handleJsonRpc(body);

      // Assign session ID on initialize
      let sessionId = req.headers.get("mcp-session-id");
      const headers: Record<string, string> = { "Content-Type": "application/json" };

      if (body.method === "initialize") {
        sessionId = generateSessionId();
        sessions.set(sessionId, true);
        headers["mcp-session-id"] = sessionId;
      } else if (sessionId) {
        headers["mcp-session-id"] = sessionId;
      }

      // Notifications don't get a response body
      if (response === null) {
        return new Response(null, { status: 204, headers });
      }

      return new Response(JSON.stringify(response), { status: 200, headers });
    }

    if (req.method === "DELETE") {
      // Session termination
      const sessionId = req.headers.get("mcp-session-id");
      if (sessionId) {
        sessions.delete(sessionId);
      }
      return new Response(null, { status: 204 });
    }

    return new Response("Method not allowed", { status: 405 });
  },
});

// Print the URL so the test can discover the port
console.log(`http://localhost:${server.port}/mcp`);
