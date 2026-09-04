// packages/agentic-chat-runtime/src/catalog/surfaces.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import {
	AGENTIC_CHAT_WORKER_OMITTED_TOOL_NAMES_V1,
	isAgenticChatWorkerExecutableToolNameV1
} from '../worker-tool-policy';
import { AGENTIC_CHAT_TOTAL_TOOL_VOCABULARY } from './definitions';
import {
	GATEWAY_EMAIL_SURFACE_TOOL_NAMES,
	GATEWAY_SURFACE_PROFILE_NAMES,
	getGatewayDirectToolNamesForProfile,
	getGatewaySurfaceForContextType,
	getGatewaySurfaceForProfile,
	materializeGatewayTools,
	resolveGatewaySurfaceProfileForContextType
} from './surfaces';

/** Every `description` string in a definition, including nested property schemas. */
function collectDescriptionText(value: unknown, key?: string): string[] {
	if (Array.isArray(value)) return value.flatMap((item) => collectDescriptionText(item));
	if (value && typeof value === 'object') {
		return Object.entries(value as Record<string, unknown>).flatMap(([childKey, child]) =>
			collectDescriptionText(child, childKey)
		);
	}
	return typeof value === 'string' && key === 'description' ? [value] : [];
}

function surfaceNames(tools: ChatToolDefinition[]): string[] {
	return tools.map((tool) => tool.function.name);
}

const CONTROL_TOOL_NAMES = [
	'declare_turn_contract',
	'declare_read_only_turn',
	'request_turn_clarification',
	'cancel_turn_contract'
];

describe('three stable surfaces (one-engine stage S6, 2026-09-04)', () => {
	it('exposes exactly three profiles', () => {
		expect([...GATEWAY_SURFACE_PROFILE_NAMES]).toEqual(['global', 'project', 'project_create']);
	});

	it('routes every context type by context alone', () => {
		const routes: Array<[ChatContextType, string]> = [
			['global', 'global'],
			['general', 'global'],
			['calendar', 'global'],
			['daily_brief', 'global'],
			['daily_brief_update', 'global'],
			['project', 'project'],
			['ontology', 'project'],
			['project_create', 'project_create']
		];
		for (const [contextType, profile] of routes) {
			expect(resolveGatewaySurfaceProfileForContextType(contextType), contextType).toBe(
				profile
			);
		}
	});

	it('pins the global members', () => {
		expect(getGatewayDirectToolNamesForProfile('global')).toEqual([
			...CONTROL_TOOL_NAMES,
			'get_workspace_overview',
			'get_project_overview',
			'search_onto_projects',
			'search_all_projects',
			'explore_project',
			'get_document_outline',
			'read_document_section',
			'list_onto_tasks',
			'get_onto_task_details',
			'create_onto_task',
			'update_onto_task',
			'move_onto_task',
			'create_onto_project',
			'delegate_task',
			'web_search',
			'web_visit',
			'list_calendar_events',
			'get_calendar_event_details',
			'create_calendar_event',
			'update_calendar_event',
			'delete_calendar_event'
		]);
	});

	it('narrows the project surface to one project and widens it with documents', () => {
		const global = new Set(getGatewayDirectToolNamesForProfile('global'));
		const project = getGatewayDirectToolNamesForProfile('project');
		const projectSet = new Set(project);

		expect(project).toEqual([
			...getGatewayDirectToolNamesForProfile('global').filter(
				(name) =>
					name !== 'search_onto_projects' &&
					name !== 'search_all_projects' &&
					name !== 'create_onto_project'
			),
			'get_onto_project_details',
			'search_project',
			'list_onto_documents',
			'get_document_tree',
			'create_onto_document',
			'update_onto_document',
			'move_document_in_tree',
			'get_project_calendar',
			'set_project_calendar'
		]);
		expect([...global].filter((name) => !projectSet.has(name))).toEqual([
			'search_onto_projects',
			'search_all_projects',
			'create_onto_project'
		]);
	});

	// The project adapter creates a bounded shell (goals: 0, tasks: 0), so the
	// reviewed goal and task creates are what complete a fully specified
	// creation request after the shell returns its id.
	it('keeps project creation to the shell, its child creates, and the controls', () => {
		const expected = [
			...CONTROL_TOOL_NAMES,
			'create_onto_project',
			'create_onto_goal',
			'create_onto_task'
		];
		expect(getGatewayDirectToolNamesForProfile('project_create')).toEqual(expected);
		// No discovery tools ride the creation surface.
		expect(surfaceNames(getGatewaySurfaceForContextType('project_create'))).toEqual(expected);
	});

	it('mounts no name the worker cannot execute', () => {
		const omitted = new Set<string>(AGENTIC_CHAT_WORKER_OMITTED_TOOL_NAMES_V1);
		for (const profile of GATEWAY_SURFACE_PROFILE_NAMES) {
			for (const name of getGatewayDirectToolNamesForProfile(profile)) {
				if (omitted.has(name)) continue;
				expect(
					isAgenticChatWorkerExecutableToolNameV1(name),
					`${profile} mounts worker-unexecutable ${name}`
				).toBe(true);
			}
		}
		for (const name of GATEWAY_EMAIL_SURFACE_TOOL_NAMES) {
			expect(isAgenticChatWorkerExecutableToolNameV1(name), name).toBe(true);
		}
	});

	it('keeps deletes, contacts and relationship tools off every static surface', () => {
		const forbidden = [
			'delete_onto_task',
			'delete_onto_project',
			'delete_onto_document',
			'search_user_contacts',
			'upsert_user_contact',
			'get_entity_relationships',
			'get_linked_entities',
			'commit_change_set',
			'change_chat_context'
		];
		for (const profile of GATEWAY_SURFACE_PROFILE_NAMES) {
			const names = getGatewayDirectToolNamesForProfile(profile);
			for (const name of forbidden) {
				expect(names, `${profile}: ${name}`).not.toContain(name);
			}
		}
		expect(materializeGatewayTools([], ['change_chat_context']).tools).toEqual([]);
	});

	// The email group is per-user state, not a static surface member: worker
	// admission appends it only for users with a connected mailbox (A8).
	it('keeps the email group off every static surface but resolvable on demand', () => {
		for (const profile of GATEWAY_SURFACE_PROFILE_NAMES) {
			const names = getGatewayDirectToolNamesForProfile(profile);
			for (const name of GATEWAY_EMAIL_SURFACE_TOOL_NAMES) {
				expect(names, `${profile}: ${name}`).not.toContain(name);
			}
		}
		const appended = materializeGatewayTools(getGatewaySurfaceForProfile('global'), [
			...GATEWAY_EMAIL_SURFACE_TOOL_NAMES
		]);
		expect(appended.addedToolNames).toEqual([...GATEWAY_EMAIL_SURFACE_TOOL_NAMES]);
	});

	// list_onto_tasks is only usable on a global turn because project_id is
	// optional; get_onto_task_details needs an id the scan supplies.
	it('keeps list_onto_tasks callable without a project_id', () => {
		const listTasks = getGatewaySurfaceForProfile('global').find(
			(tool) => tool.function.name === 'list_onto_tasks'
		);
		expect(listTasks?.function.parameters.required ?? []).toEqual([]);
		expect(listTasks?.function.parameters.properties).toHaveProperty('project_id');
	});
});

