// apps/worker/tests/startHereCaptureProcessor.test.ts
//
// Session-end START HERE capture (tasker/93): the model sees the current
// sections and today's date, returns whole sections, and code reconciles
// before staging one reviewable proposal per project. No model calls: the
// SmartLLMService reply is canned.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processStartHereCaptureProposals } from '../src/workers/chat/startHereCaptureProcessor';
import {
	preserveCurrentStartHereManagedRegions,
	readStartHereAuthoredSections,
	stripStartHereManagedRegions
} from '../../../packages/shared-agent-ops/src/ontology/start-here';

const mocks = vi.hoisted(() => ({
	from: vi.fn(),
	getJSONResponse: vi.fn(),
	ensureActorId: vi.fn(),
	ensureProjectStartHereDocument: vi.fn(),
	stageGatewayWriteOp: vi.fn(),
	syncInboxItemForAgentRun: vi.fn(),
	resolveUserCivilTimezone: vi.fn(),
	logWorkerError: vi.fn()
}));

vi.mock('../src/lib/supabase', () => ({ supabase: { from: mocks.from } }));
vi.mock('../src/lib/errorLogger', () => ({ logWorkerError: mocks.logWorkerError }));
vi.mock('../src/lib/services/smart-llm-service', () => ({
	SmartLLMService: class {
		getJSONResponse = mocks.getJSONResponse;
	}
}));
vi.mock('@buildos/shared-agent-ops/ontology/ontology-projects.service', () => ({
	ensureActorId: mocks.ensureActorId
}));
vi.mock('@buildos/shared-agent-ops/ontology/start-here.service', () => ({
	ensureProjectStartHereDocument: mocks.ensureProjectStartHereDocument
}));
vi.mock('@buildos/shared-agent-ops/gateway/op-execution-gateway', () => ({
	stageGatewayWriteOp: mocks.stageGatewayWriteOp
}));
vi.mock('@buildos/shared-agent-ops', () => ({
	syncInboxItemForAgentRun: mocks.syncInboxItemForAgentRun
}));
vi.mock('@buildos/shared-agent-ops/dates/civil-date', () => ({
	resolveUserCivilTimezone: mocks.resolveUserCivilTimezone
}));

const DOC_ID = '1fc5b3c2-4d63-4b4f-bcbb-58dec9262795';
const PROJECT_ID = '445dd429-db93-4878-90a9-b3ab1627a9f2';
const NOW = new Date('2026-09-22T16:00:00.000Z');
const bookFixture = readFileSync(
	new URL(
		'../../../packages/shared-agent-ops/src/ontology/__fixtures__/start-here-100-day-book.md',
		import.meta.url
	),
	'utf8'
);

type Row = Record<string, any>;
type Chain = Array<[string, unknown[]]>;

const db = {
	docContent: bookFixture,
	pendingRuns: [] as Row[],
	insertedRuns: [] as Row[],
	updates: [] as Array<{ patch: Row; chain: Chain }>
};

function respond(table: string, chain: Chain): { data?: unknown; error: null } {
	const op = (name: string) => chain.find(([method]) => method === name);
	if (table === 'onto_projects') {
		return {
			data: {
				id: PROJECT_ID,
				name: '100-Day Book Project',
				description: null,
				created_at: '2026-08-20T22:10:07.662Z'
			},
			error: null
		};
	}
	if (table === 'chat_messages') {
		// The processor asks newest-first and reverses.
		return {
			data: [
				{
					role: 'assistant',
					content: 'Locked: the book excludes crypto and politics.',
					created_at: '2026-09-22T14:05:00.000Z'
				},
				{
					role: 'user',
					content: 'Exclusions: no crypto, no politics.',
					created_at: '2026-09-22T14:00:00.000Z'
				}
			],
			error: null
		};
	}
	if (table === 'agent_runs') {
		const insert = op('insert');
		if (insert) {
			db.insertedRuns.push(insert[1][0] as Row);
			return { error: null };
		}
		const update = op('update');
		if (update) {
			const patch = update[1][0] as Row;
			db.updates.push({ patch, chain });
			const id = chain.find(([method, args]) => method === 'eq' && args[0] === 'id')?.[1][1];
			const run = db.pendingRuns.find((candidate) => candidate.id === id);
			return { data: run ? { ...run, ...patch } : null, error: null };
		}
		return { data: db.pendingRuns, error: null };
	}
	throw new Error(`unexpected table ${table}`);
}

