// apps/web/src/lib/services/agentic-chat-v2/tool-selector.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	extractGatewayMaterializedToolNames,
	getGatewaySurfaceForProfile
} from '$lib/services/agentic-chat/tools/core/gateway-surface';
import { selectFastChatTools } from './tool-selector';

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('selectFastChatTools', () => {
	it('returns a lean global gateway surface with discovery tools', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');

		const tools = selectFastChatTools({ contextType: 'global' });
		const names = tools.map((tool) => tool.function?.name).filter(Boolean);

		expect(names).toContain('skill_load');
		expect(names).toContain('tool_search');
		expect(names).toContain('tool_schema');
		expect(names).toContain('change_chat_context');
		expect(names).toContain('get_workspace_overview');
		expect(names).toContain('get_project_overview');
		expect(names).toContain('search_all_projects');
		expect(names).not.toContain('search_buildos');
		expect(names).toContain('search_onto_projects');
		expect(names).not.toContain('list_onto_tasks');
		expect(names).not.toContain('resolve_libri_resource');
	});

	it('keeps project context on the basic read profile', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');
		const tools = selectFastChatTools({ contextType: 'project' });
		const names = tools.map((tool) => tool.function?.name).filter(Boolean);

		expect(names).toContain('get_project_overview');
		expect(names).toContain('change_chat_context');
		expect(names).toContain('get_onto_project_details');
		expect(names).toContain('search_project');
		expect(names).toContain('list_onto_tasks');
		expect(names).not.toContain('search_onto_tasks');
		expect(names).toContain('list_onto_documents');
		expect(names).not.toContain('create_onto_task');
		expect(names).not.toContain('update_onto_task');
	});

	it('uses the minimal project-create hot path', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');

		const names = selectFastChatTools({ contextType: 'project_create' })
			.map((tool) => tool.function?.name)
			.filter(Boolean);

		expect(names).toEqual(['skill_load', 'tool_search', 'tool_schema', 'create_onto_project']);
	});

	it('exposes larger deterministic profiles when requested explicitly', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');

		const writeNames = selectFastChatTools({
			contextType: 'project',
			surfaceProfile: 'project_write'
		})
			.map((tool) => tool.function?.name)
			.filter(Boolean);
		const calendarNames = getGatewaySurfaceForProfile('project_calendar')
			.map((tool) => tool.function?.name)
			.filter(Boolean);

		expect(writeNames).toContain('create_onto_task');
		expect(writeNames).toContain('update_onto_task');
		expect(writeNames).toContain('create_onto_document');
		expect(calendarNames).toContain('get_project_calendar');
		expect(calendarNames).toContain('set_project_calendar');
	});

	it('routes common project progress turns to the write profile', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');

		const names = selectFastChatTools({
			contextType: 'project',
			latestUserMessage:
				'Finished Chapter 2 today. Mark the outline task done and add revision work.'
		})
			.map((tool) => tool.function?.name)
			.filter(Boolean);

		expect(names).toContain('create_onto_task');
		expect(names).toContain('update_onto_task');
		expect(names).toContain('create_onto_document');
		expect(names).toContain('update_onto_document');
	});

	it('routes document-heavy project turns to the document profile', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');

		const names = selectFastChatTools({
			contextType: 'project',
			latestUserMessage:
				'Capture these research notes in a dedicated document and organize it.'
		})
			.map((tool) => tool.function?.name)
			.filter(Boolean);

		expect(names).toContain('create_onto_document');
		expect(names).toContain('update_onto_document');
		expect(names).toContain('get_document_tree');
		expect(names).toContain('move_document_in_tree');
	});

	it('routes mixed task+document turns to the union write/document profile', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');

		// Example Chapter 2 progress turn — mixes task work (revise, draft) with
		// document work (save progress notes). Neither project_write nor
		// project_document alone covers both; the union surface should.
		const names = selectFastChatTools({
			contextType: 'project',
			latestUserMessage:
				'Chapter 2 is complete at 4,500 words. Draft Chapter 3 and save the progress notes to the project document.'
		})
			.map((tool) => tool.function?.name)
			.filter(Boolean);

		expect(names).toContain('create_onto_task');
		expect(names).toContain('update_onto_task');
		expect(names).toContain('create_onto_document');
		expect(names).toContain('update_onto_document');
		expect(names).toContain('get_document_tree');
		expect(names).toContain('move_document_in_tree');
	});

	it('does not expose Libri when the feature flag is disabled', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'false');
		const names = selectFastChatTools({ contextType: 'global' })
			.map((tool) => tool.function?.name)
			.filter(Boolean);

		expect(names).not.toContain('resolve_libri_resource');
	});

	it('recognizes tool materialization returned by context changes', () => {
		expect(
			extractGatewayMaterializedToolNames({
				type: 'context_change',
				materialized_tools: ['get_project_overview', 'search_project', '']
			})
		).toEqual(['get_project_overview', 'search_project']);
	});
});
