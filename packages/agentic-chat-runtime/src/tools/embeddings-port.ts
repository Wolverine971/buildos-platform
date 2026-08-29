// packages/agentic-chat-runtime/src/tools/embeddings-port.ts
//
// Host-injected embeddings capability for semantic discovery (explore_project).
// Web and the worker both construct it from @buildos/shared-agent-ops
// embeddings/openai-embeddings with PRIVATE_OPENAI_API_KEY; the port stays a
// minimal interface so this transport-neutral package never reads env or picks
// a provider itself. The port is optional on the shared read context — hosts
// without a key simply leave it unset and explore_project reports itself
// unavailable instead of failing the turn.

export type AgenticChatEmbeddingsPortV1 = {
	/** Embed one query/theme text; returns the raw embedding vector. */
	embedQuery(text: string): Promise<number[]>;
};
