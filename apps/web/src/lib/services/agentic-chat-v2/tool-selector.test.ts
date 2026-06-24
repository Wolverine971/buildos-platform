// apps/web/src/lib/services/agentic-chat-v2/tool-selector.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	extractGatewayMaterializedToolNames,
	getGatewaySurfaceForProfile,
	materializeGatewayTools
} from '$lib/services/agentic-chat/tools/core/gateway-surface';
import { GATEWAY_TOOL_DEFINITIONS } from '$lib/services/agentic-chat/tools/core/definitions/gateway';
import { selectFastChatTools } from './tool-selector';

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('selectFastChatTools', () => {
	it('returns a lean global gateway surface with discovery tools', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');

		const tools = selectFastChatTools({ contextType: 'global' });
		const names = tools.map((tool) => tool.function?.name).filter(Boolean);

		expect(names).toContain('domain_search');
		expect(names).not.toContain('domain_load');
		expect(names).not.toContain('outcome_card_search');
		expect(names).not.toContain('outcome_card_load');
		expect(names).not.toContain('work_capability_search');
		expect(names).not.toContain('work_capability_load');
		expect(names).toContain('skill_search');
		expect(names).not.toContain('resource_search');
		expect(names).not.toContain('resource_load');
		expect(names).toContain('skill_load');
		expect(names).toContain('skill_reference_load');
		expect(names).toContain('tool_search');
		expect(names).toContain('tool_schema');
		expect(names).toContain('change_chat_context');
		expect(names).toContain('get_workspace_overview');
		expect(names).toContain('get_project_overview');
		expect(names).toContain('search_all_projects');
		expect(names).not.toContain('search_buildos');
		expect(names).toContain('search_onto_projects');
		// Doc-read tool is preloaded so reading a body after a cross-project search
		// doesn't require a tool_search/tool_schema discovery round (SEARCH_EVAL F5).
		expect(names).toContain('get_onto_document_details');
		expect(names).not.toContain('list_onto_tasks');
		expect(names).not.toContain('resolve_libri_resource');
	});

	it('mounts only skill_search + domain_search at launch under FASTCHAT_LEAN_DISCOVERY', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');
		vi.stubEnv('FASTCHAT_LEAN_DISCOVERY', 'true');

		const names = selectFastChatTools({ contextType: 'global' })
			.map((tool) => tool.function?.name)
			.filter(Boolean);

		// Lean launch keeps the two discovery entry points...
		expect(names).toContain('skill_search');
		expect(names).toContain('domain_search');
		// ...and drops the step-2 discovery tools from launch (they load on demand
		// via the orchestrator's on-miss + discover-then-load paths).
		expect(names).not.toContain('skill_load');
		expect(names).not.toContain('skill_reference_load');
		expect(names).not.toContain('tool_search');
		expect(names).not.toContain('tool_schema');
		// Direct tools are unaffected by the discovery trim.
		expect(names).toContain('get_workspace_overview');
		expect(names).toContain('search_onto_projects');
	});

	it('keeps project-create minimal unaffected by lean discovery', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');
		vi.stubEnv('FASTCHAT_LEAN_DISCOVERY', 'true');

		const names = selectFastChatTools({ contextType: 'project_create' })
			.map((tool) => tool.function?.name)
			.filter(Boolean);

		expect(names).toEqual(['create_onto_project']);
	});

	it('materializes outcome card gateway tools without preloading them', () => {
		const currentTools = selectFastChatTools({ contextType: 'global' });
		const materialized = materializeGatewayTools(currentTools, [
			'outcome_card_search',
			'outcome_card_load'
		]);

		expect(materialized.addedToolNames).toEqual(['outcome_card_search', 'outcome_card_load']);
	});

	it('materializes typed detail tools from search result payloads', () => {
		expect(
			extractGatewayMaterializedToolNames({
				query: 'user guide suite',
				results: [
					{
						id: '82dfb1b6-e39d-48cb-8c32-d13c3e620daa',
						type: 'task',
						title: 'Create User Guide Suite (ADHD/TPM/Writers/Devs)'
					}
				]
			})
		).toEqual(['get_onto_task_details', 'list_task_documents']);

		expect(
			extractGatewayMaterializedToolNames({
				task: {
					id: '82dfb1b6-e39d-48cb-8c32-d13c3e620daa',
					title: 'Create User Guide Suite (ADHD/TPM/Writers/Devs)'
				}
			})
		).toEqual(['get_onto_task_details', 'list_task_documents']);

		expect(
			extractGatewayMaterializedToolNames({
				materialized_tools: [],
				results: [
					{
						id: '82dfb1b6-e39d-48cb-8c32-d13c3e620daa',
						type: 'task',
						title: 'Create User Guide Suite (ADHD/TPM/Writers/Devs)'
					}
				]
			})
		).toEqual(['get_onto_task_details', 'list_task_documents']);

		expect(
			extractGatewayMaterializedToolNames({
				materialized_tools: ['get_project_overview'],
				results: [
					{
						id: '82dfb1b6-e39d-48cb-8c32-d13c3e620daa',
						type: 'task',
						title: 'Create User Guide Suite (ADHD/TPM/Writers/Devs)'
					}
				]
			})
		).toEqual(['get_project_overview', 'get_onto_task_details', 'list_task_documents']);

		expect(
			extractGatewayMaterializedToolNames({
				documents: [
					{
						id: '037e1c22-dad2-4118-ad1b-43cd284fe657',
						title: 'Agent Skills: Document Operations'
					}
				]
			})
		).toEqual(['get_document_outline', 'read_document_section', 'get_onto_document_details']);
	});

	it('normalizes legacy work capability materialization names to outcome cards', () => {
		const currentTools = selectFastChatTools({ contextType: 'global' });
		const materialized = materializeGatewayTools(currentTools, [
			'work_capability_search',
			'work_capability_load'
		]);

		expect(materialized.addedToolNames).toEqual(['outcome_card_search', 'outcome_card_load']);
	});

	it('dedupes legacy and canonical outcome card materialization names', () => {
		const currentTools = selectFastChatTools({ contextType: 'global' });
		const materialized = materializeGatewayTools(currentTools, [
			'work_capability_load',
			'outcome_card_load',
			'work_capability_search',
			'outcome_card_search'
		]);

		expect(materialized.addedToolNames).toEqual(['outcome_card_load', 'outcome_card_search']);
	});

	it('treats legacy current tools as already satisfying canonical outcome card requests', () => {
		const legacyCurrentTools = GATEWAY_TOOL_DEFINITIONS.filter(
			(tool) => tool.function?.name === 'work_capability_load'
		);
		const materialized = materializeGatewayTools(legacyCurrentTools, ['outcome_card_load']);

		expect(materialized.addedToolNames).toEqual([]);
		expect(materialized.tools).toHaveLength(1);
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

	it('gives daily-brief turns cross-project task and calendar writes', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');

		const names = selectFastChatTools({
			contextType: 'daily_brief',
			latestUserMessage: 'Please update everything so it’s up to date.'
		})
			.map((tool) => tool.function?.name)
			.filter(Boolean);

		// Read + discovery surface from global_basic stays intact
		expect(names).toContain('search_onto_projects');
		expect(names).toContain('search_all_projects');
		expect(names).toContain('get_project_overview');
		expect(names).toContain('tool_search');
		// Direct writes so brief follow-ups never depend on a tool_search round
		expect(names).toContain('create_onto_task');
		expect(names).toContain('update_onto_task');
		expect(names).toContain('get_onto_task_details');
		expect(names).toContain('create_calendar_event');
		expect(names).toContain('update_calendar_event');
		expect(names).toContain('list_calendar_events');
		// Deletes keep their confirm-first discovery path
		expect(names).not.toContain('delete_onto_task');
		expect(names).not.toContain('delete_calendar_event');
	});

	it('keeps writes available on daily-brief follow-up turns without mutation keywords', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');

		const names = selectFastChatTools({
			contextType: 'daily_brief',
			latestUserMessage: 'ok did you finish?'
		})
			.map((tool) => tool.function?.name)
			.filter(Boolean);

		expect(names).toContain('update_onto_task');
		expect(names).toContain('create_calendar_event');
	});

	it('uses the minimal project-create hot path', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');

		const names = selectFastChatTools({ contextType: 'project_create' })
			.map((tool) => tool.function?.name)
			.filter(Boolean);

		expect(names).toEqual(['create_onto_project']);
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

		expect(
			extractGatewayMaterializedToolNames({
				type: 'domain',
				domain_id: 'product_and_design.ui_ux_quality',
				materialized_tools: ['work_capability_load', 'outcome_card_load', 'resource_search']
			})
		).toEqual(['outcome_card_load', 'resource_search']);

		expect(
			extractGatewayMaterializedToolNames({
				type: 'resource_search_results',
				materialized_tools: ['resource_load']
			})
		).toEqual(['resource_load']);
	});
});
