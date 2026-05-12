import { logger } from "./output/logger.ts";

export interface Closeable {
	close(): Promise<void>;
}

export class ExitError extends Error {
	constructor(
		public readonly code: number,
		message?: string,
	) {
		super(message);
		this.name = "ExitError";
	}
}

const registry = new Set<Closeable>();
let shuttingDown = false;

export function register(c: Closeable): void {
	registry.add(c);
}

export function unregister(c: Closeable): void {
	registry.delete(c);
}

const HARD_TIMEOUT_MS = 8000;

async function runShutdown(exitCode: number): Promise<never> {
	if (shuttingDown) {
		process.exit(exitCode);
	}
	shuttingDown = true;

	const closeAll = Promise.allSettled([...registry].map((c) => c.close()));
	await Promise.race([closeAll, new Promise<void>((resolve) => setTimeout(resolve, HARD_TIMEOUT_MS).unref())]);
	process.exit(exitCode);
}

let installed = false;

export function installSignalHandlers(): void {
	if (installed) return;
	installed = true;

	process.on("SIGINT", () => {
		void runShutdown(130);
	});
	process.on("SIGTERM", () => {
		void runShutdown(143);
	});
	process.on("SIGHUP", () => {
		void runShutdown(129);
	});
	process.on("uncaughtException", (err) => {
		logger.error(`uncaught exception: ${err?.stack ?? String(err)}`);
		void runShutdown(1);
	});
	process.on("unhandledRejection", (reason) => {
		const detail = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
		logger.error(`unhandled rejection: ${detail}`);
		void runShutdown(1);
	});
}
