// Type declarations for Bun's `import ... with { type: "file" }` asset embedding.
// TS doesn't natively know how to resolve `.wasm` or `.mjs` modules, so we
// declare them as default-exporting strings (Bun returns the embedded file's
// runtime path).

declare module "*.wasm" {
	const path: string;
	export default path;
}

declare module "*.mjs" {
	const path: string;
	export default path;
}