function installSupabase(): void {
	mocks.from.mockImplementation((table: string) => {
		const chain: Chain = [];
		const builder: Row = {};
		for (const method of ['select', 'eq', 'order', 'limit', 'update', 'insert']) {
			builder[method] = (...args: unknown[]) => {
				chain.push([method, args]);
				return builder;
			};
		}
		builder.maybeSingle = () => Promise.resolve(respond(table, chain));
		builder.then = (
			onFulfilled: (value: unknown) => unknown,
			onRejected?: (reason: unknown) => unknown
		) => Promise.resolve(respond(table, chain)).then(onFulfilled, onRejected);
		return builder;
	});
}

function capture() {
	return processStartHereCaptureProposals({
		sessionId: 'session-1',
		userId: 'user-1',
		projectId: PROJECT_ID,
		sessionSummary: 'Locked the Exclusions field.',
		now: NOW
	});
}

function stagedContent(): string {
	const call = mocks.stageGatewayWriteOp.mock.calls.at(-1)?.[0];
	return call?.args?.content as string;
}

function pendingRun(params: { id: string; before: string; after: string }): Row {
	return {
		id: params.id,
		created_at: '2026-09-21T12:00:00.000Z',
		change_set: {
			status: 'pending',
			changes: [
				{
					id: `${params.id}-change`,
					op: 'onto.document.update',
					entity_id: DOC_ID,
					before: { id: DOC_ID, content: params.before },
					after: { document_id: DOC_ID, content: params.after }
				}
			]
		}
	};
}

const currentSections = readStartHereAuthoredSections(bookFixture);

beforeEach(() => {
	vi.clearAllMocks();
	db.docContent = bookFixture;
	db.pendingRuns = [];
	db.insertedRuns = [];
	db.updates = [];
	installSupabase();
	mocks.resolveUserCivilTimezone.mockResolvedValue('America/New_York');
	mocks.ensureActorId.mockResolvedValue('actor-1');
	mocks.ensureProjectStartHereDocument.mockImplementation(async () => ({
		ok: true,
		created: false,
		document: {
			id: DOC_ID,
			project_id: PROJECT_ID,
			type_key: 'document.context.project',
			content: db.docContent
		}
	}));
	mocks.stageGatewayWriteOp.mockImplementation(async (params: Row) => ({
		ok: true,
		change: {
			op: 'onto.document.update',
			action: 'update',
			entity_type: 'document',
			entity_id: DOC_ID,
			before: { id: DOC_ID, content: db.docContent },
			after: params.args,
			rationale: params.rationale
		}
	}));
	mocks.syncInboxItemForAgentRun.mockResolvedValue(null);
	mocks.getJSONResponse.mockResolvedValue({ sections: [] });
});

