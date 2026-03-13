import { join } from "path";

const CLI = join(import.meta.dir, "../../src/cli.ts");
const CONFIG = join(import.meta.dir, "../fixtures/mock-config");
const CWD = join(import.meta.dir, "../..");

/** Spawn the CLI with the mock config and the given args. */
export function run(...args: string[]) {
  return Bun.spawn(["bun", "run", CLI, "-c", CONFIG, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: CWD,
  });
}

/** Spawn the CLI with the mock config, passing data on stdin. */
export function runWithStdin(stdin: string, ...args: string[]) {
  const proc = Bun.spawn(["bun", "run", CLI, "-c", CONFIG, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "pipe",
    cwd: CWD,
  });
  proc.stdin.write(stdin);
  proc.stdin.end();
  return proc;
}

/** Spawn the CLI with --json flag (for tests that always use JSON output). */
export function runJson(...args: string[]) {
  return run("--json", ...args);
}

export { CLI, CONFIG, CWD };
