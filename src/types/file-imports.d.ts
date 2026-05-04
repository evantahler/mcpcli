// Type declarations for Bun's `import ... with { type: "file" }` asset embedding.
// TS doesn't natively know how to resolve `.wasm`, `.mjs`, or `.onnx` modules,
// so we declare them as default-exporting strings (Bun returns the embedded
// file's runtime path). JSON files use a cast at the import site instead —
// declaring `*.json` here would override TS's default JSON-object typing for
// `import pkg from "../package.json"` elsewhere.

declare module "*.wasm" {
	const path: string;
	export default path;
}

declare module "*.mjs" {
	const path: string;
	export default path;
}

declare module "*.onnx" {
	const path: string;
	export default path;
}
