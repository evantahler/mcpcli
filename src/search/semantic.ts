import type { IndexedTool } from "../config/schemas.ts";

export interface SemanticMatch {
  server: string;
  tool: string;
  description: string;
  score: number;
}

// Lazy-loaded pipeline singleton
let pipelineInstance: ((text: string) => Promise<Float32Array>) | null = null;

/** Get or create the embedding pipeline */
async function getEmbedder(): Promise<(text: string) => Promise<Float32Array>> {
  if (pipelineInstance) return pipelineInstance;

  const { pipeline } = await import("@huggingface/transformers");
  const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
    dtype: "fp32",
  });

  pipelineInstance = async (text: string): Promise<Float32Array> => {
    const output = await extractor(text, { pooling: "mean", normalize: true });
    // output.data is a Float32Array of the pooled embedding
    return output.data as Float32Array;
  };

  return pipelineInstance;
}

/** Generate an embedding vector for text */
export async function generateEmbedding(text: string): Promise<number[]> {
  const embed = await getEmbedder();
  const vec = await embed(text);
  return Array.from(vec);
}

/** Cosine similarity between two vectors */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/** Search indexed tools by semantic similarity */
export async function semanticSearch(
  query: string,
  tools: IndexedTool[],
  topK = 10,
): Promise<SemanticMatch[]> {
  // Only search tools that have embeddings
  const withEmbeddings = tools.filter((t) => t.embedding.length > 0);
  if (withEmbeddings.length === 0) return [];

  const queryEmbedding = await generateEmbedding(query);

  const scored = withEmbeddings.map((tool) => ({
    server: tool.server,
    tool: tool.tool,
    description: tool.description,
    score: cosineSimilarity(queryEmbedding, tool.embedding),
  }));

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}
