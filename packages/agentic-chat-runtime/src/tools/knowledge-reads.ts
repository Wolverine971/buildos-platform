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
//
// get_project_knowledge_lens (tasker 168) reads what OTHER members of a shared project hold
// about its names. The turn must be able to read the project; the runner then passes
// p_viewer = context.userId and the database checks membership and every sharing rule.
import {
	runKnowledgeGet,
	runKnowledgeProjectLens,
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

export interface SharedGetProjectKnowledgeLensArgs {
	project_id: string;
	record_kind?: 'task' | 'document';
	record_ids?: string[];
}

export async function getProjectKnowledgeLens(
	context: AgenticChatSharedReadContextV1,
	args: SharedGetProjectKnowledgeLensArgs
): Promise<Record<string, unknown>> {
	const projectId = typeof args.project_id === 'string' ? args.project_id.trim() : '';
	// The runner validates the id shape; an unreadable project stops here.
	if (projectId) await context.access.assertProjectAccess(projectId, 'read');
	return runKnowledgeProjectLens(context.client, context.userId, { ...args });
}
