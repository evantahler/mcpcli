import { homedir } from "node:os";
import { join } from "node:path";
import type { IndexedTool } from "../config/schemas.ts";
import { DEFAULTS, EMBEDDING_MODEL } from "../constants.ts";
import { logger } from "../output/logger.ts";
import type { BaseMatch } from "./types.ts";

export type SemanticMatch = BaseMatch;

// Lazy-loaded pipeline singleton
let pipelineInstance: ((text: string) => Promise<Float32Array>) | null = null;

/** Get or create the embedding pipeline */
async function getEmbedder(): Promise<(text: string) => Promise<Float32Array>> {
	if (pipelineInstance) return pipelineInstance;

	const transformers = await import("@huggingface/transformers");

	// transformers.js is patched (see patches/@huggingface%2Ftransformers@4.2.0.patch,
	// applied by `bun run scripts/apply-transformers-patch.sh` during prebuild) to
	// force the WASM backend instead of onnxruntime-node — the native bindings can't
	// be bundled into the Bun --compile single binary.
	const ortWasm = transformers.env.backends.onnx?.wasm;
	if (ortWasm) {
		ortWasm.numThreads = 1;
		ortWasm.proxy = false;

		// For the compiled binary, embed the onnxruntime-web .wasm/.mjs files via
		// Bun's `with { type: "file" }` and point the loader at them. The dynamic
		// import is wrapped in a try because the asset paths only resolve in the
		// local repo / compiled binary; for npm/bun-installed mcpx the deps are
		// hoisted to a different layout, the import throws, and transformers.js
		// loads WASM via its default mechanism (which works because node_modules
		// is reachable in that environment).
		try {
			const { wasmMjsPath, wasmBinPath } = await import("./onnx-wasm-paths.ts");
			const toFileUrl = (p: string) => (p.startsWith("file://") ? p : `file://${p}`);
			ortWasm.wasmPaths = {
				mjs: toFileUrl(wasmMjsPath),
				wasm: toFileUrl(wasmBinPath),
			};
		} catch (err) {
			logger.debug(`Bundled onnxruntime-web assets not found, using default loader: ${err}`);
		}
	}

	// Inside a `bun build --compile` binary, `import.meta.url` resolves under the
	// read-only `/$bunfs` virtual filesystem, so transformers' default cacheDir
	// becomes unwritable. Redirect cache to the user's home so model downloads
	// (and any future cached files) land somewhere we can write to.
	const userCacheDir = join(homedir(), ".cache", "mcpx", "transformers");
	transformers.env.cacheDir = userCacheDir;
	transformers.env.localModelPath = join(userCacheDir, "models");

	// WASM device defaults to q8 quantization, which gives near-identical
	// embedding quality at ~25% the model size (≈22 MB vs ≈86 MB for fp32).
	// Both CI and `bun run build` apply the transformers patch first, so
	// wasm is the only supported device in this codepath.
	const extractor = await transformers.pipeline("feature-extraction", EMBEDDING_MODEL.REPO, {
		device: "wasm",
		dtype: "q8",
	});

	pipelineInstance = async (text: string): Promise<Float32Array> => {
		const output = await extractor(text, { pooling: "mean", normalize: true });
		// output.data is a Float32Array of the pooled embedding
		return output.data as Float32Array;
	};

	return pipelineInstance;
}

/** Generate an embedding vector for text */
export async function generateEmbedding(text: string): Promise<number[]> {
	const embed = await getEmbedder();
	const vec = await embed(text);
	return Array.from(vec);
}

/** Cosine similarity between two vectors */
export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 0;

	let dot = 0;
	let magA = 0;
	let magB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i]! * b[i]!;
		magA += a[i]! * a[i]!;
		magB += b[i]! * b[i]!;
	}

	const denom = Math.sqrt(magA) * Math.sqrt(magB);
	return denom === 0 ? 0 : dot / denom;
}

/** Search indexed tools by semantic similarity */
export async function semanticSearch(
	query: string,
	tools: IndexedTool[],
	topK: number = DEFAULTS.SEARCH_TOP_K,
): Promise<SemanticMatch[]> {
	// Only search tools that have embeddings
	const withEmbeddings = tools.filter((t) => t.embedding.length > 0);
	if (withEmbeddings.length === 0) return [];

	const queryEmbedding = await generateEmbedding(query);

	const scored = withEmbeddings.map((tool) => ({
		server: tool.server,
		tool: tool.tool,
		description: tool.description,
		score: cosineSimilarity(queryEmbedding, tool.embedding),
	}));

	return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}
