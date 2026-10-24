// packages/agentic-chat-runtime/src/catalog/definitions/workspace.ts
//
// Workspace tools (tasker 146, Phase 2). The Workspace holds the user's loose notes,
// docs and tasks. A background job suggests where loose items belong; chat can read
// those suggestions and put a card in the conversation, and only the user's click on
// the card files or creates anything. All three are reads (`kind: 'read'`): the
// propose_* tools return a card, never a write. Global surface only. Every byte here
// ships on every global turn, so the descriptions stay tight.
import type { ChatToolDefinition, ToolJsonSchema } from '@buildos/shared-types';

const ITEMS_PROPERTY = (minItems: number): ToolJsonSchema => ({
	type: 'array',
	minItems,
	maxItems: 20,
	items: {
		type: 'object',
		properties: {
			entity: { type: 'string', enum: ['document', 'task'] },
			id: { type: 'string' }
		},
		required: ['entity', 'id']
	}
});

const SUGGESTION_PROPERTY: ToolJsonSchema = {
	type: 'string',
	description: 'Optional list_workspace_suggestions id this answers.'
};

const WHEN =
	'Use when the user asks for it, or an open suggestion clearly fits their ask; never on your own mid-topic.';

export const WORKSPACE_TOOL_DEFINITIONS: ChatToolDefinition[] = [
	{
		type: 'function',
		function: {
			name: 'list_workspace_suggestions',
			description:
				"Open suggestions for the user's Workspace (loose notes, docs, tasks): items that belong in a project, or groups that look like a new project. Read-only.",
			parameters: { type: 'object', properties: {} }
		}
	},
	{
		type: 'function',
		function: {
			name: 'propose_workspace_filing',
			description: `Propose filing loose Workspace items into a project. ${WHEN} Returns a card; only the user's click moves anything.`,
			parameters: {
				type: 'object',
				properties: {
					items: ITEMS_PROPERTY(1),
					target_project_id: {
						type: 'string',
						description: 'Project UUID to file into (not the Workspace).'
					},
					suggestion_id: SUGGESTION_PROPERTY,
					reason: {
						type: 'string',
						maxLength: 200,
						description: 'Optional one-line reason, shown on the card.'
					}
				},
				required: ['items', 'target_project_id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'propose_workspace_project',
			description: `Propose starting a new project from loose Workspace items. ${WHEN} Returns a card; only the user's click creates anything.`,
			parameters: {
				type: 'object',
				properties: {
					name: { type: 'string', maxLength: 120 },
					description: { type: 'string', maxLength: 600 },
					items: ITEMS_PROPERTY(2),
					suggestion_id: SUGGESTION_PROPERTY
				},
				required: ['name', 'items']
			}
		}
	}
];
