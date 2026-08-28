// apps/web/src/lib/services/agentic-chat-v2/tool-selector.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	extractGatewayMaterializedToolNames,
	extractGatewayToolMaterializations,
	GATEWAY_TOOL_DEFINITIONS,
	getGatewaySurfaceForProfile,
	materializeGatewayTools
} from '@buildos/agentic-chat-runtime/catalog';
import {
	applyLivingWorkspaceToolProfile,
	resolveFastChatSurfaceProfileForTurn,
	selectFastChatTools
} from './tool-selector';
import { resolveFastChatTurnIntent } from './turn-intent';

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('selectFastChatTools', () => {
	it('hot-loads legacy-only Gmail reads for explicit connected-email requests', () => {
		const names = selectFastChatTools({
			contextType: 'global',
			latestUserMessage:
				'Search my connected Gmail accounts for the contract and open the best message.'
		})
			.map((tool) => tool.function?.name)
			.filter(Boolean);

		expect(names).toEqual(
			expect.arrayContaining([
				'list_email_accounts',
				'search_email_messages',
				'get_email_message'
			])
		);
	});

	it('does not mistake cold-email drafting for a connected-inbox read', () => {
		const names = selectFastChatTools({
			contextType: 'global',
			latestUserMessage: 'Draft a concise cold email to a newsletter creator.'
		})
			.map((tool) => tool.function?.name)
			.filter(Boolean);

		expect(names).not.toContain('list_email_accounts');
		expect(names).not.toContain('search_email_messages');
	});

	it.each([
		'Add a high-priority task to email the beta list by this Friday.',
		'Create a task to email the customer list after launch.',
		'Email Jordan the revised project plan.',
		"push the beta list email thing to friday, i'm not gonna get to it before then",
		'Reschedule the beta list email task for Friday.',
		'Move the customer list email follow-up to next week.',
		'Push my beta list email reminder to tomorrow.'
	])('keeps email-action tasks on the worker surface: %s', (message) => {
		const names = selectFastChatTools({
			contextType: 'project',
			latestUserMessage: message
		})
			.map((tool) => tool.function?.name)
			.filter(Boolean);

		expect(names).not.toContain('list_email_accounts');
		expect(names).not.toContain('search_email_messages');
		expect(names).not.toContain('get_email_message');
		expect(names).toContain('update_onto_task');
	});

	it.each([
		'Find the email from Jordan about the revised project plan.',
		'List my recent emails about the beta launch.',
		'Check my connected email account for a reply from Jordan.',
		'Look through my emails for the launch receipt.',
		'Who emailed me about the beta launch?',
		'Please list my unread email messages.',
		'Can you list the latest emails from Jordan?',
		'Show me what is in my mailbox.',
		'Which connected email accounts can you search?'
	])('hot-loads connected-email reads for explicit retrieval intent: %s', (message) => {
		const names = selectFastChatTools({
			contextType: 'global',
			latestUserMessage: message
		})
			.map((tool) => tool.function?.name)
			.filter(Boolean);

		expect(names).toEqual(
			expect.arrayContaining([
				'list_email_accounts',
				'search_email_messages',
				'get_email_message'
			])
		);
	});

	it('hot-loads the legacy-only calendar read surface for explicit calendar requests', () => {
		const names = selectFastChatTools({
			contextType: 'global',
			latestUserMessage: "What's on my calendar tomorrow?"
		})
			.map((tool) => tool.function?.name)
			.filter(Boolean);

		expect(names).toContain('list_calendar_events');
	});

	it('mounts living-reference document tools without classifying the message', () => {
		const baseTools = selectFastChatTools({
			contextType: 'project',
			surfaceProfile: 'project_basic'
		});
		const selection = applyLivingWorkspaceToolProfile({
			tools: baseTools,
			workspace: {
				mode: 'living_reference',
				domain_profile: 'fiction_story',
				domain_affinity: 'writing.fiction'
			},
			latestUserMessage: 'Ilyan hides the brass key because it belonged to his sister.'
		});
		const names = selection.tools.map((tool) => tool.function?.name).filter(Boolean);

		expect(selection.implicitCapture).toBe(false);
		expect(selection.commissionedWriteMinimumCount).toBe(0);
		expect(names).toContain('create_onto_document');
		expect(names).toContain('update_onto_document');
	});

	it('does not assign a write cardinality from chapter wording', () => {
		const baseTools = selectFastChatTools({
			contextType: 'project',
			surfaceProfile: 'project_basic'
		});
		const selection = applyLivingWorkspaceToolProfile({
			tools: baseTools,
			workspace: {
				mode: 'living_reference',
				domain_profile: 'fiction_story',
				domain_affinity: 'writing.fiction'
			},
			latestUserMessage:
				'I think the last beat of Part I happens at the end of chapter 4: Ilyan catches Mara hiding a forbidden map and chooses not to report her.'
		});
		const names = selection.tools.map((tool) => tool.function?.name).filter(Boolean);

		expect(selection.implicitCapture).toBe(false);
		expect(selection.commissionedWriteMinimumCount).toBe(0);
		expect(names).toEqual(
			expect.arrayContaining(['create_onto_document', 'update_onto_document'])
		);
	});

	it('does not infer different write floors from structural words', () => {
		const baseTools = selectFastChatTools({
			contextType: 'project',
			surfaceProfile: 'project_basic'
		});
		const fictionWorkspace = {
			mode: 'living_reference',
			domain_profile: 'fiction_story',
			domain_affinity: 'writing.fiction'
		} as const;
		const ordinaryFacts = [
			"Mara's locket is part of her mother's legacy.",
			'Her heart skips a beat whenever the customs whistle sounds.',
			'He makes a scene at the customs office when rattled.',
			'Ilyan has to act fast when the tide turns.'
		];
		for (const message of ordinaryFacts) {
			const selection = applyLivingWorkspaceToolProfile({
				tools: baseTools,
				workspace: fictionWorkspace,
				latestUserMessage: message
			});
			expect(selection.implicitCapture).toBe(false);
			expect(selection.commissionedWriteMinimumCount).toBe(0);
		}
		const structural = applyLivingWorkspaceToolProfile({
			tools: baseTools,
			workspace: fictionWorkspace,
			latestUserMessage: 'The final chapter reveals who rang the Bellwether.'
		});
		expect(structural.commissionedWriteMinimumCount).toBe(0);
	});

	it('keeps speculation without a question mark read-only', () => {
		const baseTools = selectFastChatTools({
			contextType: 'project',
			surfaceProfile: 'project_basic'
		});
		const speculations = [
			'Do you think Mara would forgive him',
			'I wonder if Ilyan should betray Mara',
			'Maybe Ilyan should refuse the mission'
		];
		for (const message of speculations) {
			const selection = applyLivingWorkspaceToolProfile({
				tools: baseTools,
				workspace: {
					mode: 'living_reference',
					domain_profile: 'fiction_story',
					domain_affinity: 'writing.fiction'
				},
				latestUserMessage: message
			});
			expect(selection.implicitCapture).toBe(false);
			expect(selection.commissionedWriteMinimumCount).toBe(0);
		}
	});

	it('keeps one capability surface for living-reference questions and commands', () => {
		const baseTools = selectFastChatTools({
			contextType: 'project',
			surfaceProfile: 'project_basic'
		});
		const workspace = {
			mode: 'living_reference',
			domain_profile: 'fiction_story',
			domain_affinity: 'writing.fiction'
		};
		const adviceSelection = applyLivingWorkspaceToolProfile({
			tools: baseTools,
			workspace,
			latestUserMessage: 'What should happen to Ilyan next? Give me three options.'
		});
		const explicitIntent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'Delete the Ilyan character document.'
		});
		const mutationSelection = applyLivingWorkspaceToolProfile({
			tools: baseTools,
			workspace,
			latestUserMessage: 'Delete the Ilyan character document.',
			turnIntent: explicitIntent
		});

		expect(adviceSelection.implicitCapture).toBe(false);
		expect(mutationSelection.implicitCapture).toBe(false);
		expect(adviceSelection.commissionedWriteMinimumCount).toBe(0);
		expect(mutationSelection.commissionedWriteMinimumCount).toBe(0);
		expect(adviceSelection.tools).toEqual(mutationSelection.tools);
		expect(explicitIntent.requiresWrite).toBe(false);
	});

	it('keeps the stable project surface independent of legacy fallback', () => {
		expect(
			resolveFastChatSurfaceProfileForTurn({
				contextType: 'project',
				latestUserMessage: 'Finished Chapter 2 today.'
			})
		).toBe('project_write_document');
		expect(
			resolveFastChatSurfaceProfileForTurn({
				contextType: 'project',
				latestUserMessage: 'Finished Chapter 2 today.',
				allowLegacySurfaceFallback: false
			})
		).toBe('project_write_document');
	});

	it('can force lean discovery independently of process environment', () => {
		const names = selectFastChatTools({
			contextType: 'global',
			leanDiscovery: true
		}).map((tool) => tool.function?.name);

		expect(names).toContain('skill_search');
		expect(names).toContain('domain_search');
		expect(names).not.toContain('tool_search');
		expect(names).not.toContain('skill_load');
	});

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
		expect(names).not.toContain('skill_load');
		expect(names).not.toContain('skill_reference_load');
		expect(names).not.toContain('tool_search');
		expect(names).not.toContain('tool_schema');
		expect(names).toContain('change_chat_context');
		expect(names).toContain('get_workspace_overview');
		expect(names).toContain('get_project_overview');
		expect(names).toContain('search_all_projects');
		expect(names).not.toContain('search_buildos');
		expect(names).toContain('search_onto_projects');
		// Full-body doc reads materialize from document search/results instead of
		// sitting in every first-turn launch surface.
		expect(names).not.toContain('get_onto_document_details');
		expect(names).not.toContain('list_corsair_mcp_tools');
		expect(names).not.toContain('call_corsair_mcp_tool');
		expect(names).not.toContain('delegate_task');
		expect(names).not.toContain('commit_change_set');
		expect(names).not.toContain('list_onto_tasks');
		expect(names).not.toContain('resolve_libri_resource');
	});

	it('keeps rare bridge and orchestration tools materializable without preloading them', () => {
		const currentTools = selectFastChatTools({ contextType: 'project' });
		const currentNames = currentTools.map((tool) => tool.function?.name).filter(Boolean);

		expect(currentNames).not.toContain('list_corsair_mcp_tools');
		expect(currentNames).not.toContain('call_corsair_mcp_tool');
		expect(currentNames).not.toContain('delegate_task');
		expect(currentNames).not.toContain('commit_change_set');

		const materialized = materializeGatewayTools(currentTools, [
			'list_corsair_mcp_tools',
			'call_corsair_mcp_tool',
			'delegate_task',
			'commit_change_set'
		]);

		expect(materialized.addedToolNames).toEqual([
			'list_corsair_mcp_tools',
			'call_corsair_mcp_tool',
			'delegate_task',
			'commit_change_set'
		]);
	});

	it('mounts delegate_task directly for explicit deep-research or background-agent requests', () => {
		const deepResearchNames = selectFastChatTools({
			contextType: 'global',
			latestUserMessage:
				'Do deep research on this market with subagents and report back with sources.'
		})
			.map((tool) => tool.function?.name)
			.filter(Boolean);
		const quickLookupNames = selectFastChatTools({
			contextType: 'global',
			latestUserMessage: 'Search the web for the current price and summarize it.'
		})
			.map((tool) => tool.function?.name)
			.filter(Boolean);

		expect(deepResearchNames).toContain('delegate_task');
		expect(quickLookupNames).not.toContain('delegate_task');
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

	it('keeps the web compound project-create surface unaffected by lean discovery', () => {
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

	it('attributes materialization to skill bundles, searches, schemas, and entity results', () => {
		expect(
			extractGatewayToolMaterializations({
				type: 'skill',
				materialized_tools: ['delete_calendar_event']
			})
		).toEqual([{ source: 'skill_bundle', toolNames: ['delete_calendar_event'] }]);

		expect(
			extractGatewayToolMaterializations({
				type: 'skill_search_results',
				materialized_tools: ['skill_load']
			})
		).toEqual([{ source: 'search', toolNames: ['skill_load'] }]);

		expect(
			extractGatewayToolMaterializations({
				type: 'tool_schema',
				tool_name: 'delete_calendar_event'
			})
		).toEqual([{ source: 'schema', toolNames: ['delete_calendar_event'] }]);

		expect(
			extractGatewayToolMaterializations({
				results: [{ id: 'task-1', type: 'task', title: 'Ship it' }]
			})
		).toEqual([
			{
				source: 'entity_result',
				toolNames: ['get_onto_task_details', 'list_task_documents']
			}
		]);
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

	it('keeps common project reads and writes on one stable surface', () => {
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
		expect(names).toContain('create_onto_task');
		expect(names).toContain('update_onto_task');
		expect(names).toContain('declare_turn_contract');
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
		expect(names).not.toContain('tool_search');
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

	it('uses the bounded contract-first project-create hot path for reviewed workers', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');

		const names = selectFastChatTools({
			contextType: 'project_create',
			projectCreateWorkflow: 'reviewed_shell'
		})
			.map((tool) => tool.function?.name)
			.filter(Boolean);

		expect(names).toEqual([
			'declare_turn_contract',
			'declare_read_only_turn',
			'request_turn_clarification',
			'cancel_turn_contract',
			'create_onto_project',
			'create_onto_goal',
			'create_onto_task'
		]);
		expect(names).not.toContain('link_onto_entities');
	});

	it('does not broaden web compound project-create when a larger profile is supplied', () => {
		const names = selectFastChatTools({
			contextType: 'project_create',
			surfaceProfile: 'project_write_document',
			latestUserMessage: 'Research competitors, delegate it, and link every result.'
		})
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

	it('hot-loads the cross-project task move only for explicit transfer intent', () => {
		const moveNames = selectFastChatTools({
			contextType: 'project',
			latestUserMessage:
				'This task is in the wrong project. It needs to be moved to the Cadre project.'
		}).map((tool) => tool.function?.name);
		const ordinaryNames = selectFastChatTools({
			contextType: 'project',
			latestUserMessage: 'Move this task to in progress.'
		}).map((tool) => tool.function?.name);
		const globalMoveNames = selectFastChatTools({
			contextType: 'global',
			latestUserMessage: 'Move this task to another project.'
		}).map((tool) => tool.function?.name);
		const ordinaryGlobalNames = selectFastChatTools({
			contextType: 'global',
			latestUserMessage: 'Find my most important task.'
		}).map((tool) => tool.function?.name);

		expect(moveNames).toContain('move_onto_task');
		expect(ordinaryNames).not.toContain('move_onto_task');
		expect(globalMoveNames).toContain('move_onto_task');
		expect(ordinaryGlobalNames).not.toContain('move_onto_task');
	});

	it('keeps task move loaded after the user resolves a destination clarification', () => {
		const names = selectFastChatTools({
			contextType: 'project',
			latestUserMessage: 'The Cadre Content Operations one.',
			turnIntent: {
				version: 1,
				requiresWrite: true,
				action: 'organize',
				entityKind: 'task',
				operations: [{ action: 'organize', entityKind: 'task' }],
				source: 'pending_continuation',
				originalRequestText:
					'This task is in the wrong project. Move it to the Cadre project.',
				originatingTurnRunId: 'turn-1',
				clearPending: false
			}
		}).map((tool) => tool.function?.name);

		expect(names).toContain('move_onto_task');
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

	it('routes a declarative document commission to direct document writes', () => {
		const names = selectFastChatTools({
			contextType: 'project',
			latestUserMessage:
				'i think we need to figure out the research on what other people are charging for ' +
				'this kind of thing — like a pricing landscape doc or something'
		}).map((tool) => tool.function?.name);

		expect(names).toContain('create_onto_document');
		expect(names).toContain('update_onto_document');
		expect(names).toContain('web_search');
		expect(names).toContain('web_visit');
	});

	it('mounts web tools for natural comparative-pricing research phrasing', () => {
		const names = selectFastChatTools({
			contextType: 'project',
			latestUserMessage:
				'Look into what other scheduling tools for small service businesses charge — ' +
				'I want a sense of the pricing landscape before we put a paid tier together.'
		}).map((tool) => tool.function?.name);

		expect(names).toContain('web_search');
		expect(names).toContain('web_visit');
	});

	it('keeps stable document capabilities available for informational questions', () => {
		const names = selectFastChatTools({
			contextType: 'project',
			latestUserMessage: 'Do we need a pricing landscape document?'
		}).map((tool) => tool.function?.name);

		expect(names).toContain('create_onto_document');
		expect(names).toContain('update_onto_document');
		expect(names).toContain('declare_turn_contract');
	});

	it('routes noun-first organize requests to the document profile', () => {
		// The project-organize e2e message verbatim. Measured 2026-07-26: this resolved
		// project_basic (no write tools) because "organized" is a past participle AFTER the
		// nouns, and the verb-then-noun regex missed it — 0/3 with the model never holding
		// move_document_in_tree.
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');

		const names = selectFastChatTools({
			contextType: 'project',
			latestUserMessage:
				"This project's documents are a mess — loose notes, raw meeting dumps, half-baked " +
				'ideas, all piled at the top level. Help me get it organized into something sensible.'
		})
			.map((tool) => tool.function?.name)
			.filter(Boolean);

		expect(names).toContain('get_document_tree');
		expect(names).toContain('move_document_in_tree');
	});

	it('does not use a plain document question to change the stable project surface', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');

		const names = selectFastChatTools({
			contextType: 'project',
			latestUserMessage: 'Which documents do we have in this project?'
		})
			.map((tool) => tool.function?.name)
			.filter(Boolean);

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

	it('uses structured compound intent to keep every required write tool available', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');
		const message = 'Mark the task done and create a document for the handoff.';
		const turnIntent = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: message
		});
		const names = selectFastChatTools({
			contextType: 'project',
			latestUserMessage: message,
			turnIntent
		})
			.map((tool) => tool.function?.name)
			.filter(Boolean);

		expect(names).toContain('update_onto_task');
		expect(names).toContain('create_onto_document');
		expect(names).toContain('get_document_tree');
	});

	it('keeps uncommon goal writes and deletes behind discovery', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');
		const createGoal = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'Create a goal for launch.'
		});
		const deleteGoal = resolveFastChatTurnIntent({
			contextType: 'project',
			latestUserMessage: 'Delete the goal.'
		});
		const createNames = selectFastChatTools({
			contextType: 'project',
			turnIntent: createGoal
		}).map((tool) => tool.function?.name);
		const deleteNames = selectFastChatTools({
			contextType: 'project',
			turnIntent: deleteGoal
		}).map((tool) => tool.function?.name);

		expect(createNames).not.toContain('create_onto_goal');
		expect(deleteNames).not.toContain('delete_onto_goal');
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
