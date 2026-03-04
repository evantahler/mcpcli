import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";
import { mkdtemp, rm } from "fs/promises";

const CLI = join(import.meta.dir, "../../src/cli.ts");

async function run(args: string[], cwd?: string) {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    cwd,
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { exitCode, stdout, stderr };
}

describe("mcpcli add", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "mcpcli-add-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  test("adds a stdio server", async () => {
    const { exitCode, stdout } = await run([
      "-c",
      tmpDir,
      "add",
      "test-server",
      "--command",
      "echo",
      "--args",
      "hello,world",
      "--no-index",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Added server "test-server"');

    const servers = await Bun.file(join(tmpDir, "servers.json")).json();
    expect(servers.mcpServers["test-server"]).toEqual({
      command: "echo",
      args: ["hello", "world"],
    });
  });

  test("adds an http server", async () => {
    const { exitCode } = await run([
      "-c",
      tmpDir,
      "add",
      "my-api",
      "--url",
      "https://example.com/mcp",
      "--header",
      "Authorization:Bearer tok123",
      "--no-index",
    ]);
    expect(exitCode).toBe(0);

    const servers = await Bun.file(join(tmpDir, "servers.json")).json();
    expect(servers.mcpServers["my-api"]).toEqual({
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer tok123" },
    });
  });

  test("adds a stdio server with env and cwd", async () => {
    const { exitCode } = await run([
      "-c",
      tmpDir,
      "add",
      "full-server",
      "--command",
      "node",
      "--args",
      "index.js",
      "--env",
      "KEY=val,FOO=bar",
      "--cwd",
      "/tmp",
      "--no-index",
    ]);
    expect(exitCode).toBe(0);

    const servers = await Bun.file(join(tmpDir, "servers.json")).json();
    expect(servers.mcpServers["full-server"]).toEqual({
      command: "node",
      args: ["index.js"],
      env: { KEY: "val", FOO: "bar" },
      cwd: "/tmp",
    });
  });

  test("adds a server with allowed and disabled tools", async () => {
    const { exitCode } = await run([
      "-c",
      tmpDir,
      "add",
      "filtered",
      "--command",
      "echo",
      "--allowed-tools",
      "read,write",
      "--disabled-tools",
      "delete",
      "--no-index",
    ]);
    expect(exitCode).toBe(0);

    const servers = await Bun.file(join(tmpDir, "servers.json")).json();
    expect(servers.mcpServers["filtered"].allowedTools).toEqual(["read", "write"]);
    expect(servers.mcpServers["filtered"].disabledTools).toEqual(["delete"]);
  });

  test("errors if server already exists without --force", async () => {
    await run(["-c", tmpDir, "add", "dupe", "--command", "echo", "--no-index"]);
    const { exitCode, stderr } = await run([
      "-c",
      tmpDir,
      "add",
      "dupe",
      "--command",
      "cat",
      "--no-index",
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("already exists");
  });

  test("overwrites with --force", async () => {
    await run(["-c", tmpDir, "add", "dupe", "--command", "echo", "--no-index"]);
    const { exitCode } = await run([
      "-c",
      tmpDir,
      "add",
      "dupe",
      "--command",
      "cat",
      "--force",
      "--no-index",
    ]);
    expect(exitCode).toBe(0);

    const servers = await Bun.file(join(tmpDir, "servers.json")).json();
    expect(servers.mcpServers["dupe"].command).toBe("cat");
  });

  test("errors if neither --command nor --url", async () => {
    const { exitCode, stderr } = await run(["-c", tmpDir, "add", "bad"]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("Must specify --command");
  });

  test("errors if both --command and --url", async () => {
    const { exitCode, stderr } = await run([
      "-c",
      tmpDir,
      "add",
      "bad",
      "--command",
      "echo",
      "--url",
      "https://example.com",
      "--no-index",
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("Cannot specify both");
  });
});

describe("mcpcli remove", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "mcpcli-rm-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  test("removes a server", async () => {
    await run(["-c", tmpDir, "add", "to-remove", "--command", "echo", "--no-index"]);
    const { exitCode, stdout } = await run(["-c", tmpDir, "remove", "to-remove"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Removed server "to-remove"');

    const servers = await Bun.file(join(tmpDir, "servers.json")).json();
    expect(servers.mcpServers["to-remove"]).toBeUndefined();
  });

  test("errors on unknown server", async () => {
    const { exitCode, stderr } = await run(["-c", tmpDir, "remove", "nope"]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('Unknown server: "nope"');
  });

  test("dry-run shows what would happen without changing files", async () => {
    await run(["-c", tmpDir, "add", "keep-me", "--command", "echo", "--no-index"]);
    const { exitCode, stdout } = await run(["-c", tmpDir, "remove", "keep-me", "--dry-run"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Would remove");

    const servers = await Bun.file(join(tmpDir, "servers.json")).json();
    expect(servers.mcpServers["keep-me"]).toBeDefined();
  });

  test("removes auth by default", async () => {
    // Add a server, then manually write auth for it
    await run(["-c", tmpDir, "add", "authed", "--url", "https://example.com", "--no-index"]);
    await Bun.write(
      join(tmpDir, "auth.json"),
      JSON.stringify({
        authed: {
          tokens: { access_token: "tok", token_type: "bearer" },
        },
      }),
    );

    const { exitCode, stdout } = await run(["-c", tmpDir, "remove", "authed"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Removed auth");

    const auth = await Bun.file(join(tmpDir, "auth.json")).json();
    expect(auth.authed).toBeUndefined();
  });

  test("--keep-auth preserves auth", async () => {
    await run(["-c", tmpDir, "add", "authed", "--url", "https://example.com", "--no-index"]);
    await Bun.write(
      join(tmpDir, "auth.json"),
      JSON.stringify({
        authed: {
          tokens: { access_token: "tok", token_type: "bearer" },
        },
      }),
    );

    const { exitCode, stdout } = await run(["-c", tmpDir, "remove", "authed", "--keep-auth"]);
    expect(exitCode).toBe(0);
    expect(stdout).not.toContain("Removed auth");

    const auth = await Bun.file(join(tmpDir, "auth.json")).json();
    expect(auth.authed).toBeDefined();
  });
});
