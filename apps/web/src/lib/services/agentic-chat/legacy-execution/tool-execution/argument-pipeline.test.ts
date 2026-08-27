// apps/web/src/lib/services/agentic-chat/legacy-execution/tool-execution/argument-pipeline.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolDefinition } from '@buildos/shared-types';
import type { ServiceContext } from '../../shared/types';
import { isToolArgumentRecord } from './argument-values';
import { runArgumentPipeline } from './argument-pipeline';
import { applyDecodedToolAdapter } from './tool-argument-adapters';

const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
const context: ServiceContext = {
	sessionId: 'session-1',
	userId: 'user-1',
	contextType: 'project',
	entityId: projectId,
	contextScope: { projectId },
	conversationHistory: []
};

function canonicalToolDefinition(
	name: string,
	parameters: ChatToolDefinition['function']['parameters']
): ChatToolDefinition {
	return {
		type: 'function',
		function: {
			name,
			description: `${name} test definition`,
			parameters
		}
	};
}

describe('argument-pipeline', () => {
	it('preserves defaults → context → aliases → ID normalization order', () => {
		const definition = canonicalToolDefinition('list_calendar_events', {
			type: 'object',
			properties: {
				project_id: { type: 'string' },
				query: { type: 'string' },
				mode: { type: 'string', default: 'agenda' },
				event_id: { type: 'string' }
			},
			required: ['project_id', 'query']
		});

		const result = runArgumentPipeline({
			toolName: 'list_calendar_events',
			args: { q: 'roadmap', event_id: '  event-1  ' },
			context,
			toolDefinition: definition
		});

		expect(result.args).toEqual({
			q: 'roadmap',
			event_id: 'event-1',
			mode: 'agenda',
			project_id: projectId,
			query: 'roadmap'
		});
		expect(result.aliasDiagnostics).toEqual({
			addedSearch: false,
			addedQuery: false,
			addedSemanticAliases: 1,
			addedIdAliases: 0
		});
	});

	it('does not mutate caller arguments or nested definition defaults', () => {
		const callerArguments = {
			document: {
				title: '  Project Notes  ',
				content: 'Original content',
				props: { reviewed: false }
			}
		};
		const defaultSettings = { display: { density: 'compact' } };
		const definition = canonicalToolDefinition('create_onto_document', {
			type: 'object',
			properties: {
				project_id: { type: 'string' },
				title: { type: 'string' },
				content: { type: 'string' },
				settings: { type: 'object', default: defaultSettings }
			}
		});
		const callerSnapshot = structuredClone(callerArguments);
		const definitionSnapshot = structuredClone(definition);

		const result = runArgumentPipeline({
			toolName: 'create_onto_document',
			args: callerArguments,
			context,
			toolDefinition: definition
		});

		expect(callerArguments).toEqual(callerSnapshot);
		expect(definition).toEqual(definitionSnapshot);
		expect(result.args).toMatchObject({
			project_id: projectId,
			title: 'Project Notes',
			content: 'Original content',
			settings: defaultSettings
		});
		if (isToolArgumentRecord(result.args.settings)) {
			const display = result.args.settings.display;
			if (isToolArgumentRecord(display)) {
				display.density = 'comfortable';
			}
		}
		if (isToolArgumentRecord(result.args.props)) {
			result.args.props.reviewed = true;
		}
		expect(callerArguments).toEqual(callerSnapshot);
		expect(definition).toEqual(definitionSnapshot);
	});

	it('applies project-create collection repair without mutating decoded input', () => {
		const decoded = {
			project: {
				name: 'Launch',
				entities: [{ temp_id: 'task-1', kind: 'task', title: 'Ship' }]
			}
		};
		const snapshot = structuredClone(decoded);

		const adapted = applyDecodedToolAdapter('create_onto_project', decoded);

		expect(adapted).toMatchObject({
			project: { name: 'Launch' },
			entities: [{ temp_id: 'task-1', kind: 'task', title: 'Ship' }]
		});
		expect(decoded).toEqual(snapshot);
	});

	it('uses a single generic id only after the project default is injected', () => {
		const definition = canonicalToolDefinition('move_document_in_tree', {
			type: 'object',
			properties: {
				project_id: { type: 'string' },
				document_id: { type: 'string' }
			},
			required: ['project_id', 'document_id']
		});

		const result = runArgumentPipeline({
			toolName: 'move_document_in_tree',
			args: { id: '  document-1  ', project_id: '   ' },
			context,
			toolDefinition: definition
		});

		expect(result.args).toMatchObject({
			id: '  document-1  ',
			project_id: projectId,
			document_id: 'document-1'
		});
	});
});
