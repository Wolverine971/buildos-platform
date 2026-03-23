// apps/web/src/lib/server/agent-call/public-tool-registry.ts
import type { AgentCallScope, BuildosAgentToolDefinition } from '@buildos/shared-types';

const PUBLIC_READ_ONLY_TOOLS: BuildosAgentToolDefinition[] = [
	{
		name: 'list_projects',
		description: 'List projects visible to the user BuildOS agent.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			properties: {}
		}
	},
	{
		name: 'get_project_snapshot',
		description:
			'Return a compact BuildOS project snapshot with tasks, goals, plans, documents, and recent activity.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			properties: {
				project_id: { type: 'string' }
			},
			required: ['project_id']
		}
	},
	{
		name: 'search_entities',
		description: 'Search tasks, goals, plans, and documents visible to the user BuildOS agent.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			properties: {
				query: { type: 'string' },
				project_id: { type: 'string' },
				limit: { type: 'number' }
			},
			required: ['query']
		}
	},
	{
		name: 'list_project_tasks',
		description: 'List tasks for one BuildOS project.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			properties: {
				project_id: { type: 'string' },
				state_key: { type: 'string' },
				limit: { type: 'number' }
			},
			required: ['project_id']
		}
	},
	{
		name: 'list_project_documents',
		description: 'List documents for one BuildOS project.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			properties: {
				project_id: { type: 'string' },
				limit: { type: 'number' }
			},
			required: ['project_id']
		}
	},
	{
		name: 'get_document',
		description: 'Return one BuildOS document body and metadata.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			properties: {
				document_id: { type: 'string' },
				max_chars: { type: 'number' }
			},
			required: ['document_id']
		}
	}
];

export function getPublicBuildosAgentTools(scope: AgentCallScope): BuildosAgentToolDefinition[] {
	if (scope.mode !== 'read_only') {
		return [];
	}

	return PUBLIC_READ_ONLY_TOOLS;
}
