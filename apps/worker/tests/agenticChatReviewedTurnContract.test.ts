// apps/worker/tests/agenticChatReviewedTurnContract.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import {
	parseDeclaredTurnContract,
	provideAgenticChatLoopToolCatalog,
	resolveTurnContractFromExecutions,
	resolveTurnContractOutcome,
	type FastToolExecution
} from '@buildos/agentic-chat-runtime/loop';
import { contractSha256 } from '../src/workers/agentic-chat/provider/validation';
import { resolveReviewedTurnContractFromExecutions } from '../src/workers/agentic-chat/reviewedTurnContract';
import { enforceAgenticChatTerminalTextIntegrityV1 } from '../src/workers/agentic-chat/terminalTextIntegrity';

const TARGET = 'aa000000-0000-4000-8000-000000000001';

beforeAll(() => {
	provideAgenticChatLoopToolCatalog(() => ({
		ops: {},
		byToolName: {
			update_onto_document: {
				op: 'onto.document.update',
				tool_name: 'update_onto_document',
				kind: 'write'
			}
		}
	}));
});

function execution(
	name: string,
	args: Record<string, unknown>,
	result: Record<string, unknown> = {},
	success = true
): FastToolExecution {
	return {
		toolCall: {
			id: name,
			type: 'function',
			function: { name, arguments: JSON.stringify(args) }
		},
		result: { tool_call_id: name, success, result }
	};
}

function updateContract(entityKind = 'document') {
	return {
		outcomes: [
			{
				action: 'update',
				entity_kind: entityKind,
				target_ids: [TARGET],
				required_fields: [entityKind === 'document' ? 'content' : 'description'],
				minimum_successful_effects: 1
			}
		]
	};
}

function declaration(contract: Record<string, unknown>) {
	return execution('declare_turn_contract', contract, { status: 'declared' });
}

function revision(contract: Record<string, unknown>) {
	return execution(
		'request_proposal_revision',
		{ corrected_contract: contract },
		{
			status: 'revision_required',
			corrected_contract: contract
		}
	);
}

function approval(contract: Record<string, unknown>) {
	const sha = contractSha256(parseDeclaredTurnContract(contract)!);
	return execution(
		'approve_turn_contract_review',
		{ contract_sha256: sha },
		{
			status: 'turn_contract_review_approved',
			contract_sha256: sha
		}
	);
}

function editedDocument() {
	return execution(
		'update_onto_document',
		{ document_id: TARGET, content: 'Revised draft.' },
		{
			document: { id: TARGET, title: 'Draft', content: 'Revised draft.' }
		}
	);
}

