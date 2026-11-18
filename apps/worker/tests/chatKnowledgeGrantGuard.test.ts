// apps/worker/tests/chatKnowledgeGrantGuard.test.ts
//
// Copy-out guard (tasker 168): the chat wrap-up must not file into the user's own graph a value
// the chat only saw through another project member's grant. The lens read leaves content-free
// keys in storage (granted_value_keys); the capture drops a candidate fact whose normalized
// value has the same key. Structured value comparison only, never a reading of the words.
/* eslint-disable require-await -- fakes satisfy async ports without I/O */
import { describe, expect, it, vi } from 'vitest';
import {
	knowledgeGrantValueKey,
	lensGrantedValueKeys
} from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import { projectAgenticChatToolResultForStorageV1 } from '@buildos/agentic-chat-runtime/tools';
import { runChatKnowledgeCapture } from '../src/workers/chat/checkpoint/knowledgeCapture';
import type { ResolveKnowledgeIdentity } from '../src/workers/chat/checkpoint/knowledgeIdentity';

const USER = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';

/** Every table read is empty (no earlier capture to rebuild). */
function emptyDb() {
	const chain: any = new Proxy(
		{},
		{
			get(_target, prop) {
				if (prop === 'then') {
					return (resolve: (value: unknown) => void) =>
						resolve({ data: [], error: null });
				}
				if (prop === 'maybeSingle' || prop === 'single') {
					return async () => ({ data: null, error: null });
				}
				return () => chain;
			}
		}
	);
	return { from: vi.fn(() => chain), rpc: vi.fn() };
}

const MESSAGE = {
	id: 'msg-1',
	role: 'user',
	// The user pastes back what the assistant relayed from DJ's People.
	content: 'Great, Kyle Reed email is Kyle@Acme.vc so remember that',
	created_at: '2026-11-18T10:00:00Z'
};

const EXTRACTION = {
	entities: [{ ref: 'kyle', kind: 'person', name: 'Kyle Reed' }],
	facts: [
		{
			subject: 'kyle',
			predicate: 'email',
			value: 'kyle@acme.vc',
			from: 'user',
			message: 'm1',
			quote: 'Kyle Reed email is Kyle@Acme.vc'
		}
	]
};

function run(grantedValueKeys?: ReadonlySet<string>) {
	// Skipping the entity ends the run before any write, so the fake needs no store.
	const resolveIdentity = vi.fn<ResolveKnowledgeIdentity>(
		async ({ candidates }) =>
			candidates.map((candidate) => ({
				ref: candidate.ref,
				action: 'skip' as const,
				reason: 'test stops here'
			})) as never
	);
	const completeJson = vi.fn(async () => EXTRACTION);
	const receipt = runChatKnowledgeCapture(
		{ db: emptyDb() as never, decider: null, completeJson, resolveIdentity },
		{
			session: { id: SESSION, userId: USER, title: 'Launch' },
			newMessages: [MESSAGE],
			priorMessages: [],
			webPages: [],
			throughMessageId: MESSAGE.id,
			...(grantedValueKeys ? { grantedValueKeys } : {})
		}
	);
	return { receipt, resolveIdentity, completeJson };
}

describe('chat capture never copies a granted value', () => {
	it('drops a fact whose value another member granted, before identity or any write', async () => {
		const stored = projectAgenticChatToolResultForStorageV1('get_project_knowledge_lens', {
			project: { id: 'p1', name: 'Launch' },
			entries: [
				{
					entity: { id: 'e1', kind: 'person', name: 'Kyle Reed' },
					facts: [
						{
							predicate: 'email',
							value: 'KYLE@acme.vc',
							shared_by: 'DJ',
							scope: 'grant'
						}
					]
				}
			]
		}) as { granted_value_keys: string[] };
		const { receipt, resolveIdentity } = run(new Set(stored.granted_value_keys));
		const result = await receipt;
		expect(result?.dropped).toEqual(
			expect.arrayContaining([{ predicate: 'email', reason: 'shared_by_another_member' }])
		);
		expect(result?.fact_ids).toEqual([]);
		expect(resolveIdentity).not.toHaveBeenCalled();
	});

	it('keeps the same fact when the value was only shared at project level or not at all', async () => {
		const shared = lensGrantedValueKeys({
			entries: [
				{
					facts: [{ predicate: 'email', value: 'kyle@acme.vc', scope: 'project:Launch' }]
				}
			]
		});
		expect(shared).toEqual([]);
		const { receipt, resolveIdentity } = run(new Set(shared));
		await receipt;
		expect(resolveIdentity).toHaveBeenCalledTimes(1);

		const other = run(new Set([knowledgeGrantValueKey('email', 'someone@else.com')!]));
		await other.receipt;
		expect(other.resolveIdentity).toHaveBeenCalledTimes(1);
	});
});
