import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });
  }
  return openaiClient;
}

/** Embed a single text string, returns a 1536-dimensional vector */
export async function embedText(text: string): Promise<number[]> {
  const client = getClient();
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return response.data[0]!.embedding;
}

/** Embed multiple texts in a single API call (max ~8k tokens per batch) */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = getClient();

  // OpenAI allows batches up to ~2048 inputs; chunk if larger
  const BATCH_SIZE = 512;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
    });
    for (const item of response.data) {
      allEmbeddings.push(item.embedding);
    }
  }

  return allEmbeddings;
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
