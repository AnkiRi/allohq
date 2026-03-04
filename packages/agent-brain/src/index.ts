// Embeddings
export { embedText, embedBatch, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "./embeddings/embed";
export { searchEmbeddings, type SearchResult } from "./embeddings/search";
export { ingestEmbeddings, removeEmbeddings, type EmbeddingInput } from "./embeddings/ingest";

// Memory
export { addMemory, getMemories, getMemoriesBatch, type MemoryEntry } from "./memory/customer-memory";
export { assembleContext, formatContextForPrompt, type AgentContext } from "./memory/context";

// RAG
export { retrieve, type RetrievalResult } from "./rag/retriever";

// Knowledge
export { embedProducts } from "./knowledge/products";
export { embedBrandKnowledge } from "./knowledge/brand";
