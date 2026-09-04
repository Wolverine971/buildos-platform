// packages/agentic-chat-runtime/src/loop/repair-instructions.test.ts
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import {
	buildGatewayRequiredFieldRepairInstruction,
	buildProjectCreateNoExecutionRepairInstruction,
	buildToolValidationRepairInstruction,
	classifyReceiptGroundedAssistantDisposition,
	enforceMutationOutcomeIntegrity,
	formatUnfulfilledMutationOutcomeDisclosure,
	looksLikeUnfulfilledMutationDisclosure,
	type UnfulfilledMutationOutcomeDisclosureV1
} from './repair-instructions';
import type { FastToolExecution } from './shared';
import { provideAgenticChatLoopToolCatalog } from './tool-catalog';

provideAgenticChatLoopToolCatalog(() => ({
	ops: {},
	byToolName: {
		move_onto_task: { op: 'onto.task.move', tool_name: 'move_onto_task', kind: 'write' }
	}
}));

function writeExecution(name: string, success: boolean, result: unknown): FastToolExecution {
	const toolCall: ChatToolCall = {
		id: `${name}:${Math.random().toString(36).slice(2)}`,
		type: 'function',
		function: { name, arguments: JSON.stringify({ task_id: 'task_1' }) }
	};
	const toolResult: ChatToolResult = { tool_call_id: toolCall.id, success, result };
	return { toolCall, result: toolResult };
}

const PARTIAL_MOVE_OUTCOME: UnfulfilledMutationOutcomeDisclosureV1 = {
	action: 'move',
	entityKind: 'task',
	declaredTargetCount: 6,
	completedTargetCount: 2,
	requiredEffects: 6,
	missingTargets: [
		{ id: 'task_3', title: 'Task C' },
		{ id: 'task_4', title: 'Task D' },
		{ id: 'task_5', title: null },
		{ id: 'task_6', title: 'Task F' }
	]
};

describe('unfulfilled mutation outcome disclosure', () => {
	it('formats the partial count and names the unfinished targets by title or id', () => {
		expect(formatUnfulfilledMutationOutcomeDisclosure([PARTIAL_MOVE_OUTCOME])).toBe(
			'Done: 2 of 6 moves. Not yet moved: Task C, Task D, task_5, Task F.'
		);
		expect(
			formatUnfulfilledMutationOutcomeDisclosure([
				{
					action: 'create',
					entityKind: 'document',
					description: 'Create the handoff document',
					declaredTargetCount: 0,
					completedTargetCount: 0,
					requiredEffects: 1,
					missingTargets: []
				}
			])
		).toBe('Done: 0 of 1 creation. Not yet created: Create the handoff document.');
	});

	it('caps a long missing-target list', () => {
		const missingTargets = Array.from({ length: 14 }, (_, index) => ({
			id: `task_${index}`,
			title: `Task ${index}`
		}));
		const text = formatUnfulfilledMutationOutcomeDisclosure([
			{ ...PARTIAL_MOVE_OUTCOME, declaredTargetCount: 16, missingTargets }
		]);
		expect(text).toContain('Task 9, and 4 more.');
		expect(text).not.toContain('Task 10');
	});

	it('appends the disclosure after a successful write when the prose hides the remainder', () => {
		const text = enforceMutationOutcomeIntegrity('Moved Task A and Task B into Backlog.', {
			contextType: 'project',
			toolExecutions: [
				writeExecution('move_onto_task', true, { status: 'moved', task: { id: 'task_1' } })
			],
			explicitMutationRequested: true,
			unfulfilledOutcomes: [PARTIAL_MOVE_OUTCOME]
		});
		expect(text).toBe(
			'Moved Task A and Task B into Backlog.\n\nDone: 2 of 6 moves. Not yet moved: Task C, Task D, task_5, Task F.'
		);
	});

	it('does not append when the model already disclosed the remainder or nothing was written', () => {
		const disclosed = 'Moved Task A and Task B. The other four are not yet moved.';
		expect(
			enforceMutationOutcomeIntegrity(disclosed, {
				contextType: 'project',
				toolExecutions: [
					writeExecution('move_onto_task', true, {
						status: 'moved',
						task: { id: 'task_1' }
					})
				],
				explicitMutationRequested: true,
				unfulfilledOutcomes: [PARTIAL_MOVE_OUTCOME]
			})
		).toBe(disclosed);
		expect(
			enforceMutationOutcomeIntegrity('I could not find those tasks.', {
				contextType: 'project',
				toolExecutions: [],
				explicitMutationRequested: true,
				unfulfilledOutcomes: [PARTIAL_MOVE_OUTCOME]
			})
		).toBe('I could not find those tasks.');
	});

	it('recognises honest partial-progress prose', () => {
		for (const text of [
			'Done: 2 of 6 moves.',
			'The rest are still pending.',
			'I only moved two of them.',
			'I ran out of steps before the last four.',
			'I have not yet moved the remaining tasks.'
		]) {
			expect(looksLikeUnfulfilledMutationDisclosure(text)).toBe(true);
		}
		expect(looksLikeUnfulfilledMutationDisclosure('Moved all six tasks into Backlog.')).toBe(
			false
		);
	});
});

