// packages/agentic-chat-runtime/src/tools/knowledge-reads.ts
//
// The personal knowledge graph reads on the chat read lane (tasker 160): search_knowledge,
// get_knowledge_entity, query_knowledge. They call the same runners as the MCP gateway ops
// (knowledge.search / .get / .query in op-execution-gateway.knowledge.ts), so chat and MCP
// return identical shapes.
//
// The worker reads with a service-role client. KnowledgeStore filters every read to public
// rows plus this user's private rows in code, and it is built from `context.userId` — the
// turn's trusted auth user — never from model arguments.
import {
	runKnowledgeGet,
	runKnowledgeQuery,
	runKnowledgeSearch
} from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';

export interface SharedSearchKnowledgeArgs {
	query: string;
	kinds?: string[];
	limit?: number;
}

export interface SharedGetKnowledgeEntityArgs {
	entity_id: string;
}

export interface SharedQueryKnowledgeArgs {
	start: {
		entity_ids?: string[];
		search?: string;
		kinds?: string[];
		known_by_me?: boolean;
		owned_by_me?: boolean;
	};
	follow?: Array<{ predicate: string; direction?: 'out' | 'in'; kinds?: string[] }>;
	where?: { known_by_me?: boolean; owned_by_me?: boolean };
	fields?: string[];
	limit?: number;
}

export function searchKnowledge(
	context: AgenticChatSharedReadContextV1,
	args: SharedSearchKnowledgeArgs
): Promise<Record<string, unknown>> {
	return runKnowledgeSearch(context.client, context.userId, { ...args });
}

export function getKnowledgeEntity(
	context: AgenticChatSharedReadContextV1,
	args: SharedGetKnowledgeEntityArgs
): Promise<Record<string, unknown>> {
	return runKnowledgeGet(context.client, context.userId, { ...args });
}

export function queryKnowledge(
	context: AgenticChatSharedReadContextV1,
	args: SharedQueryKnowledgeArgs
): Promise<Record<string, unknown>> {
	return runKnowledgeQuery(context.client, context.userId, { ...args });
}