describe('static surface descriptions', () => {
	// The worker never grows its surface mid-turn and rejects any call outside
	// the pass's tool list as a permanent error. A description that points at a
	// tool absent from the same profile is therefore a trap, not guidance
	// (turn-executor audit 2026-09-02, Finding 2; lane C §2.1 items 3-6).
	it('never name a tool that is not mounted on the same worker-visible profile', () => {
		const vocabulary = new Set(surfaceNames(AGENTIC_CHAT_TOTAL_TOOL_VOCABULARY));
		const omitted = new Set<string>(AGENTIC_CHAT_WORKER_OMITTED_TOOL_NAMES_V1);
		const violations: string[] = [];
		for (const profile of GATEWAY_SURFACE_PROFILE_NAMES) {
			// The email group rides the same immutable surface when it is
			// appended, so check both shapes of every profile.
			for (const [label, surface] of [
				[profile, getGatewaySurfaceForProfile(profile)],
				[
					`${profile}+email`,
					materializeGatewayTools(getGatewaySurfaceForProfile(profile), [
						...GATEWAY_EMAIL_SURFACE_TOOL_NAMES
					]).tools
				]
			] as const) {
				const visible = surface.filter((tool) => !omitted.has(tool.function.name));
				const mounted = new Set(surfaceNames(visible));
				for (const tool of visible) {
					const text = collectDescriptionText(tool).join('\n');
					for (const token of text.match(/[a-z][a-z0-9]*(?:_[a-z0-9]+)+/g) ?? []) {
						if (vocabulary.has(token) && !mounted.has(token)) {
							violations.push(`${label}: ${tool.function.name} mentions ${token}`);
						}
					}
				}
			}
		}
		expect(violations).toEqual([]);
	});

	it('never mention discovery tools the worker cannot call', () => {
		const discoveryNames = [
			'skill_search',
			'skill_load',
			'skill_reference_load',
			'domain_search',
			'domain_load',
			'tool_search',
			'tool_schema'
		];
		const omitted = new Set<string>(AGENTIC_CHAT_WORKER_OMITTED_TOOL_NAMES_V1);
		for (const profile of GATEWAY_SURFACE_PROFILE_NAMES) {
			for (const tool of getGatewaySurfaceForProfile(profile)) {
				if (omitted.has(tool.function.name)) continue;
				const text = collectDescriptionText(tool).join('\n');
				for (const name of discoveryNames) {
					expect(text, `${profile}: ${tool.function.name}`).not.toContain(name);
				}
			}
		}
	});
});

describe('gateway materialization policy', () => {
	it('keeps denied discoveries out of the callable surface and reports them', () => {
		const result = materializeGatewayTools([], ['get_onto_task_details', 'delete_onto_task'], {
			allowToolName: (toolName) => toolName !== 'delete_onto_task'
		});

		expect(result.tools.map((tool) => tool.function.name)).toEqual(['get_onto_task_details']);
		expect(result.addedToolNames).toEqual(['get_onto_task_details']);
		expect(result.blockedToolNames).toEqual(['delete_onto_task']);
	});
});
