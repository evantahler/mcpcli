import picomatch from "picomatch";
import type { IndexedTool } from "../config/schemas.ts";

export interface KeywordMatch {
  server: string;
  tool: string;
  description: string;
  score: number;
  matchedField: string;
}

interface FieldWeight {
  field: string;
  weight: number;
  values: (t: IndexedTool) => string[];
}

const FIELDS: FieldWeight[] = [
  { field: "name", weight: 1.0, values: (t) => [t.tool] },
  { field: "keyword", weight: 0.8, values: (t) => t.keywords },
  { field: "scenario", weight: 0.6, values: (t) => t.scenarios },
  { field: "description", weight: 0.4, values: (t) => [t.description] },
];

/** Check if query looks like a glob pattern */
function isGlob(query: string): boolean {
  return /[*?[\]{}]/.test(query);
}

/** Search indexed tools by keyword/glob matching */
export function keywordSearch(query: string, tools: IndexedTool[]): KeywordMatch[] {
  const queryLower = query.toLowerCase();
  const tokens = queryLower.split(/\s+/).filter(Boolean);

  // If any token is a glob, use picomatch for name matching
  const globTokens = tokens.filter(isGlob);
  const textTokens = tokens.filter((t) => !isGlob(t));
  const globMatcher = globTokens.length > 0 ? picomatch(globTokens, { nocase: true }) : null;

  const results: KeywordMatch[] = [];

  for (const tool of tools) {
    let bestScore = 0;
    let bestField = "";

    // Glob matching against tool name
    if (globMatcher && globMatcher(tool.tool)) {
      bestScore = 1.0;
      bestField = "name";
    }

    // Text token matching against all fields
    if (textTokens.length > 0) {
      for (const { field, weight, values } of FIELDS) {
        const fieldValues = values(tool).map((v) => v.toLowerCase());
        let matchCount = 0;

        for (const token of textTokens) {
          if (fieldValues.some((v) => v.includes(token))) {
            matchCount++;
          }
        }

        if (matchCount > 0) {
          const score = (matchCount / textTokens.length) * weight;
          if (score > bestScore) {
            bestScore = score;
            bestField = field;
          }
        }
      }
    }

    if (bestScore > 0) {
      results.push({
        server: tool.server,
        tool: tool.tool,
        description: tool.description,
        score: bestScore,
        matchedField: bestField,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