describe('receipt-grounded assistant disposition', () => {
	it('classifies the exact unreceipted production completion claim', () => {
		expect(
			classifyReceiptGroundedAssistantDisposition(
				'Got it — marking the usage-based pricing migration done. And just to make sure I follow: when you say "the email one," are you referring to Fix the email verification bug or Send the launch email?'
			)
		).toBe('mutation_claim');
	});

	it('classifies an unresolved target question but leaves optional offers alone', () => {
		expect(
			classifyReceiptGroundedAssistantDisposition(
				'Which matching task should I mark complete?'
			)
		).toBe('clarification_question');
		expect(
			classifyReceiptGroundedAssistantDisposition(
				'Here is the current project status. Would you like me to summarize the risks too?'
			)
		).toBeNull();
	});

	it('does not mistake suggested wording for a completed mutation', () => {
		expect(
			classifyReceiptGroundedAssistantDisposition(
				'Perhaps suggest updating it or marking tasks done.'
			)
		).toBeNull();
	});
});

describe('tool validation repair instructions', () => {
	it('repairs web project relationships without switching execution workflows', () => {
		const instruction = buildToolValidationRepairInstruction(
			[
				{
					toolCall: {
						id: 'project-create-invalid',
						type: 'function',
						function: {
							name: 'create_onto_project',
							arguments: '{"relationships":[null]}'
						}
					},
					toolName: 'create_onto_project',
					op: 'onto.project.create',
					errors: ['Invalid relationships[0]: expected an object.']
				}
			],
			true
		);

		expect(instruction).toContain(
			'Each relationship must be an object with from and to objects'
		);
		expect(instruction).toContain('Keep any initial goals, tasks, plans, documents');
		expect(instruction).not.toContain('relationships must be an empty array');
		expect(instruction).not.toContain('create_onto_goal');
		expect(instruction).not.toContain('create_onto_task');
		expect(instruction).toContain('do not call tool_search, tool_schema');
		expect(instruction).not.toContain('Load exact-op help before retrying');
		expect(instruction).not.toContain('For first-time or uncertain writes');
	});

	it('retries web project creation using only the available one-call tool', () => {
		const instruction = buildProjectCreateNoExecutionRepairInstruction();

		expect(instruction).toContain('Build one complete create_onto_project call');
		expect(instruction).toContain('include them in entities in this same call');
		expect(instruction).not.toContain('declare_turn_contract');
		expect(instruction).not.toContain('create_onto_goal');
		expect(instruction).not.toContain('create_onto_task');
		expect(instruction).not.toMatch(/web-owned|reviewed flow|project shell|bounded surface/i);
	});

	it('repairs repeated web project fields without suggesting unavailable help tools', () => {
		const instruction = buildGatewayRequiredFieldRepairInstruction([
			{ op: 'onto.project.create', field: 'project.name', occurrences: 2 }
		]);

		expect(instruction).toContain('Correct and retry that tool directly');
		expect(instruction).toContain('same create_onto_project call');
		expect(instruction).not.toContain('tool_schema');
		expect(instruction).not.toContain('create_onto_goal');
		expect(instruction).not.toContain('create_onto_task');
	});
});

// ---------------------------------------------------------------------------
// Static surface guard.
//
// This module accumulated repair builders faster than anything retired them:
// most of what it exports was written for the web streaming engine, which no
// longer serves a production request. The guard below reads the repository
// itself so a builder cannot go quietly unreferenced again, and it pins the
// exact set that only the retired web engine still imports so that deleting
// that engine forces the matching builders out with it.
// ---------------------------------------------------------------------------

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SOURCE_MODULE = join(
	REPO_ROOT,
	'packages/agentic-chat-runtime/src/loop/repair-instructions.ts'
);

/** Paths that belong to the retired web streaming engine (deleted by stage S8). */
const RETIRED_WEB_ENGINE_PREFIXES = [
	'apps/web/src/lib/services/agentic-chat/legacy-execution/',
	'apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/',
	'apps/web/src/routes/api/agent/v2/stream/'
];

