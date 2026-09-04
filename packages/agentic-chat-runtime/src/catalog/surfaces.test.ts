// packages/agentic-chat-runtime/src/catalog/surfaces.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolDefinition } from '@buildos/shared-types';
import { AGENTIC_CHAT_WORKER_OMITTED_TOOL_NAMES_V1 } from '../worker-tool-policy';
import { AGENTIC_CHAT_TOTAL_TOOL_VOCABULARY } from './definitions';
import {
	GATEWAY_SURFACE_PROFILE_NAMES,
	getGatewayDirectToolNamesForProfile,
	getGatewaySurfaceForContextType,
	getGatewaySurfaceForProfile,
	materializeGatewayTools
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

describe('project-create gateway surface', () => {
	it('separates the web compound surface from reviewed shell/goal/task creation', () => {
		const expected = [
			'declare_turn_contract',
			'declare_read_only_turn',
			'request_turn_clarification',
			'cancel_turn_contract',
			'create_onto_project',
			'create_onto_goal',
			'create_onto_task'
		];

		expect(getGatewayDirectToolNamesForProfile('project_create_minimal')).toEqual(expected);
		expect(getGatewayDirectToolNamesForProfile('project_create_compound')).toEqual([
			'create_onto_project'
		]);
		const surface = getGatewaySurfaceForContextType('project_create');
		expect(surface.map((tool) => tool.function.name)).toEqual(['create_onto_project']);
		const reviewedSurface = getGatewaySurfaceForProfile('project_create_minimal');
		expect(
			reviewedSurface.find((tool) => tool.function.name === 'create_onto_goal')?.function
				.parameters.required
		).toEqual(['project_id', 'name']);
		expect(
			reviewedSurface.find((tool) => tool.function.name === 'create_onto_task')?.function
				.parameters.required
		).toEqual(['project_id', 'title']);
	});
});

describe('global document reads (Decision 2, 2026-09-02)', () => {
	it('mounts outline and section reads on the global surfaces', () => {
		for (const profile of ['global_basic', 'global_write'] as const) {
			const names = getGatewayDirectToolNamesForProfile(profile);
			expect(names, profile).toContain('get_document_outline');
			expect(names, profile).toContain('read_document_section');
		}
		expect(surfaceNames(getGatewaySurfaceForContextType('global'))).toEqual(
			expect.arrayContaining(['get_document_outline', 'read_document_section'])
		);
	});

	// Start Here / global-reach audit 2026-09-03: global_basic carried no
	// task-level read at all, so a global turn naming a task could not reach it.
	it('mounts the task scan→read pair on the global surfaces', () => {
		for (const profile of ['global_basic', 'global_write'] as const) {
			const names = getGatewayDirectToolNamesForProfile(profile);
			expect(names, profile).toContain('list_onto_tasks');
			expect(names, profile).toContain('get_onto_task_details');
			expect(new Set(names).size, profile).toBe(names.length);
		}
		expect(surfaceNames(getGatewaySurfaceForContextType('global'))).toEqual(
			expect.arrayContaining(['list_onto_tasks', 'get_onto_task_details'])
		);
	});

	// list_onto_tasks is only usable on a global turn because project_id is
	// optional; get_onto_task_details needs an id the scan supplies.
	it('keeps list_onto_tasks callable without a project_id', () => {
		const listTasks = getGatewaySurfaceForProfile('global_basic').find(
			(tool) => tool.function.name === 'list_onto_tasks'
		);
		expect(listTasks?.function.parameters.required ?? []).toEqual([]);
		expect(listTasks?.function.parameters.properties).toHaveProperty('project_id');
	});

	it('mounts the retired context-shift tool on no surface', () => {
		for (const profile of GATEWAY_SURFACE_PROFILE_NAMES) {
			expect(getGatewayDirectToolNamesForProfile(profile), profile).not.toContain(
				'change_chat_context'
			);
		}
		expect(materializeGatewayTools([], ['change_chat_context']).tools).toEqual([]);
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
			const surface = getGatewaySurfaceForProfile(profile).filter(
				(tool) => !omitted.has(tool.function.name)
			);
			const mounted = new Set(surfaceNames(surface));
			for (const tool of surface) {
				const text = collectDescriptionText(tool).join('\n');
				for (const token of text.match(/[a-z][a-z0-9]*(?:_[a-z0-9]+)+/g) ?? []) {
					if (vocabulary.has(token) && !mounted.has(token)) {
						violations.push(`${profile}: ${tool.function.name} mentions ${token}`);
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
