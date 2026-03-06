import type { ServerManager, ToolWithServer } from "../client/manager.ts";
import type { SearchIndex, IndexedTool } from "../config/schemas.ts";
import { generateEmbedding } from "./semantic.ts";
import { logger } from "../output/logger.ts";

/** Extract keywords from a tool name by splitting on separators and camelCase */
export function extractKeywords(name: string): string[] {
  // Split on underscores, hyphens, dots
  const parts = name.split(/[_\-.]+/);

  // Also split camelCase
  const words: string[] = [];
  for (const part of parts) {
    words.push(...part.replace(/([a-z])([A-Z])/g, "$1 $2").split(/\s+/));
  }

  return words.map((w) => w.toLowerCase()).filter((w) => w.length > 1);
}

/** Generate scenario phrases from tool name and description */
export function generateScenarios(name: string, description: string): string[] {
  const scenarios: string[] = [];

  // Use description as-is if short enough
  if (description && description.length < 200) {
    scenarios.push(description);
  }

  // Extract action + noun from tool name (e.g., "SendMessage" → "send a message")
  const keywords = extractKeywords(name);
  if (keywords.length >= 2) {
    scenarios.push(keywords.join(" "));
  }

  return scenarios;
}

/** Build an IndexedTool from a tool with server info */
async function indexTool(t: ToolWithServer): Promise<IndexedTool> {
  const description = t.tool.description ?? "";
  const keywords = extractKeywords(t.tool.name);
  const scenarios = generateScenarios(t.tool.name, description);

  // Build text for embedding: combine name, description, and scenarios
  const embeddingText = [t.tool.name, description, ...scenarios].filter(Boolean).join(" ");
  const embedding = await generateEmbedding(embeddingText);

  return {
    server: t.server,
    tool: t.tool.name,
    description,
    input_schema: t.tool.inputSchema,
    scenarios,
    keywords,
    embedding,
  };
}

export interface IndexProgress {
  total: number;
  current: number;
  tool: string;
}

/** Build a search index from all configured servers */
export async function buildSearchIndex(
  manager: ServerManager,
  onProgress?: (progress: IndexProgress) => void,
): Promise<SearchIndex> {
  const { tools, errors } = await manager.getAllTools();

  if (errors.length > 0) {
    for (const err of errors) {
      logger.warn(`${err.server}: ${err.message}`);
    }
  }

  const indexed: IndexedTool[] = [];

  for (let i = 0; i < tools.length; i++) {
    const t = tools[i]!;
    onProgress?.({ total: tools.length, current: i + 1, tool: `${t.server}/${t.tool.name}` });
    indexed.push(await indexTool(t));
  }

  return {
    version: 1,
    indexed_at: new Date().toISOString(),
    embedding_model: "Xenova/all-MiniLM-L6-v2",
    tools: indexed,
  };
}
