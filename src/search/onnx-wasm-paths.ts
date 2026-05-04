// Embed the onnxruntime-web WASM runtime files into the compiled binary
// (`bun build --compile`) so they survive in a single-binary distribution
// where the user has no node_modules.
//
// This file is loaded **dynamically** by semantic.ts. The relative paths
// only resolve in the local repo / compiled binary; for npm/bun-installed
// mcpx the parent directory layout is different (deps are hoisted), the
// dynamic import throws, and we fall back to letting transformers.js
// load WASM via its default mechanism — which works fine because in
// that environment node_modules exists and onnxruntime-web is reachable
// through normal module resolution.

import wasmMjsPath from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs" with {
	type: "file",
};
import wasmBinPath from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm" with {
	type: "file",
};

export { wasmBinPath, wasmMjsPath };
