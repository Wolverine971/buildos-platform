// apps/worker/tests/agenticChatWorkerSurfaceBudget.test.ts
//
// Worker-projected tool-surface budget (turn-executor audit 2026-09-02,
// Findings 2 and 9). The web budget test (prompt-size-budget.test.ts) measures
// the artifact as admitted; the worker re-projects it (drops omitted names,
// narrows mutation schemas, attaches scheduling sidecars on write passes) and
// that projection is what the acting model is billed for on every pass. Bytes
// here are `JSON.stringify(tools)` in UTF-8, the exact shape sent to the
// provider. If a cap fails, decide whether the growth is worth it, then bump it
// WITH a dated comment.
import { describe, expect, it } from 'vitest';
import {
	AGENTIC_CHAT_WORKER_EXECUTABLE_MUTATION_TOOL_NAMES_V1,
	AGENTIC_CHAT_WORKER_OMITTED_TOOL_NAMES_V1
} from '@buildos/agentic-chat-runtime';
import {
	AGENTIC_CHAT_TOTAL_TOOL_VOCABULARY,
	DECLARE_TURN_CONTRACT_TOOL_NAME,
	type GatewaySurfaceProfileName,
	getGatewaySurfaceForProfile
} from '@buildos/agentic-chat-runtime/catalog';
import type { AgenticChatWorkerExecutionInputV1 } from '../src/workers/agentic-chat/executionInput';
import {
	ALL_AGENTIC_CHAT_MUTATION_CAPABILITIES_V1,
	reviewedAgenticChatMutationSpecV1
} from '../src/workers/agentic-chat/mutationToolCatalog';
import {
	buildWorkerToolSurfaceOverride,
	deferComplexWriteContractForInitialPass,
	hasSchedulingSidecar,
	productionToolsFor,
	withSchedulingSidecar
} from '../src/workers/agentic-chat/provider/tool-surface';

const WORKER_OMITTED = new Set<string>(AGENTIC_CHAT_WORKER_OMITTED_TOOL_NAMES_V1);
const WORKER_MUTATIONS = new Set<string>(AGENTIC_CHAT_WORKER_EXECUTABLE_MUTATION_TOOL_NAMES_V1);
const SIDECAR_PROPERTY_NAMES = ['call_ref', 'after'];

/**
 * Mirror web admission (`resolveWorkerPromptTools`): omitted discovery and the
 * retired read-only control never reach the artifact, and the contract schema
 * is dropped when no worker mutation is mounted.
 */
function admittedExecutionInputFor(
	profile: GatewaySurfaceProfileName
): AgenticChatWorkerExecutionInputV1 {
	const candidates = getGatewaySurfaceForProfile(profile).filter(
		(tool) => !WORKER_OMITTED.has(tool.function.name)
	);
	const hasMutation = candidates.some((tool) => WORKER_MUTATIONS.has(tool.function.name));
	const definitions = hasMutation
		? candidates
		: candidates.filter((tool) => tool.function.name !== DECLARE_TURN_CONTRACT_TOOL_NAME);
	return {
		artifact: {
			prepared: {
				toolSurface: {
					version: 1,
					surfaceProfile: profile,
					toolNames: definitions.map((tool) => tool.function.name),
					definitions
				}
			}
		}
	} as unknown as AgenticChatWorkerExecutionInputV1;
}

function bytesOf(tools: readonly unknown[]): number {
	return Buffer.byteLength(JSON.stringify(tools), 'utf8');
}

function measure(profile: GatewaySurfaceProfileName) {
	const input = admittedExecutionInputFor(profile);
	const admitted = productionToolsFor(input, ALL_AGENTIC_CHAT_MUTATION_CAPABILITIES_V1, true);
	const opening = deferComplexWriteContractForInitialPass(input, admitted, true);
	return {
		input,
		admitted,
		opening,
		admittedBytes: bytesOf(admitted),
		openingBytes: bytesOf(opening)
	};
}

function propertyNames(tool: { function: { parameters: Record<string, unknown> } }): string[] {
	const properties = tool.function.parameters.properties;
	return properties && typeof properties === 'object' ? Object.keys(properties) : [];
}

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

