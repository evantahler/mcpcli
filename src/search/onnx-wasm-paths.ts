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

// The relative `../../node_modules/...` paths only resolve from the local repo
// layout (and inside `bun build --compile`). When this file is shipped via npm,
// deps are hoisted, so consumer `tsc` runs hit TS2307. The `ts-ignore` directive
// below silences that for consumers; we avoid the stricter `expect-error` form
// because in the local repo the path resolves fine and there would be no error
// to expect. At runtime the dynamic import in semantic.ts is wrapped in
// try/catch and falls back to transformers.js's default WASM loader (issue #85).
// biome-ignore lint/suspicious/noTsIgnore: must stay as ts-ignore per comment above
// @ts-ignore - dynamic-only import
import wasmMjsPath from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs" with {
	type: "file",
};
// biome-ignore lint/suspicious/noTsIgnore: must stay as ts-ignore per comment above
// @ts-ignore - dynamic-only import
import wasmBinPath from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm" with {
	type: "file",
};

export { wasmBinPath, wasmMjsPath };
