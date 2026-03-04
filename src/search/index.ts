import type { SearchIndex } from "../config/schemas.ts";
import { keywordSearch } from "./keyword.ts";
import { semanticSearch } from "./semantic.ts";

export interface SearchResult {
  server: string;
  tool: string;
  description: string;
  score: number;
  matchType: "keyword" | "semantic" | "both";
}

export interface SearchOptions {
  keywordOnly?: boolean;
  semanticOnly?: boolean;
  topK?: number;
}

/** Search tools using keyword and/or semantic matching */
export async function search(
  query: string,
  index: SearchIndex,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const topK = options.topK ?? 10;
  const results = new Map<string, SearchResult>();

  const runKeyword = !options.semanticOnly;
  const runSemantic = !options.keywordOnly;

  // Keyword search
  if (runKeyword) {
    const matches = keywordSearch(query, index.tools);
    for (const m of matches) {
      const key = `${m.server}/${m.tool}`;
      results.set(key, {
        server: m.server,
        tool: m.tool,
        description: m.description,
        score: m.score,
        matchType: "keyword",
      });
    }
  }

  // Semantic search
  if (runSemantic && index.tools.some((t) => t.embedding.length > 0)) {
    const matches = await semanticSearch(query, index.tools, topK);
    for (const m of matches) {
      const key = `${m.server}/${m.tool}`;
      const existing = results.get(key);
      if (existing) {
        // Combine scores: keyword 0.4 + semantic 0.6
        existing.score = existing.score * 0.4 + m.score * 0.6;
        existing.matchType = "both";
      } else {
        results.set(key, {
          server: m.server,
          tool: m.tool,
          description: m.description,
          score: m.score,
          matchType: "semantic",
        });
      }
    }
  }

  return [...results.values()].sort((a, b) => b.score - a.score).slice(0, topK);
}
