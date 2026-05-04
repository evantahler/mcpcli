// Embedded copies of the embedding model files.
//
// `bun run scripts/fetch-embedding-model.ts` (run via the `prebuild` hook)
// downloads the files into `assets/embedding-model/`. Bun's
// `with { type: "file" }` then embeds each one into the compiled binary so
// indexing works offline immediately without a first-run download.
//
// Note: ECMAScript `import` specifiers must be string literals — they cannot
// be interpolated from constants. Keeping the asset directory model-agnostic
// (`assets/embedding-model/...` rather than `assets/embedding-model/<repo>/...`)
// means the model name only appears in `EMBEDDING_MODEL.REPO` in
// `src/constants.ts`, which remains the single source of truth.

import configAsset from "../../assets/embedding-model/config.json" with { type: "file" };
import onnxAsset from "../../assets/embedding-model/onnx/model_quantized.onnx" with { type: "file" };
import tokenizerAsset from "../../assets/embedding-model/tokenizer.json" with { type: "file" };
import tokenizerConfigAsset from "../../assets/embedding-model/tokenizer_config.json" with { type: "file" };

// `with { type: "file" }` returns a path string at runtime, but TypeScript
// infers JSON files as parsed JSON objects — cast those through `unknown` to
// string. (`*.onnx` is typed as a string via `src/types/file-imports.d.ts`.)
export const EMBEDDED_MODEL_FILES: ReadonlyArray<{ asset: string; relPath: string }> = [
	{ asset: configAsset as unknown as string, relPath: "config.json" },
	{ asset: tokenizerAsset as unknown as string, relPath: "tokenizer.json" },
	{ asset: tokenizerConfigAsset as unknown as string, relPath: "tokenizer_config.json" },
	{ asset: onnxAsset, relPath: "onnx/model_quantized.onnx" },
];
