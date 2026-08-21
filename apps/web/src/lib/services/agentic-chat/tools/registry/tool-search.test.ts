// apps/web/src/lib/services/agentic-chat/tools/registry/tool-search.test.ts
import { afterEach, describe, expect, it } from 'vitest';

import { CHAT_TOOL_DEFINITIONS, TOOL_METADATA } from '../core/definitions';
import { buildToolRegistry, getToolRegistry, resetToolRegistryCache } from './tool-registry';
import { searchToolRegistry } from './tool-search';

const CHAT_HIDDEN_LEGACY_SEARCH_TOOLS = [
	'search_onto_goals',
	'search_onto_plans',
	'search_onto_milestones',
	'search_onto_risks'
] as const;

function toolNames(result: Record<string, unknown>): string[] {
	const matches = Array.isArray(result.matches) ? result.matches : [];
	return matches
		.map((match) => (match as { tool_name?: unknown }).tool_name)
		.filter((name): name is string => typeof name === 'string');
}

afterEach(() => {
	resetToolRegistryCache();
});

describe('searchToolRegistry discovery surfaces', () => {
	it('marks zero-use legacy entity search tools as hidden from chat discovery', () => {
		const registry = getToolRegistry();

		for (const toolName of CHAT_HIDDEN_LEGACY_SEARCH_TOOLS) {
			expect(registry.byToolName[toolName]).toMatchObject({
				tool_name: toolName,
				chat_discoverable: false
			});
		}

		expect(registry.byToolName.search_onto_tasks).toMatchObject({
			tool_name: 'search_onto_tasks',
			chat_discoverable: true
		});
	});

	it('does not let chat-only visibility change the registry version', () => {
		const visibleMetadata = {
			...TOOL_METADATA,
			search_onto_goals: {
				...TOOL_METADATA.search_onto_goals,
				chatDiscovery: 'visible' as const
			}
		};
		const hiddenMetadata = {
			...TOOL_METADATA,
			search_onto_goals: {
				...TOOL_METADATA.search_onto_goals,
				chatDiscovery: 'hidden' as const
			}
		};

		expect(buildToolRegistry(CHAT_TOOL_DEFINITIONS, hiddenMetadata).version).toBe(
			buildToolRegistry(CHAT_TOOL_DEFINITIONS, visibleMetadata).version
		);
	});

	it('hides legacy entity search tools from the default chat surface only', () => {
		for (const toolName of CHAT_HIDDEN_LEGACY_SEARCH_TOOLS) {
			expect(toolNames(searchToolRegistry({ query: toolName, limit: 25 }))).not.toContain(
				toolName
			);
			expect(
				toolNames(searchToolRegistry({ query: toolName, limit: 25, surface: 'chat' }))
			).not.toContain(toolName);
			expect(
				toolNames(searchToolRegistry({ query: toolName, limit: 25, surface: 'external' }))
			).toContain(toolName);
			expect(
				toolNames(searchToolRegistry({ query: toolName, limit: 25, surface: 'all' }))
			).toContain(toolName);
		}

		expect(toolNames(searchToolRegistry({ query: 'search_onto_tasks', limit: 25 }))).toContain(
			'search_onto_tasks'
		);
	});

	it('discovers the purpose-built cross-project task move operation', () => {
		const registry = getToolRegistry();

		expect(registry.ops['onto.task.move']).toMatchObject({
			tool_name: 'move_onto_task',
			kind: 'write',
			chat_discoverable: true
		});
		expect(
			toolNames(
				searchToolRegistry({
					query: 'move task between projects transfer wrong project',
					limit: 10
				})
			)
		).toContain('move_onto_task');
	});

	it('keeps direct calendar, move, and delete searches high quality', () => {
		const calendarMatches = searchToolRegistry({ query: 'calendar', limit: 7 });
		expect(
			(calendarMatches.matches as Array<{ group: string }>).every(
				(match) => match.group === 'cal'
			)
		).toBe(true);
		expect(toolNames(searchToolRegistry({ query: 'move task to another project' }))[0]).toBe(
			'move_onto_task'
		);
		expect(toolNames(searchToolRegistry({ query: 'delete document' }))[0]).toBe(
			'delete_onto_document'
		);
	});

	it('expands reschedule and meeting language to the calendar event update op', () => {
		const names = toolNames(searchToolRegistry({ query: 'reschedule meeting tomorrow' }));
		expect(names.indexOf('update_calendar_event')).toBeGreaterThanOrEqual(0);
		expect(names.indexOf('update_calendar_event')).toBeLessThan(3);
		expect(names).not.toContain('update_onto_document');
	});

	it('prefers the task update write for a batch-shaped update query', () => {
		const names = toolNames(searchToolRegistry({ query: 'batch update many tasks' }));
		expect(names.indexOf('update_onto_task')).toBeGreaterThanOrEqual(0);
		expect(names.indexOf('update_onto_task')).toBeLessThan(5);
	});

	it('keeps common read phrasing discoverable after stop-word filtering', () => {
		expect(toolNames(searchToolRegistry({ query: 'show tasks', limit: 10 }))).toEqual(
			expect.arrayContaining(['list_onto_tasks', 'search_onto_tasks'])
		);
		expect(toolNames(searchToolRegistry({ query: 'find documents', limit: 10 }))).toEqual(
			expect.arrayContaining(['list_onto_documents', 'search_onto_documents'])
		);
	});

	it('discovers account status, OAuth handoff, and email reads in the email group', () => {
		const registry = getToolRegistry();
		expect(registry.ops['email.accounts.list']).toMatchObject({
			group: 'email',
			entity: 'account'
		});
		expect(registry.ops['email.messages.search']).toMatchObject({
			group: 'email',
			entity: 'message'
		});
		expect(registry.ops['email.accounts.status']).toMatchObject({
			group: 'email',
			kind: 'read'
		});
		expect(registry.ops['email.accounts.connect']).toMatchObject({
			group: 'email',
			kind: 'write'
		});
		expect(toolNames(searchToolRegistry({ query: 'gmail', group: 'email' })).sort()).toEqual(
			[
				'get_email_message',
				'get_external_account_status',
				'list_email_accounts',
				'request_email_account_connection',
				'search_email_messages'
			].sort()
		);

		const wrongGroup = searchToolRegistry({
			query: 'gmail inbox read messages email',
			group: 'util',
			limit: 25
		});
		expect(toolNames(wrongGroup)).toEqual([]);
		expect(wrongGroup).toMatchObject({
			total_matches: 0,
			no_matches: {
				tool_directory: {
					groups: expect.arrayContaining([expect.objectContaining({ id: 'email' })])
				}
			}
		});
	});

	it('puts cross-project search operations in a browsable search group', () => {
		const registry = getToolRegistry();
		expect(registry.ops['x.search.all_projects'].group).toBe('search');
		expect(registry.ops['x.search.project'].group).toBe('search');
		expect(registry.ops['onto.search'].group).toBe('search');

		const result = searchToolRegistry({ group: 'search', limit: 25 });
		expect(toolNames(result)).toEqual(
			expect.arrayContaining(['search_all_projects', 'search_project', 'search_ontology'])
		);
	});

	it('controls stop-word noise and returns the directory on no matches', () => {
		const result = searchToolRegistry({ query: 'what is on my plate this week' });
		expect(toolNames(result)).toEqual([]);
		expect(result).toMatchObject({
			total_matches: 0,
			no_matches: {
				tool_directory: {
					groups: expect.arrayContaining([
						expect.objectContaining({ id: 'onto' }),
						expect.objectContaining({ id: 'util' })
					])
				},
				capabilities: expect.arrayContaining([
					expect.objectContaining({ id: 'calendar', path: 'capabilities.calendar' })
				])
			}
		});
	});

	it('does not revive partial-word substring matches', () => {
		expect(toolNames(searchToolRegistry({ query: 'tas' }))).toEqual([]);
	});
});
