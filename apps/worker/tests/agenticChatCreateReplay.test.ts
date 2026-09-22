// apps/worker/tests/agenticChatCreateReplay.test.ts
import { describe, expect, it } from 'vitest';
import { canonicalizeAgenticChatJson, type JsonObject } from '@buildos/shared-types';
import type { FastToolExecution } from '@buildos/agentic-chat-runtime/loop';
import {
	TurnCreateReplayGuard,
	createReplayRepairInstruction
} from '../src/workers/agentic-chat/provider/create-replay';
import type { CompletedProviderToolCall } from '../src/workers/agentic-chat/provider/stream-tool-calls';

function call(
	name = 'create_onto_task',
	args: JsonObject = { project_id: 'project-a', title: 'Permit' }
): CompletedProviderToolCall {
	return {
		id: 'new-call',
		name,
		arguments: args,
		canonicalArguments: canonicalizeAgenticChatJson(args),
		canonicalProviderArguments: canonicalizeAgenticChatJson(args)
	};
}

function execution(
	candidate = call(),
	success = true,
	result: JsonObject = { task: { id: 'saved-task', title: 'Permit' } }
): FastToolExecution {
	return {
		toolCall: {
			id: 'old-call',
			type: 'function',
			function: { name: candidate.name, arguments: candidate.canonicalArguments }
		},
		result: {
			tool_call_id: 'old-call',
			success,
			result,
			...(!success ? { error: 'Write did not complete.' } : {})
		}
	};
}

describe('TurnCreateReplayGuard', () => {
	it('matches individual saved creates across different provider IDs and batch order', () => {
		const guard = new TurnCreateReplayGuard();
		const second = call('create_onto_task', { project_id: 'project-a', title: 'Cabinets' });
		guard.record([execution(), execution(second)]);
		expect(guard.find([second, call()]).map((match) => match.exactSavedReplay)).toEqual([
			true,
			true
		]);
		expect(guard.find([call()])[0]?.attempts[0]).toMatchObject({
			status: 'saved',
			entityId: 'saved-task'
		});
	});

	it.each([
		{ description: 'A reworded description' },
		{ title: '  PERMIT  ' },
		{ due_at: '2026-10-01' },
		{ props: { duration_minutes: 90 } }
	])(
		'withholds a same-scope collision without claiming changed fields were saved: %j',
		(changes) => {
			const guard = new TurnCreateReplayGuard();
			guard.record([execution()]);
			const repeats = guard.find([
				call('create_onto_task', { project_id: 'project-a', title: 'Permit', ...changes })
			]);
			expect(repeats).toHaveLength(1);
			expect(repeats[0]?.exactSavedReplay).toBe(false);
		}
	);

	it('matches project names inside the nested project payload despite revised descriptions', () => {
		const guard = new TurnCreateReplayGuard();
		guard.record([
			execution(
				call('create_onto_project', {
					project: { name: 'Cedar House', description: 'Original' }
				}),
				true,
				{ project: { id: 'saved-project' } }
			)
		]);
		const repeats = guard.find([
			call('create_onto_project', {
				project: { name: 'cedar  house', description: 'Reworded' }
			})
		]);
		expect(repeats[0]?.attempts[0]?.entityId).toBe('saved-project');
		expect(repeats[0]?.exactSavedReplay).toBe(false);
	});

	it('keeps project, entity kind, and parent scope separate', () => {
		const guard = new TurnCreateReplayGuard();
		guard.record([execution()]);
		expect(
			guard.find([
				call('create_onto_task', { project_id: 'project-b', title: 'Permit' }),
				call('create_onto_document', { project_id: 'project-a', title: 'Permit' }),
				call('create_onto_task', {
					project_id: 'project-a',
					title: 'Permit',
					plan_id: 'plan-b'
				}),
				call('create_onto_task', { title: 'Permit' }),
				call('update_onto_task', { task_id: 'saved-task', title: 'Permit' })
			])
		).toEqual([]);
	});

	it('treats an omitted and null document parent as the same root scope', () => {
		const guard = new TurnCreateReplayGuard();
		guard.record([
			execution(call('create_onto_document', { project_id: 'project-a', title: 'Brief' }))
		]);
		expect(
			guard.find([
				call('create_onto_document', {
					project_id: 'project-a',
					title: 'Brief',
					parent_id: null
				})
			])
		).toHaveLength(1);
		expect(
			guard.find([
				call('create_onto_document', {
					project_id: 'project-a',
					title: 'Brief',
					parent_id: 'folder'
				})
			])
		).toEqual([]);
	});

	it('does not invent a created ID from project scope when a result has no ID', () => {
		const guard = new TurnCreateReplayGuard();
		guard.record([execution(call(), true, { message: 'Created' })]);
		expect(guard.find([call()])[0]?.attempts[0]?.entityId).toBeNull();
	});

	it('never turns a failed attempt into a saved replay, even if its payload contains an ID', () => {
		const guard = new TurnCreateReplayGuard();
		guard.record([execution(call(), false)]);
		expect(guard.find([call()])[0]).toMatchObject({
			exactSavedReplay: false,
			attempts: [{ status: 'unconfirmed', entityId: null }]
		});
	});

	it('does not arbitrarily choose among intentionally same-name creates from an earlier batch', () => {
		const guard = new TurnCreateReplayGuard();
		guard.record([execution(), execution(call(), true, { task: { id: 'second-task' } })]);
		const repeats = guard.find([call()]);
		expect(repeats[0]?.exactSavedReplay).toBe(false);
		expect(repeats[0]?.attempts.map((attempt) => attempt.entityId)).toEqual([
			'saved-task',
			'second-task'
		]);
	});

	it('starts empty for each invocation and does not merge different punctuation', () => {
		const previousTurn = new TurnCreateReplayGuard();
		previousTurn.record([execution()]);
		expect(new TurnCreateReplayGuard().find([call(), call()])).toEqual([]);
		expect(
			previousTurn.find([
				call('create_onto_task', { project_id: 'project-a', title: 'Permit?' })
			])
		).toEqual([]);
	});

	it('provides saved IDs and explicit withheld semantics without copying large bodies into the repair', () => {
		const guard = new TurnCreateReplayGuard();
		guard.record([
			execution(
				call('create_onto_task', {
					project_id: 'project-a',
					title: 'Permit',
					description: 'x'.repeat(8000)
				})
			)
		]);
		const instruction = createReplayRepairInstruction(guard.find([call()]));
		expect(instruction).toContain('saved-task');
		expect(instruction).toContain('None of its calls executed');
		expect(instruction).toContain('Changed descriptions or other fields were not saved');
		expect(instruction).not.toContain('x'.repeat(100));
	});
});
