import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// `src/search/semantic.ts` requests `device: "wasm"` from @huggingface/transformers,
// which only works once the patch in `patches/` has been applied. The patch is
// normally applied by `prebuild` and CI; apply it here so plain `bun test` works
// out of the box. The script is idempotent (skips if its marker file exists).
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const marker = join(repoRoot, "node_modules/@huggingface/transformers/.mcpx-transformers-patch-applied");

if (!existsSync(marker)) {
	const result = spawnSync("bash", ["scripts/apply-transformers-patch.sh"], {
		cwd: repoRoot,
		stdio: "inherit",
	});
	if (result.status !== 0) {
		throw new Error(`Failed to apply transformers patch (exit ${result.status})`);
	}
}
