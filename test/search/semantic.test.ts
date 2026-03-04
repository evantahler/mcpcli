import { describe, test, expect } from "bun:test";
import { cosineSimilarity } from "../../src/search/semantic.ts";

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
