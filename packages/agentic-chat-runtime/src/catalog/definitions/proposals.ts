// packages/agentic-chat-runtime/src/catalog/definitions/proposals.ts
//
// Proposal tools (tasker 122, WP4/WP5). Each one checks the change and returns
// a card; the user's click on the card is the only consent, so these are reads
// (`kind: 'read'`, ops ending in `.propose`, never `.set`/`.move`). Global
// surface only: a project chat cannot look up the other project.
import type { ChatToolDefinition } from '@buildos/shared-types';

const NOTE_PROPERTY = {
	type: 'string',
	maxLength: 200,
	description: 'Optional one-line reason, shown on the card.'
} as const;

export const PROPOSAL_TOOL_DEFINITIONS: ChatToolDefinition[] = [
	{
		type: 'function',
		function: {
			name: 'propose_project_parent',
			description:
				'Propose putting a project inside a parent project, or taking it out of its parent (parent_project_id null). Returns a card: nothing changes until the user clicks it, and it starts a quick duplicate check. Call it once per change.',
			parameters: {
				type: 'object',
				properties: {
					project_id: { type: 'string', description: 'Project UUID to move.' },
					parent_project_id: {
						type: ['string', 'null'],
						description:
							'New parent project UUID, or null to take it out of its parent.'
					},
					note: NOTE_PROPERTY
				},
				required: ['project_id', 'parent_project_id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'propose_project_combine',
			description:
				'Propose combining a whole project into another: everything in the source moves into the destination and the source is archived. Returns a card naming what moves, who loses access and any blockers: nothing changes until the user clicks it, and it starts a quick duplicate check. Call it once per change.',
			parameters: {
				type: 'object',
				properties: {
					source_project_id: {
						type: 'string',
						description: 'Project UUID that is folded in and archived.'
					},
					destination_project_id: {
						type: 'string',
						description: 'Project UUID that keeps everything.'
					},
					note: NOTE_PROPERTY
				},
				required: ['source_project_id', 'destination_project_id']
			}
		}
	}
];
