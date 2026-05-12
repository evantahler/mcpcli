import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";

const CLI = join(import.meta.dir, "../../src/cli.ts");
const CWD = join(import.meta.dir, "../..");
const TMP_CONFIG = join(import.meta.dir, "../fixtures/_tmp_shutdown_config");

function pidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function findStdioGrandchildPid(parentPid: number, timeoutMs = 5000): Promise<number | undefined> {
	// `bun run src/cli.ts` may either run in-process or spawn a child bun. Walk one
	// level down if the direct child is itself bun.
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const direct = await $`pgrep -P ${parentPid}`.nothrow().quiet();
		if (direct.exitCode === 0) {
			const pids = direct.stdout
				.toString()
				.trim()
				.split("\n")
				.map((s) => parseInt(s, 10))
				.filter((n) => Number.isFinite(n));
			for (const pid of pids) {
				const cmd = (await $`ps -o command= -p ${pid}`.nothrow().quiet()).stdout.toString().trim();
				if (cmd.startsWith("sleep")) return pid;
				// Recurse one level — bun may have forked
				const grand = await $`pgrep -P ${pid}`.nothrow().quiet();
				if (grand.exitCode === 0) {
					const gpids = grand.stdout
						.toString()
						.trim()
						.split("\n")
						.map((s) => parseInt(s, 10))
						.filter((n) => Number.isFinite(n));
					for (const gpid of gpids) {
						const gcmd = (await $`ps -o command= -p ${gpid}`.nothrow().quiet()).stdout.toString().trim();
						if (gcmd.startsWith("sleep")) return gpid;
					}
				}
			}
		}
		await Bun.sleep(50);
	}
	return undefined;
}

async function waitForExit(pid: number, timeoutMs = 5000): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (!pidAlive(pid)) return true;
		await Bun.sleep(50);
	}
	return false;
}

/**
 * Reproduces and guards against the regression where stdio MCP child
 * processes are orphaned when mcpx receives SIGINT / SIGTERM / SIGHUP.
 *
 * We use `sleep` as the stdio "server" — it ignores MCP protocol entirely,
 * so mcpx's connect() hangs (its 30-min internal timeout). While mcpx hangs,
 * the spawned `sleep` child is alive. We then signal mcpx and verify the
 * child has died within a few seconds (the SDK's StdioClientTransport.close
 * does stdin-EOF → SIGTERM → SIGKILL on a 4s ladder, so we wait 6s).
 */
describe("stdio child shutdown on signal", () => {
	beforeAll(async () => {
		await mkdir(TMP_CONFIG, { recursive: true });
		await writeFile(
			join(TMP_CONFIG, "servers.json"),
			JSON.stringify({
				mcpServers: {
					hang: { command: "sleep", args: ["600"] },
				},
			}),
		);
	});

	afterAll(async () => {
		await rm(TMP_CONFIG, { recursive: true, force: true });
	});

	for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
		test(`kills stdio child when mcpx receives ${signal}`, async () => {
			const proc = Bun.spawn(["bun", "run", CLI, "-c", TMP_CONFIG, "ping", "hang"], {
				stdout: "pipe",
				stderr: "pipe",
				cwd: CWD,
			});

			try {
				const childPid = await findStdioGrandchildPid(proc.pid);
				expect(childPid, "mcpx should have spawned a stdio child").toBeDefined();
				expect(pidAlive(childPid!)).toBe(true);

				proc.kill(signal);

				const died = await waitForExit(childPid!, 6000);
				expect(died, `stdio child (pid ${childPid}) should die after mcpx got ${signal}`).toBe(true);
			} finally {
				try {
					proc.kill("SIGKILL");
				} catch {
					// ignore
				}
				await proc.exited;
			}
		}, 20000);
	}
});