describe('processStartHereCaptureProposals', () => {
	it("shows the model the current sections and today's date, after ensuring the doc", async () => {
		const result = await capture();
		expect(result.proposed).toBe(false);

		const request = mocks.getJSONResponse.mock.calls[0]?.[0];
		expect(request.systemPrompt).not.toContain('YYYY-MM-DD');
		expect(request.userPrompt).toContain("Today's date: 2026-09-22");
		expect(request.userPrompt).toContain('Project created: 2026-08-20');
		expect(request.userPrompt).toContain('<section name="Decisions">');
		expect(request.userPrompt).toContain('**Book Contract locked in**');
		expect(request.userPrompt).toContain('<section name="Non-goals">\n(empty)\n</section>');
		expect(request.userPrompt).toContain('Welcome to your 100-day book workspace');
		expect(request.userPrompt).toContain('[2026-09-22] user: Exclusions: no crypto');
		expect(request.userPrompt).not.toContain('<!-- managed:');
		expect(request.userPrompt).not.toContain('Last refreshed');
		expect(mocks.ensureProjectStartHereDocument.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.getJSONResponse.mock.invocationCallOrder[0]!
		);
	});

	it('corrects invented dates and stages only the authored body', async () => {
		mocks.getJSONResponse.mockResolvedValue({
			sections: [
				{
					section: 'Decisions',
					markdown: `${currentSections.Decisions}\n- **Exclusions set** - no crypto, no politics. _(YYYY-MM-DD)_\n- **Guessed** - model date. _(2025-04-14)_`,
					rationale: 'Exclusions locked.'
				}
			]
		});

		const result = await capture();
		expect(result).toMatchObject({ proposed: true, updateCount: 1 });

		const content = stagedContent();
		expect(content).not.toMatch(/YYYY-MM-DD|2025-\d{2}-\d{2}/);
		expect(content).toContain('- **Exclusions set** - no crypto, no politics. _(2026-09-22)_');
		expect(content).not.toContain('<!-- managed:');
		expect(content).toContain('Welcome to your 100-day book workspace');
		expect(mocks.stageGatewayWriteOp.mock.calls[0]?.[0].args.update_strategy).toBe('replace');
		expect(db.insertedRuns).toHaveLength(1);
		expect(db.insertedRuns[0]).toMatchObject({
			label: 'Update project START HERE',
			status: 'proposal_ready',
			review_required: true
		});
	});

	it('proposes nothing when the reply matches the document, including a second capture', async () => {
		mocks.getJSONResponse.mockResolvedValue({
			sections: [
				{ section: 'What this is', markdown: currentSections['What this is'] },
				{ section: 'Open questions', markdown: currentSections['Open questions'] }
			]
		});
		expect((await capture()).proposed).toBe(false);
		expect(mocks.stageGatewayWriteOp).not.toHaveBeenCalled();

		const reply = {
			sections: [
				{
					section: 'Current state',
					markdown: 'Day 1 of 100 complete. Exclusions are set; next is Phase 2.'
				}
			]
		};
		mocks.getJSONResponse.mockResolvedValue(reply);
		expect((await capture()).proposed).toBe(true);

		// The user applies it (the commit path re-inserts the managed regions);
		// the same chat is captured again.
		db.docContent = preserveCurrentStartHereManagedRegions(bookFixture, stagedContent());
		mocks.stageGatewayWriteOp.mockClear();
		expect((await capture()).proposed).toBe(false);
		expect(mocks.stageGatewayWriteOp).not.toHaveBeenCalled();
	});

	it('builds on an older pending proposal and supersedes it', async () => {
		const currentAuthored = stripStartHereManagedRegions(bookFixture);
		const pendingAuthored = currentAuthored.replace(
			'## Current state',
			'- **Pending decision** - from an earlier chat.\n\n## Current state'
		);
		db.pendingRuns = [
			pendingRun({ id: 'run-pending', before: bookFixture, after: pendingAuthored })
		];
		mocks.getJSONResponse.mockResolvedValue({
			sections: [
				{
					section: 'Current state',
					markdown: 'Day 1 of 100 complete. Exclusions are set; next is Phase 2.'
				}
			]
		});

		const result = await capture();
		expect(result).toMatchObject({ proposed: true, supersededCount: 1 });
		expect(mocks.getJSONResponse.mock.calls[0]?.[0].userPrompt).toContain('Pending decision');
		expect(stagedContent()).toContain('**Pending decision**');
		expect(stagedContent()).toContain('Exclusions are set; next is Phase 2.');
		expect(mocks.stageGatewayWriteOp.mock.calls[0]?.[0].rationale).toContain(
			'earlier unreviewed Start Here proposal'
		);

		const [supersede] = db.updates;
		expect(supersede?.patch).toMatchObject({ status: 'cancelled' });
		expect(supersede?.patch.error).toMatch(/^superseded: /);
		expect(supersede?.patch.error).toContain(db.insertedRuns[0]?.id);
		expect(supersede?.chain).toContainEqual(['eq', ['status', 'proposal_ready']]);
		expect(mocks.syncInboxItemForAgentRun).toHaveBeenLastCalledWith(
			expect.objectContaining({
				run: expect.objectContaining({ id: 'run-pending', status: 'cancelled' })
			})
		);
	});

	it('does not build on a stale pending proposal but still supersedes it', async () => {
		db.pendingRuns = [
			pendingRun({
				id: 'run-stale',
				before: '# Older body\n\n## Decisions\n- **Old** - gone.',
				after: '# Older body\n\n## Decisions\n- **Stale pending decision** - x.'
			})
		];
		mocks.getJSONResponse.mockResolvedValue({
			sections: [{ section: 'Current state', markdown: 'Day 1 of 100 complete.' }]
		});

		const result = await capture();
		expect(result).toMatchObject({ proposed: true, supersededCount: 1 });
		expect(mocks.getJSONResponse.mock.calls[0]?.[0].userPrompt).not.toContain(
			'Stale pending decision'
		);
		expect(stagedContent()).not.toContain('Stale pending decision');
	});

	it('ignores a reply in the retired snippet contract', async () => {
		mocks.getJSONResponse.mockResolvedValue({
			updates: [{ section: 'Decisions', markdown: '- **Only the new bullet** - x.' }]
		});
		expect((await capture()).proposed).toBe(false);
		expect(mocks.stageGatewayWriteOp).not.toHaveBeenCalled();
	});
});