/**
 * Builders whose only remaining importer is the retired web engine. Deleting
 * that engine must delete these too: the first guard below turns each one into
 * a failure the moment its last importer disappears, and this list is the
 * ready-made delete manifest. Nothing may be added here — a new builder that
 * only the retired engine calls is a builder that should not have been written.
 */
const RETIRED_WEB_ENGINE_ONLY_EXPORTS = [
	'ReadLoopRepairInstructionLevel',
	'SkillGateTelemetry',
	'buildConsolidatedRepairInstruction',
	'buildGatewayCreateFieldNoProgressRepairInstruction',
	'buildGatewayMutationNoExecutionRepairInstruction',
	'buildGatewayRequiredFieldRepairInstruction',
	'buildProjectCreateNoExecutionRepairInstruction',
	'buildResearchNoPersistRepairInstruction',
	'buildSkillGateNoLoadRepairInstruction',
	'buildSkillGateTelemetry',
	'buildStatedFutureRepairInstruction',
	'buildToolRoundBudgetSynthesisInstruction',
	'collectDocumentInventoryFromReads',
	'countDistinctSuccessfulWriteTargets',
	'countWebResearchCalls',
	'didCreateDurableRecord',
	'hasGatewayCreateFieldNoProgressFailure',
	'looksLikeStatedFuture',
	'shouldRepairGatewayMutationNoExecution',
	'shouldRepairOrganizeCommissionNoExecution',
	'shouldRepairProjectCreateNoExecution',
	'shouldRepairResearchNoPersist',
	'shouldRepairSkillGateNoLoad',
	'shouldRepairStatedFutureNotRecorded'
];

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '.turbo', '.svelte-kit', 'build']);

function exportedNames(source: string): string[] {
	return [
		...source.matchAll(
			/^export\s+(?:async\s+)?(?:function|const|type|class|interface)\s+([A-Za-z0-9_]+)/gm
		)
	].map((match) => match[1]!);
}

function sourceFilesUnder(directory: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
			files.push(...sourceFilesUnder(path));
			continue;
		}
		if (!/\.(ts|svelte)$/.test(entry.name)) continue;
		if (/\.(test|spec)\.ts$/.test(entry.name)) continue;
		files.push(path);
	}
	return files;
}

/** Identifiers named only in prose are not references. */
function withoutComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function scanRoots(): string[] {
	const roots = ['apps/web/src', 'apps/worker/src'];
	const packagesRoot = join(REPO_ROOT, 'packages');
	if (existsSync(packagesRoot)) {
		for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
			if (entry.isDirectory() && existsSync(join(packagesRoot, entry.name, 'src'))) {
				roots.push(`packages/${entry.name}/src`);
			}
		}
	}
	return roots.filter((root) => existsSync(join(REPO_ROOT, root)));
}

function classifyExportReferences(): {
	unreferenced: string[];
	retiredEngineOnly: string[];
} {
	const names = exportedNames(readFileSync(SOURCE_MODULE, 'utf8'));
	const live = new Set<string>();
	const retired = new Set<string>();
	const patterns = names.map((name) => [name, new RegExp(`\\b${name}\\b`)] as const);
	for (const root of scanRoots()) {
		for (const file of sourceFilesUnder(join(REPO_ROOT, root))) {
			if (file === SOURCE_MODULE) continue;
			const relative = file.slice(REPO_ROOT.length);
			const isRetired = RETIRED_WEB_ENGINE_PREFIXES.some((prefix) =>
				relative.startsWith(prefix)
			);
			const text = withoutComments(readFileSync(file, 'utf8'));
			for (const [name, pattern] of patterns) {
				if (!pattern.test(text)) continue;
				(isRetired ? retired : live).add(name);
			}
		}
	}
	return {
		unreferenced: names.filter((name) => !live.has(name) && !retired.has(name)).sort(),
		retiredEngineOnly: names.filter((name) => !live.has(name) && retired.has(name)).sort()
	};
}

describe('repair-instruction export surface', () => {
	it('keeps every export referenced by a non-test module', () => {
		// A builder nothing calls is dead prompt text that still ships in the
		// bundle and still has to be read by whoever edits this file next.
		expect(classifyExportReferences().unreferenced).toEqual([]);
	});

	it('pins the builders that only the retired web engine still imports', () => {
		// Deleting the retired engine must delete exactly these with it; the
		// guard above fails the moment one of them loses its last importer.
		expect(classifyExportReferences().retiredEngineOnly).toEqual(
			RETIRED_WEB_ENGINE_ONLY_EXPORTS
		);
	});
});
