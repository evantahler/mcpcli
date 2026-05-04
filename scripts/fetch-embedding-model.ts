#!/usr/bin/env bun
// Pre-download the embedding model into ./assets/embedding-model/ so the build
// step can embed it into the compiled binary via Bun's `with { type: "file" }`
// asset imports. Run as a `prebuild` hook.

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { EMBEDDING_MODEL } from "../src/constants.ts";

const FILES = ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"];

const ASSETS_DIR = join(import.meta.dir, "..", "assets", "embedding-model");

async function downloadFile(file: string): Promise<void> {
	const dest = join(ASSETS_DIR, file);
	if (existsSync(dest)) return;

	const url = `https://huggingface.co/${EMBEDDING_MODEL.REPO}/resolve/${EMBEDDING_MODEL.REVISION}/${file}`;
	console.log(`  fetch ${file}`);
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);

	mkdirSync(dirname(dest), { recursive: true });
	const buf = new Uint8Array(await res.arrayBuffer());
	await Bun.write(dest, buf);
}

async function main(): Promise<void> {
	console.log(
		`Fetching embedding model ${EMBEDDING_MODEL.REPO}@${EMBEDDING_MODEL.REVISION} into assets/embedding-model/`,
	);
	for (const file of FILES) {
		await downloadFile(file);
	}
	console.log("Embedding model assets ready.");
}

await main();
