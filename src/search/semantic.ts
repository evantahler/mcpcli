import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import wasmMjsPath from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs" with {
	type: "file",
};
import wasmBinPath from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm" with {
	type: "file",
};
import type { IndexedTool } from "../config/schemas.ts";
import { DEFAULTS, EMBEDDING_MODEL } from "../constants.ts";
import { EMBEDDED_MODEL_FILES } from "./embedded-model.ts";
import type { BaseMatch } from "./types.ts";

// Copy bundled model files into the user's cache dir on first run. Once present,
// transformers' default FileCache picks them up — no network fetch required.
// We use readFileSync + writeFileSync (rather than copyFileSync) because in a
// `bun build --compile` binary the source paths live under the `/$bunfs`
// virtual filesystem; `copyFileSync` can't bridge that boundary, but readFile
// can.
function installEmbeddedModel(cacheDir: string): void {
	for (const { asset, relPath } of EMBEDDED_MODEL_FILES) {
		const dest = join(cacheDir, EMBEDDING_MODEL.REPO, relPath);
		if (existsSync(dest)) continue;
		mkdirSync(dirname(dest), { recursive: true });
		writeFileSync(dest, readFileSync(asset));
	}
}

export type SemanticMatch = BaseMatch;

// Lazy-loaded pipeline singleton
let pipelineInstance: ((text: string) => Promise<Float32Array>) | null = null;

/** Get or create the embedding pipeline */
async function getEmbedder(): Promise<(text: string) => Promise<Float32Array>> {
	if (pipelineInstance) return pipelineInstance;

	const transformers = await import("@huggingface/transformers");

	// transformers.js is patched (see patches/@huggingface%2Ftransformers@4.2.0.patch) to
	// force the WASM backend instead of onnxruntime-node — the native bindings can't be
	// bundled into the Bun --compile single binary. Pin the WASM loader to the local
	// onnxruntime-web copy so embeddings work offline and the .wasm ships inside the binary.
	const ortWasm = transformers.env.backends.onnx?.wasm;
	if (ortWasm) {
		// Bun's `with { type: "file" }` returns absolute filesystem paths; the
		// transformers WASM loader passes them through `fetch()`, which requires
		// a URL scheme. Convert paths to `file://` URLs.
		const toFileUrl = (p: string) => (p.startsWith("file://") ? p : `file://${p}`);
		ortWasm.wasmPaths = {
			mjs: toFileUrl(wasmMjsPath),
			wasm: toFileUrl(wasmBinPath),
		};
		ortWasm.numThreads = 1;
		ortWasm.proxy = false;
	}

	// Inside a `bun build --compile` binary, `import.meta.url` resolves under the
	// read-only `/$bunfs` virtual filesystem, so transformers' default cacheDir
	// becomes unwritable. Redirect cache to the user's home and seed it with the
	// embedded model files so the first run works offline.
	const userCacheDir = join(homedir(), ".cache", "mcpx", "transformers");
	transformers.env.cacheDir = userCacheDir;
	transformers.env.localModelPath = join(userCacheDir, "models");
	installEmbeddedModel(userCacheDir);

	// WASM device defaults to q8 quantization, which gives near-identical
	// embedding quality at ~25% the model size (≈22 MB vs ≈86 MB for fp32).
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
