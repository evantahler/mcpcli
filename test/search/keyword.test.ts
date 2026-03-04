import { describe, test, expect } from "bun:test";
import { keywordSearch } from "../../src/search/keyword.ts";
import type { IndexedTool } from "../../src/config/schemas.ts";

const tools: IndexedTool[] = [
  {
    server: "arcade",
    tool: "Gmail_SendEmail",
    description: "Send an email message via Gmail",
    scenarios: ["send an email", "compose a message"],
    keywords: ["gmail", "send", "email"],
    embedding: [],
  },
  {
    server: "arcade",
    tool: "Slack_SendMessage",
    description: "Send a message to a Slack channel",
    scenarios: ["send a slack message", "post to channel"],
    keywords: ["slack", "send", "message"],
    embedding: [],
  },
  {
    server: "arcade",
    tool: "Github_CreatePullRequest",
    description: "Create a pull request on GitHub",
    scenarios: ["create a PR", "open a pull request"],
    keywords: ["github", "create", "pull", "request"],
    embedding: [],
  },
];

describe("keywordSearch", () => {
  test("matches tool name substring", () => {
    const results = keywordSearch("gmail", tools);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.tool).toBe("Gmail_SendEmail");
  });

  test("matches keywords", () => {
    const results = keywordSearch("send", tools);
    expect(results.length).toBe(2);
    expect(results.map((r) => r.tool)).toContain("Gmail_SendEmail");
    expect(results.map((r) => r.tool)).toContain("Slack_SendMessage");
  });

  test("matches description text", () => {
    const results = keywordSearch("pull request", tools);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.tool).toBe("Github_CreatePullRequest");
  });

  test("glob matching on tool name", () => {
    const results = keywordSearch("Gmail_*", tools);
    expect(results.length).toBe(1);
    expect(results[0]!.tool).toBe("Gmail_SendEmail");
  });

  test("case insensitive", () => {
    const results = keywordSearch("SLACK", tools);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.tool).toBe("Slack_SendMessage");
  });

  test("returns empty for no match", () => {
    const results = keywordSearch("zzzznotfound", tools);
    expect(results.length).toBe(0);
  });

  test("results sorted by score descending", () => {
    const results = keywordSearch("send", tools);
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.score).toBeLessThanOrEqual(results[i - 1]!.score);
    }
  });

  test("multi-word query matches better", () => {
    const results = keywordSearch("send email", tools);
    expect(results[0]!.tool).toBe("Gmail_SendEmail");
  });
});
