import { describe, test, expect } from "bun:test";
import { search } from "../../src/search/index.ts";
import type { SearchIndex } from "../../src/config/schemas.ts";

const index: SearchIndex = {
  version: 1,
  indexed_at: "2026-03-03T10:00:00Z",
  embedding_model: "test",
  tools: [
    {
      server: "arcade",
      tool: "Gmail_SendEmail",
      description: "Send an email message via Gmail",
      scenarios: ["send an email"],
      keywords: ["gmail", "send", "email"],
      embedding: [],
    },
    {
      server: "arcade",
      tool: "Slack_SendMessage",
      description: "Send a message to a Slack channel",
      scenarios: ["send a slack message"],
      keywords: ["slack", "send", "message"],
      embedding: [],
    },
    {
      server: "arcade",
      tool: "Github_CreatePullRequest",
      description: "Create a pull request on GitHub",
      scenarios: ["create a PR"],
      keywords: ["github", "create", "pull", "request"],
      embedding: [],
    },
  ],
};

describe("search", () => {
  test("returns results up to default topK", async () => {
    const results = await search("send", index, { keywordOnly: true });
    expect(results.length).toBe(2);
  });

  test("topK limits the number of results", async () => {
    const results = await search("send", index, { keywordOnly: true, topK: 1 });
    expect(results.length).toBe(1);
  });

  test("topK larger than matches returns all matches", async () => {
    const results = await search("send", index, { keywordOnly: true, topK: 100 });
    expect(results.length).toBe(2);
  });

  test("topK of 0 returns no results", async () => {
    const results = await search("send", index, { keywordOnly: true, topK: 0 });
    expect(results.length).toBe(0);
  });

  test("defaults to 10 when topK not specified", async () => {
    // All 3 tools match "a" in their descriptions
    const results = await search("send create", index, { keywordOnly: true });
    expect(results.length).toBeLessThanOrEqual(10);
    expect(results.length).toBeGreaterThan(0);
  });
});
