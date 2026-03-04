import { describe, test, expect } from "bun:test";
import { extractKeywords, generateScenarios } from "../../src/search/indexer.ts";

describe("extractKeywords", () => {
  test("splits on underscores", () => {
    expect(extractKeywords("Gmail_SendEmail")).toEqual(["gmail", "send", "email"]);
  });

  test("splits camelCase", () => {
    expect(extractKeywords("sendMessage")).toEqual(["send", "message"]);
  });

  test("splits on hyphens", () => {
    expect(extractKeywords("create-pull-request")).toEqual(["create", "pull", "request"]);
  });

  test("filters single-char words", () => {
    expect(extractKeywords("a_Send_b")).toEqual(["send"]);
  });
});

describe("generateScenarios", () => {
  test("includes description when short", () => {
    const scenarios = generateScenarios("SendEmail", "Send an email via Gmail");
    expect(scenarios).toContain("Send an email via Gmail");
  });

  test("includes keyword phrase from name", () => {
    const scenarios = generateScenarios("Gmail_SendEmail", "Send an email");
    expect(scenarios.some((s) => s.includes("gmail"))).toBe(true);
  });
});
