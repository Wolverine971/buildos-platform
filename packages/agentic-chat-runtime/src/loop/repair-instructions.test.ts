// packages/agentic-chat-runtime/src/loop/repair-instructions.test.ts
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import {
	buildToolValidationRepairInstruction,
	enforceMutationOutcomeIntegrity,
	formatUnfulfilledMutationOutcomeDisclosure,
	type UnfulfilledMutationOutcomeDisclosureV1
} from './repair-instructions';
import type { FastToolExecution } from './shared';
import { provideAgenticChatLoopToolCatalog } from './tool-catalog';

provideAgenticChatLoopToolCatalog(() => ({
	ops: {},
	byToolName: {
		create_onto_document: {
			op: 'onto.document.create',
			tool_name: 'create_onto_document',
			kind: 'write'
		},
		move_onto_task: { op: 'onto.task.move', tool_name: 'move_onto_task', kind: 'write' },
		search_onto_documents: {
			op: 'onto.document.search',
			tool_name: 'search_onto_documents',
			kind: 'read'
		}
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

	it('appends the ledger disclosure after a successful write', () => {
		const text = enforceMutationOutcomeIntegrity('Moved Task A and Task B into Backlog.', {
			toolExecutions: [
				writeExecution('move_onto_task', true, { status: 'moved', task: { id: 'task_1' } })
			],
			unfulfilledOutcomes: [PARTIAL_MOVE_OUTCOME]
		});
		expect(text).toBe(
			'Moved Task A and Task B into Backlog.\n\nDone: 2 of 6 moves. Not yet moved: Task C, Task D, task_5, Task F.'
		);
	});

	it('never reads the prose: the receipt lands even when the model already disclosed', () => {
		// The ledger decides. A repeated receipt under an honest answer is the
		// accepted cost of not classifying the answer's wording.
		const disclosed = 'Moved Task A and Task B. The other four are not yet moved.';
		expect(
			enforceMutationOutcomeIntegrity(disclosed, {
				toolExecutions: [
					writeExecution('move_onto_task', true, {
						status: 'moved',
						task: { id: 'task_1' }
					})
				],
				unfulfilledOutcomes: [PARTIAL_MOVE_OUTCOME]
			})
		).toBe(
			`${disclosed}\n\nDone: 2 of 6 moves. Not yet moved: Task C, Task D, task_5, Task F.`
		);
	});

	it('leaves the partial line to the finalization guard when nothing was written', () => {
		expect(
			enforceMutationOutcomeIntegrity('I could not find those tasks.', {
				toolExecutions: [],
				unfulfilledOutcomes: [PARTIAL_MOVE_OUTCOME]
			})
		).toBe('I could not find those tasks.');
	});
});

describe('ledger receipts never depend on answer wording', () => {
	function execution(
		name: string,
		args: Record<string, unknown>,
		result: unknown,
		success = true,
		error?: string
	): FastToolExecution {
		const toolCall: ChatToolCall = {
			id: `${name}:${Math.random().toString(36).slice(2)}`,
			type: 'function',
			function: { name, arguments: JSON.stringify(args) }
		};
		return {
			toolCall,
			result: { tool_call_id: toolCall.id, success, result, ...(error ? { error } : {}) }
		};
	}

	const createRootDocument = () =>
		execution(
			'create_onto_document',
			{ project_id: 'project_1', title: 'Launch pitch', type_key: 'document.default' },
			{
				document: { id: 'doc_1', title: 'Launch pitch' },
				structure: { version: 1, root: [{ id: 'doc_1', order: 0 }] },
				structure_error: null
			}
		);

	it.each([
		// Former lexical "link/placement claim" corrections; the turn contract's
		// unfulfilled outcomes are the structured record of an unmade link or move.
		'Created the Pitch doc and linked it to the Launch goal.',
		'Created **Launch pitch** at the root of the document tree.',
		'Your pitch document is linked to the Launch goal.'
	])('leaves %j alone when every write succeeded', (text) => {
		expect(
			enforceMutationOutcomeIntegrity(text, { toolExecutions: [createRootDocument()] })
		).toBe(text);
	});

	it('appends an unrepaired failure whatever the answer says', () => {
		const failed = execution(
			'create_onto_document',
			{ project_id: 'project_1', title: 'Notes' },
			null,
			false,
			'Document title already exists'
		);
		for (const text of [
			'Created both documents.',
			'The second document failed to save.'
		]) {
			expect(
				enforceMutationOutcomeIntegrity(text, {
					toolExecutions: [createRootDocument(), failed]
				})
			).toBe(
				`${text}\n\nOne write did not complete: document create failed (Document title already exists). I did not persist that part.`
			);
		}
	});

	it('says nothing was saved when every attempted write failed', () => {
		const failed = execution(
			'move_onto_task',
			{ task_id: 'task_1' },
			null,
			false,
			'Task not found'
		);
		expect(
			enforceMutationOutcomeIntegrity('Done — moved the task.', { toolExecutions: [failed] })
		).toBe('Done — moved the task.\n\nNo changes were saved: task move failed (Task not found).');
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
});

// ---------------------------------------------------------------------------
// Static surface guard.
//
// This module accumulated repair builders faster than anything retired them.
// The web streaming engine that owned most of them is deleted, and so are its
// builders. The guard below reads the repository itself so a builder cannot go
// quietly unreferenced again, and the second guard keeps the retired engine's
// directories from returning with a private builder set of their own.
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
 * The retired web engine is gone (stage S8), and with it every builder that
 * only it imported. This list stays empty on purpose: it is the assertion that
 * the engine's directories cannot come back carrying private prompt builders.
 */
const RETIRED_WEB_ENGINE_ONLY_EXPORTS: string[] = [];

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

	it('keeps the retired web engine deleted', () => {
		// The engine's directories are gone; nothing may reintroduce them with
		// builders only they import.
		expect(classifyExportReferences().retiredEngineOnly).toEqual(
			RETIRED_WEB_ENGINE_ONLY_EXPORTS
		);
	});
});
