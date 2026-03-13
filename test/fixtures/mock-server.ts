#!/usr/bin/env bun

/**
 * Minimal MCP server over stdio for testing.
 * Implements just enough of the protocol to support initialize, listTools, and callTool.
 */

import { readFileSync } from "fs";

let buffer = "";

// In-memory task store for testing
const tasks = new Map<
  string,
  { taskId: string; status: string; message: string; pollCount: number; createdAt: string }
>();

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
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
        logging: {},
        tasks: { requests: { tools: { call: {} } }, list: {}, cancel: {} },
      },
      serverInfo: { name: "mock-server", version: "1.0.0" },
      instructions: "Mock server for testing",
    });
  } else if (msg.method === "notifications/initialized") {
    // No response needed for notifications
  } else if (msg.method === "resources/list") {
    respond(msg.id, {
      resources: [
        {
          uri: "file:///hello.txt",
          name: "Hello File",
          description: "A simple greeting file",
          mimeType: "text/plain",
        },
        {
          uri: "file:///data.json",
          name: "Data File",
          description: "Some JSON data",
          mimeType: "application/json",
        },
      ],
    });
  } else if (msg.method === "resources/read") {
    const params = msg.params as { uri: string };
    if (params.uri === "file:///hello.txt") {
      respond(msg.id, {
        contents: [{ uri: params.uri, mimeType: "text/plain", text: "Hello, World!" }],
      });
    } else if (params.uri === "file:///data.json") {
      respond(msg.id, {
        contents: [
          { uri: params.uri, mimeType: "application/json", text: '{"key":"value","count":42}' },
        ],
      });
    } else {
      respond(msg.id, { error: { code: -32602, message: `Resource not found: ${params.uri}` } });
    }
  } else if (msg.method === "prompts/list") {
    respond(msg.id, {
      prompts: [
        {
          name: "greet",
          description: "Generate a greeting message",
          arguments: [{ name: "name", description: "Name to greet", required: true }],
        },
        {
          name: "summarize",
          description: "Summarize some text",
          arguments: [{ name: "text", description: "Text to summarize", required: false }],
        },
      ],
    });
  } else if (msg.method === "prompts/get") {
    const params = msg.params as { name: string; arguments?: Record<string, string> };
    if (params.name === "greet") {
      const name = params.arguments?.name ?? "World";
      respond(msg.id, {
        description: "A greeting prompt",
        messages: [{ role: "user", content: { type: "text", text: `Hello, ${name}!` } }],
      });
    } else if (params.name === "summarize") {
      const text = params.arguments?.text ?? "(no text provided)";
      respond(msg.id, {
        description: "A summarize prompt",
        messages: [{ role: "user", content: { type: "text", text: `Please summarize: ${text}` } }],
      });
    } else {
      respond(msg.id, { error: { code: -32602, message: `Prompt not found: ${params.name}` } });
    }
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
        {
          name: "noop",
          description: "A tool that takes no arguments",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "slow_echo",
          description: "Echoes back the input after a simulated delay (supports tasks)",
          inputSchema: {
            type: "object",
            properties: {
              message: { type: "string", description: "Message to echo" },
            },
            required: ["message"],
          },
          execution: { taskSupport: "optional" },
        },
      ],
    });
  } else if (msg.method === "logging/setLevel") {
    respond(msg.id, {});
  } else if (msg.method === "tools/call") {
    const params = msg.params as {
      name: string;
      arguments?: Record<string, unknown>;
      task?: { ttl?: number };
    };
    // Emit log notifications at various levels when a tool is called
    notify("notifications/message", {
      level: "debug",
      logger: "mock",
      data: `resolving tool: ${params.name}`,
    });
    notify("notifications/message", {
      level: "info",
      logger: "mock",
      data: `calling tool: ${params.name}`,
    });
    notify("notifications/message", {
      level: "warning",
      data: `tool ${params.name} is deprecated`,
    });
    if (params.name === "slow_echo" && params.task) {
      // Task-augmented call: return CreateTaskResult
      const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      tasks.set(taskId, {
        taskId,
        status: "working",
        message: String(params.arguments?.message ?? ""),
        pollCount: 0,
        createdAt: now,
      });
      respond(msg.id, {
        task: {
          taskId,
          status: "working",
          statusMessage: "Processing your request...",
          createdAt: now,
          lastUpdatedAt: now,
          ttl: params.task.ttl ?? 60000,
          pollInterval: 100,
        },
      });
    } else if (params.name === "echo" || params.name === "slow_echo") {
      respond(msg.id, {
        content: [{ type: "text", text: String(params.arguments?.message ?? "") }],
      });
    } else if (params.name === "add") {
      const a = Number(params.arguments?.a ?? 0);
      const b = Number(params.arguments?.b ?? 0);
      respond(msg.id, {
        content: [{ type: "text", text: String(a + b) }],
      });
    } else if (params.name === "noop") {
      respond(msg.id, {
        content: [{ type: "text", text: "ok" }],
      });
    } else {
      respond(msg.id, {
        content: [{ type: "text", text: `unknown tool: ${params.name}` }],
        isError: true,
      });
    }
  } else if (msg.method === "tasks/get") {
    const params = msg.params as { taskId: string };
    const task = tasks.get(params.taskId);
    if (!task) {
      respondError(msg.id, -32602, `Task not found: ${params.taskId}`);
      return;
    }
    // Auto-complete after 2 polls
    task.pollCount++;
    if (task.pollCount >= 2 && task.status === "working") {
      task.status = "completed";
    }
    const now = new Date().toISOString();
    respond(msg.id, {
      taskId: task.taskId,
      status: task.status,
      statusMessage: task.status === "completed" ? "Done" : "Processing...",
      createdAt: task.createdAt,
      lastUpdatedAt: now,
      ttl: 60000,
      pollInterval: 100,
    });
  } else if (msg.method === "tasks/result") {
    const params = msg.params as { taskId: string };
    const task = tasks.get(params.taskId);
    if (!task) {
      respondError(msg.id, -32602, `Task not found: ${params.taskId}`);
      return;
    }
    if (task.status === "cancelled") {
      respondError(msg.id, -32603, `Task was cancelled`);
      return;
    }
    // Return the actual tool result
    respond(msg.id, {
      content: [{ type: "text", text: task.message }],
      _meta: {
        "io.modelcontextprotocol/related-task": { taskId: task.taskId },
      },
    });
  } else if (msg.method === "tasks/list") {
    const taskList = [...tasks.values()].map((t) => ({
      taskId: t.taskId,
      status: t.status,
      createdAt: t.createdAt,
      lastUpdatedAt: new Date().toISOString(),
      ttl: 60000,
      pollInterval: 100,
    }));
    respond(msg.id, { tasks: taskList });
  } else if (msg.method === "tasks/cancel") {
    const params = msg.params as { taskId: string };
    const task = tasks.get(params.taskId);
    if (!task) {
      respondError(msg.id, -32602, `Task not found: ${params.taskId}`);
      return;
    }
    if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
      respondError(
        msg.id,
        -32602,
        `Cannot cancel task: already in terminal status '${task.status}'`,
      );
      return;
    }
    task.status = "cancelled";
    const now = new Date().toISOString();
    respond(msg.id, {
      taskId: task.taskId,
      status: "cancelled",
      statusMessage: "The task was cancelled by request.",
      createdAt: task.createdAt,
      lastUpdatedAt: now,
      ttl: 60000,
    });
  } else if (msg.method === "ping") {
    respond(msg.id, {});
  }
}

function respond(id: number | undefined, result: unknown) {
  if (id === undefined) return;
  const response = JSON.stringify({ jsonrpc: "2.0", id, result });
  process.stdout.write(response + "\n");
}

function respondError(id: number | undefined, code: number, message: string) {
  if (id === undefined) return;
  const response = JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
  process.stdout.write(response + "\n");
}

function notify(method: string, params: unknown) {
  const message = JSON.stringify({ jsonrpc: "2.0", method, params });
  process.stdout.write(message + "\n");
}
