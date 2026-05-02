import { describe, expect, test } from "bun:test";
import { cosineSimilarity, generateEmbedding } from "../../src/search/semantic.ts";

describe("cosineSimilarity", () => {
	test("identical vectors return 1", () => {
		const v = [1, 2, 3];
		expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
	});

	test("orthogonal vectors return 0", () => {
		expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0, 5);
	});

	test("opposite vectors return -1", () => {
		expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0, 5);
	});

	test("empty vectors return 0", () => {
		expect(cosineSimilarity([], [])).toBe(0);
	});

	test("mismatched lengths return 0", () => {
		expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
	});

	test("normalized vectors", () => {
		const a = [0.6, 0.8];
		const b = [0.8, 0.6];
		const expected = 0.6 * 0.8 + 0.8 * 0.6; // 0.96
		expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 5);
	});
});

describe("generateEmbedding", () => {
	test("produces a 384-dim normalized vector from the real model", async () => {
		const vec = await generateEmbedding("send an email via gmail");
		expect(Array.isArray(vec)).toBe(true);
		expect(vec.length).toBe(384);
		expect(vec.every((n) => Number.isFinite(n))).toBe(true);

		// pipeline is configured with normalize: true — magnitude should be ~1
		const magnitude = Math.sqrt(vec.reduce((sum, n) => sum + n * n, 0));
		expect(magnitude).toBeCloseTo(1.0, 3);
	}, 120_000);

	test("semantically similar phrases score higher than unrelated ones", async () => {
		const [a, b, c] = await Promise.all([
			generateEmbedding("send an email"),
			generateEmbedding("compose a message and deliver it"),
			generateEmbedding("compile rust source code"),
		]);
		const similar = cosineSimilarity(a, b);
		const unrelated = cosineSimilarity(a, c);
		expect(similar).toBeGreaterThan(unrelated);
	}, 120_000);
});
