import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { McpxClient } from "../../src/sdk.ts";
import type { ServersFile, SearchIndex } from "../../src/sdk.ts";

const MOCK_SERVER = join(import.meta.dir, "../fixtures/mock-server.ts");

function makeInlineServers(overrides?: Record<string, unknown>): ServersFile {
  return {
    mcpServers: {
      mock: {
        command: "bun",
        args: ["run", MOCK_SERVER],
        ...overrides,
      },
    },
  };
}

describe("McpxClient", () => {
  let client: McpxClient;

  afterEach(async () => {
    if (client) await client.close();
  });

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  test("lazy connects on first method call", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    // No explicit connect — listTools triggers it
    const tools = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
  });

  test("close is safe to call multiple times", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    await client.listTools();
    await client.close();
    await client.close(); // should not throw
  });

  test("can reconnect after close", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    await client.listTools();
    await client.close();
    // Should reconnect on next call
    const tools = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Tools
  // ---------------------------------------------------------------------------

  test("listTools returns all tools with server names", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    const tools = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools[0]!.server).toBe("mock");
    expect(tools[0]!.tool.name).toBeDefined();
    const names = tools.map((t) => t.tool.name);
    expect(names).toContain("echo");
    expect(names).toContain("add");
  });

  test("listTools with server filter", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    const tools = await client.listTools("mock");
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.every((t) => t.server === "mock")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Info
  // ---------------------------------------------------------------------------

  test("info returns tool schema", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    const tool = await client.info("mock", "echo");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("echo");
    expect(tool!.inputSchema.properties).toHaveProperty("message");
  });

  test("info returns undefined for unknown tool", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    const tool = await client.info("mock", "nonexistent");
    expect(tool).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Exec
  // ---------------------------------------------------------------------------

  test("exec calls a tool and returns result", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    const result = await client.exec("mock", "echo", { message: "hello SDK" });
    expect(result.content).toBeDefined();
    const text = (result.content as { type: string; text: string }[])[0]!;
    expect(text.text).toBe("hello SDK");
  });

  test("exec with add tool", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    const result = await client.exec("mock", "add", { a: 10, b: 20 });
    const text = (result.content as { type: string; text: string }[])[0]!;
    expect(text.text).toBe("30");
  });

  test("exec with no args", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    const result = await client.exec("mock", "noop");
    const text = (result.content as { type: string; text: string }[])[0]!;
    expect(text.text).toBe("ok");
  });

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  test("validateToolInput succeeds with valid args", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    const result = await client.validateToolInput("mock", "echo", { message: "hi" });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("validateToolInput fails with wrong type", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    const result = await client.validateToolInput("mock", "add", {
      a: "not a number",
      b: "also not a number",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toContain("number");
  });

  test("validateToolInput fails with wrong property name", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    const result = await client.validateToolInput("mock", "echo", {
      wrong_name: "hello",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // Should report missing required field "message"
    expect(result.errors.some((e) => e.message.includes("message"))).toBe(true);
  });

  test("validateToolInput fails with missing required field", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    const result = await client.validateToolInput("mock", "echo", {});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("validateToolInput returns error for unknown tool", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    const result = await client.validateToolInput("mock", "nonexistent", {});
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.message).toContain("Tool not found");
  });

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  test("search throws when no index is available", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    await expect(client.search("something")).rejects.toThrow("No search index found");
  });

  test("keyword search finds tools by name keywords", async () => {
    const searchIndex: SearchIndex = {
      version: 1,
      indexed_at: new Date().toISOString(),
      embedding_model: "test",
      tools: [
        {
          server: "arcade",
          tool: "Slack_SendMessage",
          description: "Send a message to a Slack channel",
          scenarios: ["send a slack message"],
          keywords: ["slack", "send", "message"],
          embedding: [],
          input_schema: { type: "object" },
        },
        {
          server: "arcade",
          tool: "Gmail_SendEmail",
          description: "Send an email via Gmail",
          scenarios: ["send an email"],
          keywords: ["gmail", "send", "email"],
          embedding: [],
          input_schema: { type: "object" },
        },
        {
          server: "github",
          tool: "search_repositories",
          description: "Search for repositories on GitHub",
          scenarios: ["search repos"],
          keywords: ["github", "search", "repositories"],
          embedding: [],
          input_schema: { type: "object" },
        },
      ],
    };

    client = new McpxClient({ servers: makeInlineServers(), searchIndex });

    // "slack" should match only the Slack tool
    const slackResults = await client.search("slack", { keywordOnly: true });
    expect(slackResults.length).toBe(1);
    expect(slackResults[0]!.tool).toBe("Slack_SendMessage");

    // "send" should match both Slack and Gmail
    const sendResults = await client.search("send", { keywordOnly: true });
    expect(sendResults.length).toBe(2);
    const sendTools = sendResults.map((r) => r.tool).sort();
    expect(sendTools).toEqual(["Gmail_SendEmail", "Slack_SendMessage"]);

    // "github" should match the GitHub tool
    const githubResults = await client.search("github", { keywordOnly: true });
    expect(githubResults.length).toBe(1);
    expect(githubResults[0]!.tool).toBe("search_repositories");
  });

  test("keyword search returns empty for unrelated query", async () => {
    const searchIndex: SearchIndex = {
      version: 1,
      indexed_at: new Date().toISOString(),
      embedding_model: "test",
      tools: [
        {
          server: "arcade",
          tool: "Slack_SendMessage",
          description: "Send a message to a Slack channel",
          scenarios: ["send a slack message"],
          keywords: ["slack", "send", "message"],
          embedding: [],
          input_schema: { type: "object" },
        },
      ],
    };

    client = new McpxClient({ servers: makeInlineServers(), searchIndex });
    const results = await client.search("database migration", { keywordOnly: true });
    expect(results.length).toBe(0);
  });

  // Synthetic embeddings with known cosine similarity properties.
  // "messaging" cluster: Slack and Gmail share a similar direction.
  // "code" cluster: GitHub points in a different direction.
  // A "messaging query" vector is close to the messaging cluster.
  // A "code query" vector is close to the code cluster.
  const MESSAGING_DIR = [0.9, 0.3, 0.1, 0.0]; // Slack & Gmail neighborhood
  const CODE_DIR = [0.1, 0.1, 0.9, 0.3]; // GitHub neighborhood

  function makeSemanticIndex(): SearchIndex {
    return {
      version: 1,
      indexed_at: new Date().toISOString(),
      embedding_model: "synthetic-test",
      tools: [
        {
          server: "arcade",
          tool: "Slack_SendMessage",
          description: "Send a message to a Slack channel",
          scenarios: ["send a slack message"],
          keywords: ["slack", "send", "message"],
          embedding: [0.9, 0.35, 0.1, 0.0], // close to MESSAGING_DIR
          input_schema: { type: "object" },
        },
        {
          server: "arcade",
          tool: "Gmail_SendEmail",
          description: "Send an email via Gmail",
          scenarios: ["send an email"],
          keywords: ["gmail", "send", "email"],
          embedding: [0.85, 0.25, 0.15, 0.05], // close to MESSAGING_DIR
          input_schema: { type: "object" },
        },
        {
          server: "github",
          tool: "search_repositories",
          description: "Search for repositories on GitHub",
          scenarios: ["search repos"],
          keywords: ["github", "search", "repositories"],
          embedding: [0.1, 0.15, 0.85, 0.35], // close to CODE_DIR
          input_schema: { type: "object" },
        },
      ],
    };
  }

  test("semantic search ranks messaging tools higher for messaging query", async () => {
    // Mock the embedder to return our synthetic "messaging" query vector
    const { semanticSearch: origSemantic } = await import("../../src/search/semantic.ts");
    const { mock } = await import("bun:test");
    const mod = await import("../../src/search/semantic.ts");
    mock.module("../../src/search/semantic.ts", () => ({
      ...mod,
      generateEmbedding: async () => MESSAGING_DIR,
      cosineSimilarity: mod.cosineSimilarity,
      semanticSearch: mod.semanticSearch,
    }));

    const searchIndex = makeSemanticIndex();
    client = new McpxClient({ servers: makeInlineServers(), searchIndex });
    const results = await client.search("post a chat message", { semanticOnly: true });

    expect(results.length).toBe(3);
    // Slack and Gmail (messaging) should rank above GitHub (code)
    const slackIdx = results.findIndex((r) => r.tool === "Slack_SendMessage");
    const githubIdx = results.findIndex((r) => r.tool === "search_repositories");
    expect(slackIdx).toBeLessThan(githubIdx);

    mock.restore();
  });

  test("semantic search ranks GitHub tool higher for code query", async () => {
    const { mock } = await import("bun:test");
    const mod = await import("../../src/search/semantic.ts");
    mock.module("../../src/search/semantic.ts", () => ({
      ...mod,
      generateEmbedding: async () => CODE_DIR,
      cosineSimilarity: mod.cosineSimilarity,
      semanticSearch: mod.semanticSearch,
    }));

    const searchIndex = makeSemanticIndex();
    client = new McpxClient({ servers: makeInlineServers(), searchIndex });
    const results = await client.search("find open source code projects", {
      semanticOnly: true,
    });

    expect(results.length).toBe(3);
    // GitHub (code) should rank first for a code query
    expect(results[0]!.tool).toBe("search_repositories");

    mock.restore();
  });

  test("combined search merges keyword and semantic results", async () => {
    const { mock } = await import("bun:test");
    const mod = await import("../../src/search/semantic.ts");
    mock.module("../../src/search/semantic.ts", () => ({
      ...mod,
      generateEmbedding: async () => MESSAGING_DIR,
      cosineSimilarity: mod.cosineSimilarity,
      semanticSearch: mod.semanticSearch,
    }));

    const searchIndex = makeSemanticIndex();
    client = new McpxClient({ servers: makeInlineServers(), searchIndex });
    // "slack" matches keyword for Slack, semantic also contributes
    const results = await client.search("slack");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.tool).toBe("Slack_SendMessage");
    expect(results[0]!.matchType).toBe("both");

    mock.restore();
  });

  // ---------------------------------------------------------------------------
  // Resources
  // ---------------------------------------------------------------------------

  test("listResources returns resources", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    const resources = await client.listResources();
    expect(resources.length).toBeGreaterThan(0);
    expect(resources[0]!.server).toBe("mock");
    expect(resources[0]!.resource.uri).toBeDefined();
  });

  test("listResources with server filter", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    const resources = await client.listResources("mock");
    expect(resources.length).toBeGreaterThan(0);
    expect(resources.every((r) => r.server === "mock")).toBe(true);
  });

  test("readResource returns content", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    const result = (await client.readResource("mock", "file:///hello.txt")) as {
      contents: { text: string }[];
    };
    expect(result.contents[0]!.text).toBe("Hello, World!");
  });

  // ---------------------------------------------------------------------------
  // Prompts
  // ---------------------------------------------------------------------------

  test("listPrompts returns prompts", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    const prompts = await client.listPrompts();
    expect(prompts.length).toBeGreaterThan(0);
    const names = prompts.map((p) => p.prompt.name);
    expect(names).toContain("greet");
    expect(names).toContain("summarize");
  });

  test("getPrompt returns prompt messages", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    const result = (await client.getPrompt("mock", "greet", { name: "SDK" })) as {
      messages: { content: { text: string } }[];
    };
    expect(result.messages[0]!.content.text).toBe("Hello, SDK!");
  });

  // ---------------------------------------------------------------------------
  // Server info
  // ---------------------------------------------------------------------------

  test("getServerNames returns configured servers", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    const names = await client.getServerNames();
    expect(names).toEqual(["mock"]);
  });

  test("getServerInfo returns server metadata", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    const info = await client.getServerInfo("mock");
    expect(info.version?.name).toBe("mock-server");
    expect(info.capabilities?.tools).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  test("throws on unknown server", async () => {
    client = new McpxClient({ servers: makeInlineServers() });
    await expect(client.exec("nonexistent", "echo", {})).rejects.toThrow("Unknown server");
  });
});