describe('Agentic Chat worker-projected surface budget', () => {
	it('keeps the production opening-pass surfaces under budget', () => {
		const global = measure('global');
		const project = measure('project');
		const projectCreate = measure('project_create');
		process.stderr.write(
			`WORKER global: opening tools=${global.opening.length} bytes=${global.openingBytes} (all passes ${global.admitted.length}/${global.admittedBytes})\n` +
				`WORKER project: opening tools=${project.opening.length} bytes=${project.openingBytes} (all passes ${project.admitted.length}/${project.admittedBytes})\n` +
				`WORKER project_create: opening tools=${projectCreate.opening.length} bytes=${projectCreate.openingBytes} (all passes ${projectCreate.admitted.length}/${projectCreate.admittedBytes})\n`
		);

		// RE-BASELINED 2026-09-04 for the three stable surfaces (one-engine stage
		// S6). The nine profiles this replaces were partly chosen by regex over
		// the user's message; a stable surface carries on every turn what those
		// patterns used to materialize. The growth here is delegate_task, the web
		// pair, move_onto_task and the calendar tools on both surfaces.
		// Previous ratchets, for reference: global_basic 7,810 B opening,
		// project_write_document 18,470 B opening / 21,680 B all passes.
		// Measured on this branch, caps at measured + ~5%:
		//   global         23 tools / 27,317 B (opening == all passes)
		//   project        30 tools / 34,269 B
		//   project_create  6 tools / 11,465 B (members unchanged from the old
		//                  project_create_minimal, which had no cap here)
		// Ratcheted 2026-09-04 (retest remediation): global 28,700 → 32,700.
		// Measured 31,085 B: create_onto_project now rides the global surface
		// (~2.2k B after its dead entities item schema was dropped; a General
		// Chat "create a project" turn was a dead turn before), plus the priority
		// label vocabulary and duration_minutes descriptions on the task tools.
		expect(global.openingBytes).toBeLessThanOrEqual(32_700);
		expect(project.openingBytes).toBeLessThanOrEqual(36_000);
		// 2026-09-04 postdeploy: admit directed relationships and their symbolic
		// endpoint schema; lazy contracts still keep the opening pass below 36k.
		expect(project.admittedBytes).toBeLessThanOrEqual(39_000);
		expect(projectCreate.admittedBytes).toBeLessThanOrEqual(12_400);
	});

	it('mounts document reads on the global worker surface', () => {
		const names = measure('global').opening.map((tool) => tool.function.name);
		expect(names).toEqual(
			expect.arrayContaining([
				'get_document_outline',
				'read_document_section',
				'get_onto_document_details'
			])
		);
		expect(names).not.toContain('change_chat_context');
	});
	it('defers contracts on stable opening surfaces while admitting project dependencies', () => {
		for (const profile of ['global', 'project'] as const) {
			const surface = measure(profile);
			expect(surface.opening.map((tool) => tool.function.name)).not.toContain(
				'declare_turn_contract'
			);
			expect(surface.admitted.map((tool) => tool.function.name)).toContain(
				'declare_turn_contract'
			);
		}
		expect(measure('project').opening.map((tool) => tool.function.name)).toContain(
			'link_onto_entities'
		);
		expect(measure('global').opening.map((tool) => tool.function.name)).not.toContain(
			'link_onto_entities'
		);
	});

	// A calendar or daily-brief turn is a global turn now, and every capability
	// those profiles used to carry alone is executable here.
	it('keeps the whole global surface executable, with no capability override', () => {
		const global = measure('global');
		expect(buildWorkerToolSurfaceOverride(global.input, global.opening)).toBeNull();
		const names = global.opening.map((tool) => tool.function.name);
		for (const name of [
			'list_calendar_events',
			'get_calendar_event_details',
			'create_calendar_event',
			'update_calendar_event',
			'delete_calendar_event',
			'delegate_task',
			'web_search',
			'web_visit',
			'move_onto_task'
		]) {
			expect(names, name).toContain(name);
		}
	});

	it('attaches scheduling sidecars only to mutation tools of an explicit write pass', () => {
		const { admitted } = measure('project');
		for (const tool of admitted) {
			expect(propertyNames(tool), tool.function.name).not.toEqual(
				expect.arrayContaining(SIDECAR_PROPERTY_NAMES)
			);
		}
		expect(hasSchedulingSidecar(admitted)).toBe(false);

		const writePass = withSchedulingSidecar(admitted);
		expect(hasSchedulingSidecar(writePass)).toBe(true);
		for (const tool of writePass) {
			const expectsSidecar = reviewedAgenticChatMutationSpecV1(tool.function.name) !== null;
			const carriesSidecar = SIDECAR_PROPERTY_NAMES.every((name) =>
				propertyNames(tool).includes(name)
			);
			expect(carriesSidecar, tool.function.name).toBe(expectsSidecar);
		}
		// Controls and reads are never schedulable.
		for (const name of [
			'request_turn_clarification',
			'cancel_turn_contract',
			'search_project'
		]) {
			expect(
				propertyNames(writePass.find((tool) => tool.function.name === name)!)
			).not.toEqual(expect.arrayContaining(SIDECAR_PROPERTY_NAMES));
		}
		// Sidecar cost (~349 B per tool) is now paid only per mutation tool on a
		// write pass; every tool on every pass used to carry it.
		const mutationToolCount = admitted.filter(
			(tool) => reviewedAgenticChatMutationSpecV1(tool.function.name) !== null
		).length;
		const sidecarBytes = bytesOf(writePass) - bytesOf(admitted);
		expect(mutationToolCount).toBeGreaterThanOrEqual(5);
		expect(sidecarBytes).toBeGreaterThanOrEqual(mutationToolCount * 300);
		expect(sidecarBytes).toBeLessThanOrEqual(mutationToolCount * 400);
	});

	it('renders the surface override only for a genuine capability gap', () => {
		// The artifact lists the deferred declare_turn_contract; that is a known
		// deferral, not a gap, so the happy-path opening pass has no override.
		const project = measure('project');
		expect(buildWorkerToolSurfaceOverride(project.input, project.opening)).toBeNull();
		const projectCreate = measure('project_create');
		expect(
			buildWorkerToolSurfaceOverride(projectCreate.input, projectCreate.opening)
		).toBeNull();
	});

	it('never lets a worker-projected description advertise a tool outside the same surface', () => {
		const vocabulary = new Set(
			AGENTIC_CHAT_TOTAL_TOOL_VOCABULARY.map((definition) => definition.function.name)
		);
		const violations: string[] = [];
		for (const profile of ['global', 'project', 'project_create'] as const) {
			const { admitted } = measure(profile);
			const mounted = new Set(admitted.map((tool) => tool.function.name));
			for (const tool of admitted) {
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
});