describe('reviewed turn contract replay', () => {
	it.each(['document', 'task', 'project'])(
		'replaces, rather than merges, an approved %s correction',
		(kind) => {
			const corrected = updateContract(kind);
			const original = {
				outcomes: [
					...corrected.outcomes,
					{ action: 'create', entity_kind: kind, minimum_successful_effects: 1 }
				]
			};
			const executions = [declaration(original), revision(corrected), approval(corrected)];
			expect(resolveReviewedTurnContractFromExecutions(executions)).toEqual(
				parseDeclaredTurnContract(corrected)
			);
			// The old declaration-only replay retained the unwanted create outcome.
			expect(resolveTurnContractFromExecutions(executions)?.outcomes).toHaveLength(2);
		}
	);

	it('does not append a false failure or leave carry-forward work after the approved edit', () => {
		const corrected = updateContract();
		const original = {
			outcomes: [
				...corrected.outcomes,
				{ action: 'create', entity_kind: 'document', minimum_successful_effects: 1 }
			]
		};
		const executions = [
			declaration(original),
			revision(corrected),
			approval(corrected),
			editedDocument()
		];
		expect(
			enforceAgenticChatTerminalTextIntegrityV1({
				assistantText: 'Updated the draft in place.',
				finishedReason: 'stop',
				contextType: 'project',
				toolExecutions: executions
			})
		).toMatchObject({
			assistantText: 'Updated the draft in place.',
			finishedReason: 'stop',
			correctionDelta: null
		});
		expect(
			resolveTurnContractOutcome({
				contract: resolveReviewedTurnContractFromExecutions(executions),
				toolExecutions: executions,
				finishedReason: 'stop'
			}).fulfilled
		).toBe(true);
	});

	it('still reports work added by an approved correction when the ledger cannot prove it', () => {
		const original = updateContract();
		const corrected = {
			outcomes: [
				...original.outcomes,
				{ action: 'create', entity_kind: 'task', minimum_successful_effects: 2 }
			]
		};
		const executions = [
			declaration(original),
			revision(corrected),
			approval(corrected),
			editedDocument()
		];
		const result = enforceAgenticChatTerminalTextIntegrityV1({
			assistantText: 'Updated the draft.',
			finishedReason: 'stop',
			contextType: 'project',
			toolExecutions: executions
		});
		expect(result.finishedReason).toBe('mutation_unfulfilled');
		expect(result.correctionDelta).toContain('0 of 2');
	});

	it.each([
		'missing',
		'failed',
		'wrong-result-sha',
		'wrong-argument-sha',
		'malformed-arguments',
		'wrong-status'
	])('does not accept a correction with %s approval', (condition) => {
		const original = updateContract();
		const corrected = updateContract('task');
		const receipt = approval(corrected);
		if (condition === 'failed') receipt.result.success = false;
		if (condition === 'wrong-result-sha')
			receipt.result.result.contract_sha256 = '0'.repeat(64);
		if (condition === 'wrong-argument-sha')
			receipt.toolCall.function.arguments = JSON.stringify({
				contract_sha256: '0'.repeat(64)
			});
		if (condition === 'malformed-arguments') receipt.toolCall.function.arguments = '{';
		if (condition === 'wrong-status') receipt.result.result.status = 'revision_required';
		const executions = [
			declaration(original),
			revision(corrected),
			...(condition === 'missing' ? [] : [receipt])
		];
		expect(resolveReviewedTurnContractFromExecutions(executions)).toEqual(
			parseDeclaredTurnContract(original)
		);
	});

	it.each(['failed', 'prose-only', 'malformed', 'wrong-status'])(
		'ignores a %s revision',
		(condition) => {
			const original = updateContract();
			const corrected = updateContract('task');
			const receipt = revision(corrected);
			if (condition === 'failed') receipt.result.success = false;
			if (condition === 'prose-only') delete receipt.result.result.corrected_contract;
			if (condition === 'malformed')
				receipt.result.result.corrected_contract = { outcomes: [] };
			if (condition === 'wrong-status') receipt.result.result.status = 'approved';
			expect(
				resolveReviewedTurnContractFromExecutions([
					declaration(original),
					receipt,
					approval(corrected)
				])
			).toEqual(parseDeclaredTurnContract(original));
		}
	);

	it('uses the latest independently approved correction across multiple review rounds', () => {
		const original = updateContract();
		const first = updateContract('task');
		const last = updateContract('project');
		expect(
			resolveReviewedTurnContractFromExecutions([
				declaration(original),
				revision(first),
				approval(first),
				revision(last),
				approval(last)
			])
		).toEqual(parseDeclaredTurnContract(last));
	});

	it.each(['cancel_turn_contract', 'request_turn_clarification'])(
		'respects %s before or after approval',
		(name) => {
			const original = updateContract();
			const corrected = updateContract('task');
			const cancel = execution(name, { reason: 'Needs user input', question: 'Which task?' });
			expect(
				resolveReviewedTurnContractFromExecutions([
					declaration(original),
					revision(corrected),
					cancel,
					approval(corrected)
				])
			).toBeNull();
			expect(
				resolveReviewedTurnContractFromExecutions([
					declaration(original),
					revision(corrected),
					approval(corrected),
					cancel
				])
			).toBeNull();
		}
	);

	it('does not apply an old revision after a new declaration', () => {
		const original = updateContract();
		const corrected = updateContract('task');
		const next = updateContract('project');
		const executions = [
			declaration(original),
			revision(corrected),
			declaration(next),
			approval(corrected)
		];
		expect(resolveReviewedTurnContractFromExecutions(executions)).toEqual(
			resolveTurnContractFromExecutions(executions)
		);
	});

	it('preserves declaration-only and legacy implicit-write behavior', () => {
		for (const executions of [[], [declaration(updateContract())], [editedDocument()]]) {
			expect(resolveReviewedTurnContractFromExecutions(executions)).toEqual(
				resolveTurnContractFromExecutions(executions)
			);
		}
	});
});
