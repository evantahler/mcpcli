import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { loadConfig, saveAuth, saveSearchIndex } from "../../src/config/loader.ts";
import { tmpdir } from "os";
import { mkdtemp, rm } from "fs/promises";

const FIXTURES_DIR = join(import.meta.dir, "../fixtures");

describe("loadConfig", () => {
  test("loads all three config files from a directory", async () => {
    process.env.TEST_API_KEY = "test-key";
    process.env.TEST_TOKEN = "test-token";

    const config = await loadConfig({ configFlag: FIXTURES_DIR });

    expect(config.configDir).toBe(FIXTURES_DIR);
    expect(Object.keys(config.servers.mcpServers)).toEqual(["filesystem", "github", "internal"]);
    expect(config.auth.github).toBeDefined();
    expect(config.auth.github!.tokens.access_token).toBe("gho_test123");
    expect(config.searchIndex.tools).toHaveLength(1);
    expect(config.searchIndex.tools[0]!.tool).toBe("search_repositories");

    delete process.env.TEST_API_KEY;
    delete process.env.TEST_TOKEN;
  });

  test("interpolates env vars in server configs", async () => {
    process.env.TEST_API_KEY = "my-api-key";
    process.env.TEST_TOKEN = "my-token";

    const config = await loadConfig({ configFlag: FIXTURES_DIR });
    const fs = config.servers.mcpServers.filesystem!;
    expect("env" in fs && fs.env?.API_KEY).toBe("my-api-key");

    const internal = config.servers.mcpServers.internal!;
    expect("headers" in internal && internal.headers?.Authorization).toBe("Bearer my-token");

    delete process.env.TEST_API_KEY;
    delete process.env.TEST_TOKEN;
  });

  test("returns empty defaults when no config files exist", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "mcpcli-test-"));
    try {
      const config = await loadConfig({ configFlag: tmpDir });
      expect(Object.keys(config.servers.mcpServers)).toHaveLength(0);
      expect(Object.keys(config.auth)).toHaveLength(0);
      expect(config.searchIndex.tools).toHaveLength(0);
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  test("uses MCP_CONFIG_PATH env var", async () => {
    process.env.MCP_CONFIG_PATH = FIXTURES_DIR;
    process.env.TEST_API_KEY = "x";
    process.env.TEST_TOKEN = "x";

    const config = await loadConfig();
    expect(Object.keys(config.servers.mcpServers).length).toBeGreaterThan(0);

    delete process.env.MCP_CONFIG_PATH;
    delete process.env.TEST_API_KEY;
    delete process.env.TEST_TOKEN;
  });
});

describe("validateServersFile", () => {
  test("rejects missing mcpServers key", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "mcpcli-test-"));
    try {
      await Bun.write(join(tmpDir, "servers.json"), JSON.stringify({ wrong: "shape" }));
      await expect(loadConfig({ configFlag: tmpDir })).rejects.toThrow("mcpServers");
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  test("accepts valid transport values", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "mcpcli-test-"));
    try {
      await Bun.write(
        join(tmpDir, "servers.json"),
        JSON.stringify({
          mcpServers: {
            sse: { url: "https://example.com/sse", transport: "sse" },
            streamable: { url: "https://example.com/mcp", transport: "streamable-http" },
            auto: { url: "https://example.com/mcp" },
          },
        }),
      );
      const config = await loadConfig({ configFlag: tmpDir });
      expect(Object.keys(config.servers.mcpServers)).toEqual(["sse", "streamable", "auto"]);
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  test("rejects invalid transport value", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "mcpcli-test-"));
    try {
      await Bun.write(
        join(tmpDir, "servers.json"),
        JSON.stringify({
          mcpServers: { bad: { url: "https://example.com", transport: "websocket" } },
        }),
      );
      await expect(loadConfig({ configFlag: tmpDir })).rejects.toThrow("invalid transport");
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  test("rejects server without command or url", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "mcpcli-test-"));
    try {
      await Bun.write(
        join(tmpDir, "servers.json"),
        JSON.stringify({ mcpServers: { bad: { name: "nope" } } }),
      );
      await expect(loadConfig({ configFlag: tmpDir })).rejects.toThrow(
        'must have either "command"',
      );
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });
});

describe("saveAuth / saveSearchIndex", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "mcpcli-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  test("saves and reloads auth.json", async () => {
    await saveAuth(tmpDir, {
      test: {
        tokens: { access_token: "abc", token_type: "bearer" },
        expires_at: "2099-01-01T00:00:00Z",
      },
    });

    const raw = await Bun.file(join(tmpDir, "auth.json")).json();
    expect(raw.test.tokens.access_token).toBe("abc");
  });

  test("saves and reloads search.json", async () => {
    await saveSearchIndex(tmpDir, {
      version: 1,
      indexed_at: "2026-01-01T00:00:00Z",
      embedding_model: "claude",
      tools: [
        {
          server: "s",
          tool: "t",
          description: "d",
          scenarios: [],
          keywords: [],
          embedding: [],
        },
      ],
    });

    const raw = await Bun.file(join(tmpDir, "search.json")).json();
    expect(raw.tools).toHaveLength(1);
    expect(raw.tools[0].server).toBe("s");
  });
});
