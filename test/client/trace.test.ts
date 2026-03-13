import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { wrapTransportWithTrace } from "../../src/client/trace.ts";

/** Strip ANSI escape codes so assertions work on both TTY and non-TTY (CI) */
function stripAnsi(s: string): string {
  return s.replace(/\u001b\[\d+m/g, "");
}

/** Capture stderr writes during a test */
function captureStderr() {
  const chunks: string[] = [];
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    return true;
  }) as typeof process.stderr.write;
  return {
    get output() {
      return stripAnsi(chunks.join(""));
    },
    restore() {
      process.stderr.write = original;
    },
  };
}

function createMockTransport(): Transport & { triggerMessage: (msg: JSONRPCMessage) => void } {
  let onmessage: ((message: JSONRPCMessage, extra?: unknown) => void) | undefined;
  return {
    get onmessage() {
      return onmessage;
    },
    set onmessage(fn) {
      onmessage = fn;
    },
    onclose: undefined,
    onerror: undefined,
    async start() {},
    async close() {},
    async send(_message: JSONRPCMessage) {},
    triggerMessage(msg: JSONRPCMessage) {
      onmessage?.(msg);
    },
  };
}

describe("wrapTransportWithTrace", () => {
  let stderr: ReturnType<typeof captureStderr>;

  beforeEach(() => {
    stderr = captureStderr();
  });

  afterEach(() => {
    stderr.restore();
  });

  test("logs outgoing requests with method and id", async () => {
    const mock = createMockTransport();
    const wrapped = wrapTransportWithTrace(mock, { json: false, serverName: "test" });

    await wrapped.send({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    } as JSONRPCMessage);

    expect(stderr.output).toContain("→ tools/list (id: 1)");
  });

  test("logs outgoing notifications without id", async () => {
    const mock = createMockTransport();
    const wrapped = wrapTransportWithTrace(mock, { json: false, serverName: "test" });

    await wrapped.send({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    } as JSONRPCMessage);

    expect(stderr.output).toContain("→ notifications/initialized");
    expect(stderr.output).not.toContain("(id:");
  });

  test("logs incoming responses with timing and summary", async () => {
    const mock = createMockTransport();
    const wrapped = wrapTransportWithTrace(mock, { json: false, serverName: "test" });

    // Set up onmessage handler (simulating what Protocol.connect does)
    const received: JSONRPCMessage[] = [];
    wrapped.onmessage = (msg: JSONRPCMessage) => received.push(msg);

    // Send a request first to establish timing
    await wrapped.send({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    } as JSONRPCMessage);

    // Simulate incoming response
    mock.triggerMessage({
      jsonrpc: "2.0",
      id: 1,
      result: { tools: [{ name: "a" }, { name: "b" }] },
    } as unknown as JSONRPCMessage);

    expect(stderr.output).toContain("← tools/list (id: 1)");
    expect(stderr.output).toMatch(/\[\d+ms\]/);
    expect(stderr.output).toContain("2 tools");
    expect(received).toHaveLength(1);
  });

  test("logs incoming notifications", async () => {
    const mock = createMockTransport();
    const wrapped = wrapTransportWithTrace(mock, { json: false, serverName: "test" });

    wrapped.onmessage = () => {};

    mock.triggerMessage({
      jsonrpc: "2.0",
      method: "notifications/message",
      params: { level: "info", data: "Processing..." },
    } as unknown as JSONRPCMessage);

    expect(stderr.output).toContain("← notifications/message");
    expect(stderr.output).toContain("Processing...");
  });

  test("JSON mode outputs NDJSON for outgoing", async () => {
    const mock = createMockTransport();
    const wrapped = wrapTransportWithTrace(mock, { json: true, serverName: "myserver" });

    await wrapped.send({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    } as JSONRPCMessage);

    const line = JSON.parse(stderr.output.trim());
    expect(line.trace).toBe("outgoing");
    expect(line.server).toBe("myserver");
    expect(line.message.method).toBe("tools/list");
  });

  test("JSON mode outputs NDJSON for incoming with timing", async () => {
    const mock = createMockTransport();
    const wrapped = wrapTransportWithTrace(mock, { json: true, serverName: "myserver" });

    wrapped.onmessage = () => {};

    await wrapped.send({
      jsonrpc: "2.0",
      id: 5,
      method: "ping",
      params: {},
    } as JSONRPCMessage);

    stderr.output; // clear outgoing line
    const outgoingLine = stderr.output.split("\n")[0];

    mock.triggerMessage({
      jsonrpc: "2.0",
      id: 5,
      result: {},
    } as unknown as JSONRPCMessage);

    const lines = stderr.output.trim().split("\n");
    const incomingLine = JSON.parse(lines[lines.length - 1]);
    expect(incomingLine.trace).toBe("incoming");
    expect(incomingLine.server).toBe("myserver");
    expect(incomingLine.request_method).toBe("ping");
    expect(typeof incomingLine.elapsed_ms).toBe("number");
  });

  test("logs tools/call with tool name and arguments", async () => {
    const mock = createMockTransport();
    const wrapped = wrapTransportWithTrace(mock, { json: false, serverName: "test" });

    await wrapped.send({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "read_file", arguments: { path: "/tmp/foo" } },
    } as JSONRPCMessage);

    expect(stderr.output).toContain("tools/call (id: 2)");
    expect(stderr.output).toContain("read_file");
    expect(stderr.output).toContain("/tmp/foo");
  });

  test("forwards send calls to underlying transport", async () => {
    const mock = createMockTransport();
    let sent = false;
    mock.send = async () => {
      sent = true;
    };
    const wrapped = wrapTransportWithTrace(mock, { json: false, serverName: "test" });

    await wrapped.send({ jsonrpc: "2.0", method: "ping", id: 1 } as JSONRPCMessage);
    expect(sent).toBe(true);
  });

  test("passes through start and close to underlying transport", async () => {
    const mock = createMockTransport();
    let started = false;
    let closed = false;
    mock.start = async () => {
      started = true;
    };
    mock.close = async () => {
      closed = true;
    };
    const wrapped = wrapTransportWithTrace(mock, { json: false, serverName: "test" });

    await wrapped.start();
    await wrapped.close();
    expect(started).toBe(true);
    expect(closed).toBe(true);
  });

  test("summarizes initialize response with server info", async () => {
    const mock = createMockTransport();
    const wrapped = wrapTransportWithTrace(mock, { json: false, serverName: "test" });
    wrapped.onmessage = () => {};

    await wrapped.send({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {},
    } as JSONRPCMessage);

    mock.triggerMessage({
      jsonrpc: "2.0",
      id: 0,
      result: {
        protocolVersion: "2025-03-26",
        serverInfo: { name: "my-server", version: "1.2.3" },
        capabilities: {},
      },
    } as unknown as JSONRPCMessage);

    expect(stderr.output).toContain("my-server v1.2.3");
  });
});
