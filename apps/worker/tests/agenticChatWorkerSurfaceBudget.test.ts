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
		const globalBasic = measure('global_basic');
		const projectWriteDocument = measure('project_write_document');
		process.stderr.write(
			`WORKER global_basic: opening tools=${globalBasic.opening.length} bytes=${globalBasic.openingBytes} (all passes ${globalBasic.admitted.length}/${globalBasic.admittedBytes})\n` +
				`WORKER project_write_document: opening tools=${projectWriteDocument.opening.length} bytes=${projectWriteDocument.openingBytes} (all passes ${projectWriteDocument.admitted.length}/${projectWriteDocument.admittedBytes})\n`
		);

		// Ratchets set 2026-09-02 at measured + 5%. Measured on that day, after
		// the sidecar removal (Finding 9), change_chat_context retirement and the
		// global document reads (Decision 2):
		//   global_basic            opening  9 tools /  6,449 B (was  8 /  9,306 B)
		//   project_write_document  opening 16 tools / 16,149 B (was 17 / 23,242 B)
		//   project_write_document  all pass 17 tools / 18,882 B (was 18 / 26,323 B)
		// Re-ratcheted 2026-09-03 (Cedar House battery): global_basic gained
		// list_onto_tasks + get_onto_task_details (a global turn had no task-level
		// read at all), and create/update_onto_task gained calendar_sync. Measured:
		//   global_basic            opening 11 tools /  7,435 B
		//   project_write_document  opening 16 tools / 16,847 B
		//   project_write_document  all pass 17 tools / 19,900 B
		// Re-ratcheted 2026-09-04 (calendar writes on the worker): the profile
		// already listed set_project_calendar, which the worker used to drop as
		// unexecutable; now that it executes, its narrowed schema is billed.
		// global_basic is unchanged. Measured:
		//   project_write_document  opening 16 tools / 17,598 B (+751)
		//   project_write_document  all pass 17 tools / 20,651 B (+751)
		expect(globalBasic.openingBytes).toBeLessThanOrEqual(7_810);
		expect(projectWriteDocument.openingBytes).toBeLessThanOrEqual(18_470);
		expect(projectWriteDocument.admittedBytes).toBeLessThanOrEqual(21_680);
	});

	it('mounts document reads on the global worker surface', () => {
		const names = measure('global_basic').opening.map((tool) => tool.function.name);
		expect(names).toEqual(
			expect.arrayContaining(['get_document_outline', 'read_document_section'])
		);
		expect(names).not.toContain('change_chat_context');
	});

	it('attaches scheduling sidecars only to mutation tools of an explicit write pass', () => {
		const { admitted } = measure('project_write_document');
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
		const projectWriteDocument = measure('project_write_document');
		// The artifact lists the deferred declare_turn_contract; that is a known
		// deferral, not a gap, so the happy-path opening pass has no override.
		expect(
			buildWorkerToolSurfaceOverride(projectWriteDocument.input, projectWriteDocument.opening)
		).toBeNull();
		expect(
			buildWorkerToolSurfaceOverride(
				measure('global_basic').input,
				measure('global_basic').opening
			)
		).toBeNull();

		// global_write used to render an override purely because it named calendar
		// WRITES the worker could not execute. The reads moved on 2026-09-03 and
		// the writes on 2026-09-04, so the whole profile is now executable and the
		// third tool list disappears from the prompt.
		const globalWrite = measure('global_write');
		expect(buildWorkerToolSurfaceOverride(globalWrite.input, globalWrite.opening)).toBeNull();
		const globalWriteNames = globalWrite.opening.map((tool) => tool.function.name);
		expect(globalWriteNames).toContain('list_calendar_events');
		expect(globalWriteNames).toContain('get_calendar_event_details');
		expect(globalWriteNames).toContain('create_calendar_event');
		expect(globalWriteNames).toContain('update_calendar_event');
	});

	it('never lets a worker-projected description advertise a tool outside the same surface', () => {
		const vocabulary = new Set(
			AGENTIC_CHAT_TOTAL_TOOL_VOCABULARY.map((definition) => definition.function.name)
		);
		const violations: string[] = [];
		for (const profile of [
			'global_basic',
			'global_write',
			'project_write_document',
			'project_create_minimal'
		] as const) {
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
