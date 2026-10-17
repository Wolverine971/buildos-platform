// packages/agentic-chat-runtime/src/loop/proposal-card-loop.test.ts
//
// The loop's view of a proposal card (tasker 122): it is a pending card only
// while it waits for the user's click (keyed on the card rail, never on the
// tool name), it is a read (no write ledger, no `.set`/`.move` op), and the
// model gets the kind's model view plus the instruction, never the browser's
// client_action.
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import {
	buildProposalCardEnvelopeV1,
	buildProposalCardNonCardResultV1,
	type ProjectParentProposalPayloadV1
} from '@buildos/shared-agent-ops/chat-cards/proposal-card';
import { getToolRegistry } from '../catalog/registry';
import { TOOL_METADATA } from '../catalog/metadata';
import type { FastToolExecution } from './shared';
import {
	classifyToolExecution,
	doesToolExecutionRequireUserAction,
	isLikelyWriteToolName,
	isPendingProposalCardExecution,
	isPureReadToolName,
	isWriteLedgerToolExecution
} from './tool-classification';
import { buildToolPayloadForModel } from './tool-payload-compaction';
import { provideAgenticChatLoopToolCatalog } from './tool-catalog';

// The web host installs the real registry; classification reads it.
provideAgenticChatLoopToolCatalog(() => getToolRegistry());

const CARD = '00000000-0000-4000-8000-000000000003';
const SESSION = '00000000-0000-4000-8000-000000000004';

const payload: ProjectParentProposalPayloadV1 = {
	version: 1,
	action: 'attach',
	project: { id: '00000000-0000-4000-8000-000000000010', name: 'DJ Internal' },
	from_parent: null,
	to_parent: { id: '00000000-0000-4000-8000-000000000011', name: 'Wayne Strategies' },
	child_only_members: { names: [], count: 0 },
	effects: ['nothing_moves', 'no_access_change'],
	undo_needs_admin_on_both: false,
	duplicate_check: null,
	note: null
};

const card = () =>
	JSON.parse(
		JSON.stringify(
			buildProposalCardEnvelopeV1({
				kind: 'project_parent',
				cardId: CARD,
				sessionId: SESSION,
				proposedAt: '2026-10-17T15:00:00.000Z',
				payload,
				message: 'Needs your choice: put DJ Internal inside Wayne Strategies.'
			})
		)
	);

function execution(
	result: unknown,
	options: { success?: boolean; name?: string } = {}
): FastToolExecution {
	const toolCall: ChatToolCall = {
		id: 'call-1',
		type: 'function',
		function: {
			name: options.name ?? 'propose_project_parent',
			arguments: JSON.stringify({
				project_id: payload.project.id,
				parent_project_id: payload.to_parent!.id
			})
		}
	};
	const toolResult: ChatToolResult = {
		tool_call_id: 'call-1',
		success: options.success ?? true,
		result: result as ChatToolResult['result'],
		...(options.success === false ? { error: 'failed' } : {})
	};
	return { toolCall, result: toolResult } as FastToolExecution;
}

describe('proposal card classification', () => {
	it('treats a waiting card as pending user action, keyed on the rail', () => {
		expect(isPendingProposalCardExecution(execution(card()))).toBe(true);
		expect(doesToolExecutionRequireUserAction(execution(card()))).toBe(true);
		// The rail decides, not the tool name.
		expect(isPendingProposalCardExecution(execution(card(), { name: 'anything_else' }))).toBe(
			true
		);
	});

	it('does not count blocked, no-change, failed, resolved or shared-doc results', () => {
		const blocked = buildProposalCardNonCardResultV1({
			kind: 'project_parent',
			status: 'blocked',
			reasonCode: 'parent_is_a_child',
			message: 'Wayne is already inside another project.'
		});
		expect(isPendingProposalCardExecution(execution(blocked))).toBe(false);
		expect(isPendingProposalCardExecution(execution(card(), { success: false }))).toBe(false);
		expect(
			isPendingProposalCardExecution(
				execution({ ...card(), card_resolution: { outcome: 'applied' } })
			)
		).toBe(false);
		expect(
			isPendingProposalCardExecution(
				execution(
					{
						status: 'confirmation_required',
						confirmation_kind: 'shared_document_edit_v1',
						requires_user_action: true
					},
					{ name: 'update_onto_document' }
				)
			)
		).toBe(false);
	});

	it('keeps both proposal tools reads: no write op, no write ledger, pure reads for the gate', () => {
		for (const name of ['propose_project_parent', 'propose_project_combine']) {
			const op = getToolRegistry().byToolName[name];
			expect(op?.kind, name).toBe('read');
			expect(op?.op, name).toMatch(/\.propose$/);
			expect(TOOL_METADATA[name]?.category, name).toBe('read');
			expect(isLikelyWriteToolName(name), name).toBe(false);
			expect(isPureReadToolName(name), name).toBe(true);
		}
		expect(isWriteLedgerToolExecution(execution(card()))).toBe(false);
		expect(classifyToolExecution(execution(card()))).toBe('read_discovery');
	});
});

describe('proposal card compaction', () => {
	const parseArgs = () => ({ args: {} });

	it('gives the model the model view and instruction, never client_action', () => {
		const result: ChatToolResult = { tool_call_id: 'call-1', success: true, result: card() };
		const model = buildToolPayloadForModel(
			execution(card()).toolCall,
			result,
			parseArgs
		) as Record<string, unknown>;
		expect(model).toMatchObject({
			status: 'proposal_ready',
			saved: false,
			card_id: CARD,
			kind: 'project_parent',
			action: 'attach',
			project: payload.project,
			to_parent: payload.to_parent,
			effects: payload.effects,
			message: 'Needs your choice: put DJ Internal inside Wayne Strategies.'
		});
		expect(JSON.stringify(model)).not.toContain('client_action');
		expect(model).not.toHaveProperty('model_view');
		expect(model).not.toHaveProperty('card_rail');
	});

	it('passes a blocked result through so the model can explain it', () => {
		const blocked = buildProposalCardNonCardResultV1({
			kind: 'project_combine',
			status: 'blocked',
			reasonCode: 'calendar_sync_not_deployed',
			message: 'Can’t combine A into B from chat.'
		});
		const model = buildToolPayloadForModel(
			execution(blocked, { name: 'propose_project_combine' }).toolCall,
			{ tool_call_id: 'call-1', success: true, result: blocked },
			parseArgs
		) as Record<string, unknown>;
		expect(model).toMatchObject({
			status: 'blocked',
			reason_code: 'calendar_sync_not_deployed',
			message: 'Can’t combine A into B from chat.'
		});
	});
});
