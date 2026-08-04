// apps/web/src/lib/services/agentic-chat/execution/tool-execution/scope-guards.test.ts
import type { ChatToolDefinition } from '@buildos/shared-types';
import { describe, expect, it } from 'vitest';
import type { ServiceContext } from '../../shared/types';
import {
	guardEntityIdsMatchContextScope,
	guardProjectIdMatchesContextScope,
	normalizeProjectScopedEntityKind,
	requiresKnownProjectForEntityIdMutation
} from './scope-guards';

const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
const otherProjectId = '972064c0-c2aa-4c74-a735-313802ffd456';
const destinationProjectId = '09684f0a-4f56-4a72-84b6-20fb10ab7890';
const taskId = 'e1038564-6e3e-4e18-aa0a-a460fd2e3f80';

function contextForProject(scopedProjectId = projectId): ServiceContext {
	return {
		sessionId: 'session',
		userId: 'user',
		contextType: 'project',
		entityId: scopedProjectId,
		conversationHistory: [],
		contextScope: { projectId: scopedProjectId }
	};
}

function projectScopedDefinition(name: string): ChatToolDefinition {
	return {
		type: 'function',
		function: {
			name,
			description: `${name} test definition`,
			parameters: {
				type: 'object',
				properties: { project_id: { type: 'string' } }
			}
		}
	};
}

describe('scope guards', () => {
	it('rejects invalid and cross-project explicit project ids with the legacy errors', () => {
		const context = contextForProject();
		const availableTools = [projectScopedDefinition('list_onto_tasks')];

		expect(
			guardProjectIdMatchesContextScope({
				toolName: 'list_onto_tasks',
				args: { project_id: 'not-a-uuid' },
				context,
				availableTools,
				toolCallId: 'invalid'
			})
		).toMatchObject({
			success: false,
			errorType: 'validation_error',
			error: 'Tool project_id must be a valid UUID in the current project focus.'
		});
		expect(
			guardProjectIdMatchesContextScope({
				toolName: 'list_onto_tasks',
				args: { project_id: otherProjectId },
				context,
				availableTools,
				toolCallId: 'cross-project'
			})
		).toMatchObject({
			error: 'Tool project_id does not match the current project focus. Switch focus or ask for explicit cross-project confirmation before using another project.'
		});
	});

	it('keeps the dedicated cross-project task move exception explicit', () => {
		const context = contextForProject();
		const base = {
			toolName: 'move_onto_task',
			context,
			availableTools: [],
			toolCallId: 'move'
		};

		expect(
			guardProjectIdMatchesContextScope({
				...base,
				args: {
					expected_source_project_id: projectId,
					destination_project_id: destinationProjectId
				}
			})
		).toBeNull();
		expect(
			guardProjectIdMatchesContextScope({
				...base,
				args: {
					expected_source_project_id: otherProjectId,
					destination_project_id: destinationProjectId
				}
			})
		).toMatchObject({
			error: 'move_onto_task expected_source_project_id must match the current project focus. The destination may be another writable project.'
		});
		expect(
			guardProjectIdMatchesContextScope({
				...base,
				args: {
					expected_source_project_id: projectId,
					destination_project_id: projectId
				}
			})
		).toMatchObject({
			error: 'move_onto_task requires different, valid expected_source_project_id and destination_project_id UUIDs.'
		});
	});

	it('allows current-project evidence and rejects cross-project evidence', () => {
		const base = {
			toolName: 'update_onto_task',
			args: { task_id: taskId, title: 'Updated' },
			context: contextForProject(),
			toolCallId: 'update'
		};

		expect(
			guardEntityIdsMatchContextScope({
				...base,
				sameTurnEntityProjectIds: new Map([[`task:${taskId}`, projectId]])
			})
		).toBeNull();
		expect(
			guardEntityIdsMatchContextScope({
				...base,
				sameTurnEntityProjectIds: new Map([[`task:${taskId}`, otherProjectId]])
			})
		).toMatchObject({
			error: 'Tool task_id belongs to a different project than the current project focus. Switch focus or ask for explicit cross-project confirmation before using another project.'
		});
	});

	it('fails closed for unknown or tombstoned mutation ownership', () => {
		const base = {
			toolName: 'update_onto_task',
			args: { task_id: taskId, title: 'Updated' },
			context: contextForProject(),
			toolCallId: 'unknown'
		};
		const expected = {
			error: 'Tool task_id is not known to belong to the current project focus. Load or resolve the entity in the current project before mutating it.'
		};

		expect(
			guardEntityIdsMatchContextScope({
				...base,
				sameTurnEntityProjectIds: new Map()
			})
		).toMatchObject(expected);
		expect(
			guardEntityIdsMatchContextScope({
				...base,
				sameTurnEntityProjectIds: new Map([[`task:${taskId}`, null]])
			})
		).toMatchObject(expected);
	});

	it('does not require ownership evidence for read-only entity calls', () => {
		expect(
			guardEntityIdsMatchContextScope({
				toolName: 'get_onto_task_details',
				args: { task_id: taskId },
				context: contextForProject(),
				toolCallId: 'read',
				sameTurnEntityProjectIds: new Map()
			})
		).toBeNull();
	});

	it('keeps mutation classification and entity aliases discoverable', () => {
		expect(requiresKnownProjectForEntityIdMutation('create_onto_task')).toBe(true);
		expect(requiresKnownProjectForEntityIdMutation('create_onto_project')).toBe(false);
		expect(requiresKnownProjectForEntityIdMutation('get_onto_task_details')).toBe(false);
		expect(normalizeProjectScopedEntityKind('TASKS')).toBe('task');
		expect(normalizeProjectScopedEntityKind('docs')).toBe('document');
	});
});
