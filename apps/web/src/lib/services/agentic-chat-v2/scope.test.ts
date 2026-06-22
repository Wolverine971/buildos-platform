// apps/web/src/lib/services/agentic-chat-v2/scope.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildAgenticChatContextCacheKeyInput,
	buildProjectWideFocus,
	isProjectScopedContext,
	normalizeAgenticChatContextType,
	resolveEffectiveEntityId,
	resolveEffectiveProjectId,
	resolveRpcContextType
} from './scope';

describe('agentic chat scope helpers', () => {
	it.each([
		[undefined, 'global'],
		[null, 'global'],
		['general', 'global'],
		['global', 'global'],
		['project', 'project'],
		['project_audit', 'project'],
		['project_forecast', 'project'],
		['ontology', 'ontology'],
		['daily_brief', 'daily_brief'],
		['project_create', 'project_create'],
		['daily_brief_update', 'daily_brief_update']
	])('normalizes %s to %s', (input, expected) => {
		expect(normalizeAgenticChatContextType(input)).toBe(expected);
	});

	it.each([
		['project', true],
		['project_audit', true],
		['project_forecast', true],
		['global', false],
		['ontology', false],
		['daily_brief', false],
		['project_create', false],
		['daily_brief_update', false],
		[undefined, false]
	])('detects project scoped context for %s', (contextType, expected) => {
		expect(isProjectScopedContext(contextType)).toBe(expected);
	});

	it('resolves effective entity id from explicit entity before project focus outside project scope', () => {
		expect(
			resolveEffectiveEntityId({
				contextType: 'ontology',
				entityId: ' entity-1 ',
				projectFocus: { projectId: 'project-1' }
			})
		).toBe('entity-1');

		expect(
			resolveEffectiveEntityId({
				entityId: null,
				projectFocus: { projectId: ' project-1 ' }
			})
		).toBe('project-1');
	});

	it('uses the project focus project id as the effective project-scoped entity id', () => {
		expect(
			resolveEffectiveEntityId({
				contextType: 'project',
				entityId: 'project-1',
				projectFocus: { projectId: 'project-2' }
			})
		).toBe('project-2');
	});

	it.each([
		[{ contextType: 'project', entityId: 'project-1' }, 'project-1'],
		[{ contextType: 'project', entityId: null }, null],
		[
			{
				contextType: 'project',
				entityId: 'project-1',
				projectFocus: { projectId: 'project-2' }
			},
			'project-2'
		],
		[
			{
				contextType: 'ontology',
				entityId: 'entity-1',
				projectFocus: { projectId: 'project-1' }
			},
			'project-1'
		],
		[{ contextType: 'daily_brief', entityId: 'brief-1' }, null],
		[{ contextType: 'project_create', entityId: 'project-1' }, null]
	])('resolves effective project id for %#', (input, expected) => {
		expect(resolveEffectiveProjectId(input)).toBe(expected);
	});

	it.each([
		[{ contextType: undefined }, 'global'],
		[{ contextType: 'global' }, 'global'],
		[{ contextType: 'project' }, 'project'],
		[{ contextType: 'project_audit' }, 'project'],
		[{ contextType: 'project_forecast' }, 'project'],
		[{ contextType: 'ontology' }, null],
		[{ contextType: 'ontology', projectFocus: { projectId: 'project-1' } }, 'project'],
		[{ contextType: 'daily_brief', entityId: 'brief-1' }, null],
		[{ contextType: 'project_create' }, null]
	])('resolves RPC context type for %#', (input, expected) => {
		expect(resolveRpcContextType(input)).toBe(expected);
	});

	it('normalizes context cache key inputs without building a different key shape', () => {
		expect(
			buildAgenticChatContextCacheKeyInput({
				contextType: 'general',
				entityId: 'workspace',
				projectFocus: null
			})
		).toEqual({
			contextType: 'global',
			entityId: 'workspace',
			projectFocus: null
		});

		expect(
			buildAgenticChatContextCacheKeyInput({
				contextType: 'project_forecast',
				entityId: 'project-1',
				projectFocus: {
					projectId: 'project-1',
					focusType: 'task',
					focusEntityId: 'task-1'
				}
			})
		).toMatchObject({
			contextType: 'project',
			entityId: 'project-1',
			projectFocus: {
				projectId: 'project-1',
				focusType: 'task',
				focusEntityId: 'task-1'
			}
		});
	});

	it('constructs project-wide focus for client session bootstrap', () => {
		expect(buildProjectWideFocus('project-1', null)).toEqual({
			focusType: 'project-wide',
			focusEntityId: null,
			focusEntityName: null,
			projectId: 'project-1',
			projectName: 'Project'
		});
	});
});
