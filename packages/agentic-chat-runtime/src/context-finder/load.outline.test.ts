// packages/agentic-chat-runtime/src/context-finder/load.outline.test.ts
//
// Outline-first loading (tasker 150): the finder reads headings from the stored outline and
// reads document text only for stale outlines and for the documents a plan picks.
import { describe, expect, it, vi } from 'vitest';
import {
	extractOutline,
	hashDocumentContent
} from '@buildos/shared-agent-ops/utils/document-outline';
import {
	buildContextFinderEntities,
	contextItemChars,
	contextItemExcerpts,
	findProjectContext,
	loadContextFinderPlanText,
	loadContextFinderProject,
	materializeContextPlan,
	plainOutlineHeading,
	renderContextEvidenceBlock,
	selectProjectContext,
	CONTEXT_FINDER_POLICY,
	type ContextFinderDecider,
	type ContextFinderReadClient
} from './index';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PROJECT = id(99);
const FRESH = id(1);
const STALE = id(2);
const OTHER = id(3);

const FRESH_TEXT = [
	'# Launch plan',
	'Intro.',
	'## **Budget** & money',
	'Budget is $300K.',
	'### Land',
	'Land costs $150K/acre.',
	'## Team',
	'Board: grandmother, pastor.'
].join('\n');
const STALE_TEXT = '## Old notes\nStill here.\n## Contacts\nPastor Jim.';
const OTHER_TEXT = `## Archive\n${'y'.repeat(5_000)}`;

type Call = { table: string; columns: string; filters: [string, string, unknown][] };

function docRow(docId: string, title: string, text: string, outline: unknown) {
	return {
		id: docId,
		title,
		description: `${title} description`,
		type_key: 'document.knowledge',
		state_key: 'draft',
		updated_at: '2026-11-01T00:00:00Z',
		created_at: '2026-10-01T00:00:00Z',
		outline,
		content_hash: hashDocumentContent(text),
		content: text
	};
}

/** A Supabase-shaped fake that returns only the selected columns and records every read. */
function fakeClient(
	options: { failTextRead?: boolean; textOverride?: Record<string, string> } = {}
) {
	const docs = [
		docRow(FRESH, 'Launch plan', FRESH_TEXT, extractOutline(FRESH_TEXT)),
		docRow(STALE, 'Old notes', STALE_TEXT, extractOutline('## Different\nold text')),
		docRow(OTHER, 'Archive', OTHER_TEXT, extractOutline(OTHER_TEXT))
	];
	const calls: Call[] = [];
	const client: ContextFinderReadClient = {
		from(table: string) {
			const call: Call = { table, columns: '', filters: [] };
			calls.push(call);
			const resolve = () => {
				if (table === 'onto_projects')
					return {
						data: { id: PROJECT, name: 'School', description: null },
						error: null
					};
				if (table !== 'onto_documents') return { data: [], error: null };
				const ids = call.filters.find(([op, column]) => op === 'in' && column === 'id');
				if (ids && options.failTextRead) return { data: null, error: { message: 'boom' } };
				const rows = docs
					.filter((doc) => !ids || (ids[2] as string[]).includes(doc.id))
					.map((doc) => {
						// An override is an edit that lands after the listing, before the text read.
						const content = (ids && options.textOverride?.[doc.id]) || doc.content;
						const full = {
							...doc,
							content,
							content_hash: hashDocumentContent(content),
							table: null
						} as Record<string, unknown>;
						const columns = call.columns.split(',').map((c) => c.split(':')[0]!);
						return Object.fromEntries(columns.map((c) => [c, full[c]]));
					});
				return { data: rows, error: null };
			};
			const builder: Record<string, unknown> = {
				select(columns: string) {
					call.columns = columns;
					return builder;
				},
				eq(column: string, value: unknown) {
					call.filters.push(['eq', column, value]);
					return builder;
				},
				in(column: string, value: unknown) {
					call.filters.push(['in', column, value]);
					return builder;
				},
				is: () => builder,
				order: () => builder,
				limit: () => builder,
				abortSignal: () => builder,
				maybeSingle: () => Promise.resolve(resolve()),
				then: (ok: (value: unknown) => unknown, bad?: (e: unknown) => unknown) =>
					Promise.resolve(resolve()).then(ok, bad)
			};
			return builder as never;
		}
	};
	const textReads = () =>
		calls
			.filter((call) => call.table === 'onto_documents' && call.columns.includes('content,'))
			.map((call) => call.filters.find(([op]) => op === 'in')?.[2]);
	return { client, calls, textReads };
}

function decider(scores: (key: string) => number) {
	const decide = vi.fn(async (request: { questions: Record<string, unknown> }) => {
		const keys = Object.keys(request.questions);
		return {
			ok: true as const,
			answers: Object.fromEntries(keys.map((k) => [k, { type: 'noul', noul: scores(k) }])),
			receipt: {
				modelRequested: 'jev',
				modelUsed: 'jev',
				requestId: 'r',
				inputTokens: 1,
				outputTokens: 1,
				costUsd: 0,
				durationMs: 1,
				requestBytes: 1,
				questionCount: keys.length,
				attempts: 1
			}
		};
	});
	return { decide, decider: { decide } as unknown as ContextFinderDecider };
}

const signal = () => new AbortController().signal;

/** The text-mode path hosts like /lab/sort use: plan, read picked text, materialize. */
async function textModePlan(
	project: Awaited<ReturnType<typeof loadContextFinderProject>>,
	scores: Record<string, number>
) {
	const entities = buildContextFinderEntities(project);
	const plan = selectProjectContext({ entities, scores, sectionsPerDoc: 2 });
	const loaded = await loadContextFinderPlanText({ project, entities, plan });
	return { evidence: materializeContextPlan({ plan, entities: loaded }), loaded };
}

describe('outline-first loading', () => {
	it('never selects document text in bulk; reads it only for a stale outline', async () => {
		const { client, calls, textReads } = fakeClient();
		const project = await loadContextFinderProject(client, PROJECT, signal());
		const listing = calls.find(
			(call) => call.table === 'onto_documents' && call.columns.includes('outline')
		)!;
		expect(listing.columns.split(',')).not.toContain('content');
		expect(textReads()).toEqual([[STALE]]);
		const byId = new Map(project.documents.map((doc) => [doc.id, doc]));
		expect(byId.get(FRESH)!.content).toBeUndefined();
		expect(byId.get(STALE)!.content).toBe(STALE_TEXT);
		expect(project.documentText).toBeTypeOf('function');
	});

	it('builds packets from the stored outline: plain headings, anchors, offsets, no text', async () => {
		const { client } = fakeClient();
		const project = await loadContextFinderProject(client, PROJECT, signal());
		const [fresh, stale] = buildContextFinderEntities(project);
		expect(fresh!.textLoaded).toBe(false);
		expect(fresh!.fullText).toBe('');
		expect(fresh!.textChars).toBe(FRESH_TEXT.length);
		expect(fresh!.packet.headings).toEqual(['Budget & money', 'Land', 'Team']);
		expect(fresh!.sections.map((s) => [s.heading, s.anchor, s.body])).toEqual([
			['Launch plan', 'launch-plan', ''],
			['Budget & money', 'budget--money', ''],
			['Land', 'land', ''],
			['Team', 'team', '']
		]);
		// The stale document's headings come from its current text, not the old outline.
		expect(stale!.textLoaded).toBe(true);
		expect(stale!.packet.headings).toEqual(['Old notes', 'Contacts']);
	});

	it('reads text only for the documents a text-mode plan loads in full', async () => {
		const { client, textReads } = fakeClient();
		const project = await loadContextFinderProject(client, PROJECT, signal());
		const { evidence, loaded } = await textModePlan(project, { e_d0: 0.9, h_d0_0: 0.8 });
		expect(textReads()).toEqual([[STALE], [FRESH]]);
		expect(evidence.full).toHaveLength(1);
		expect(evidence.full[0]).toMatchObject({
			id: FRESH,
			partial: true,
			excerpts: [
				{
					heading: 'Budget & money',
					text: '## **Budget** & money\nBudget is $300K.\n### Land\nLand costs $150K/acre.'
				}
			]
		});
		expect(loaded.find((entity) => entity.id === OTHER)!.textLoaded).toBe(false);
	});

	it('re-measures sections when the text changed after the outline load', async () => {
		const edited = FRESH_TEXT.replace('Intro.', 'A much longer introduction paragraph.');
		const { client } = fakeClient({ textOverride: { [FRESH]: edited } });
		const project = await loadContextFinderProject(client, PROJECT, signal());
		expect(project.documents[0]!.content).toBeUndefined();
		const { evidence } = await textModePlan(project, { e_d0: 0.9, h_d0_2: 0.8 });
		expect(evidence.full[0]!.excerpts).toEqual([
			{ heading: 'Team', text: '## Team\nBoard: grandmother, pastor.' }
		]);
	});

	it('falls back to the document card when the text read fails', async () => {
		const { client } = fakeClient();
		const project = await loadContextFinderProject(client, PROJECT, signal());
		project.documentText = async () => {
			throw new Error('network');
		};
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { evidence } = await textModePlan(project, { e_d0: 0.9 });
		warn.mockRestore();
		const [item] = evidence.full;
		expect(item!.partial).toBe(true);
		expect(item!.excerpts[0]!.text).toContain('Launch plan description');
		expect(item!.excerpts[0]!.text).toContain('- Budget & money (anchor: budget--money)');
	});

	it('budgets a plan from outline offsets at or above the real excerpt size', async () => {
		const { client } = fakeClient();
		const project = await loadContextFinderProject(client, PROJECT, signal());
		const outlined = buildContextFinderEntities(project);
		const loaded = buildContextFinderEntities({
			...project,
			documents: project.documents.map((doc) => ({
				...doc,
				content: doc.id === FRESH ? FRESH_TEXT : doc.id === OTHER ? OTHER_TEXT : doc.content
			}))
		});
		for (const sections of [
			[{ heading: 'Budget & money', p: 0.9 }],
			[{ heading: 'Team', p: 0.9 }],
			[]
		])
			for (const i of [0, 2]) {
				const estimate = contextItemChars(outlined[i]!, sections);
				const real = contextItemExcerpts(loaded[i]!, sections).chars;
				expect(estimate).toBeGreaterThanOrEqual(real);
				expect(estimate - real).toBeLessThan(5);
			}
		const plan = selectProjectContext({ entities: outlined, scores: { e_d2: 0.9 } });
		expect(materializeContextPlan({ plan, entities: loaded }).full[0]!.excerpts[0]!.text).toBe(
			OTHER_TEXT.slice(0, 1_500)
		);
	});
});

describe('what an agent gets up front (cards, tasker 152)', () => {
	it("gives each picked document a card with Jev's flagged sections and no text", async () => {
		const { client, textReads } = fakeClient();
		const project = await loadContextFinderProject(client, PROJECT, signal());
		const { decider: d } = decider((k) =>
			k === 'e_d0' ? 0.9 : k === 'h_d0_0' ? 0.8 : k === 'h_d0_2' ? 0.7 : 0
		);
		const result = await findProjectContext({ project, message: 'Plan?', decider: d });
		// Only the stale outline's text is read; the picked document stays a card.
		expect(textReads()).toEqual([[STALE]]);
		const [item] = result.evidence.full;
		expect(result.evidence.coverage.budgetChars).toBe(CONTEXT_FINDER_POLICY.agentBudgetChars);
		expect(item!.excerpts).toEqual([]);
		expect(item!.partial).toBe(true);
		expect(item!.card).toEqual({
			description: 'Launch plan description',
			sections: [
				{ heading: 'Budget & money', anchor: 'budget--money' },
				{ heading: 'Land', anchor: 'land' },
				{ heading: 'Team', anchor: 'team' }
			],
			more: 0,
			flagged: [
				{ heading: 'Budget & money', anchor: 'budget--money' },
				{ heading: 'Team', anchor: 'team' }
			]
		});
		const block = renderContextEvidenceBlock(result.evidence);
		expect(block).toContain(
			'Flagged for this question: Budget & money (budget--money) · Team (team)'
		);
		expect(block).toContain(
			'Sections (anchor): Budget & money (budget--money) · Land (land) · Team (team)'
		);
		expect(block).toContain('read_document_section');
		expect(block).not.toContain('Budget is $300K');
		expect(result.evidence.coverage.fullChars).toBeLessThan(400);
	});

	it('uses the AI summary when there is no description, only while it matches the text', async () => {
		const { client } = fakeClient();
		const project = await loadContextFinderProject(client, PROJECT, signal());
		const doc = project.documents.find((row) => row.id === FRESH)!;
		doc.description = null;
		doc.digest = { summary: 'Launch budget and board.', content_hash: doc.content_hash };
		const fresh = buildContextFinderEntities(project).find((e) => e.id === FRESH)!;
		expect(fresh.summary).toBe('Launch budget and board.');
		doc.digest = { summary: 'Old summary.', content_hash: 'stale' };
		expect(buildContextFinderEntities(project).find((e) => e.id === FRESH)!.summary).toBeNull();
	});

	it('shows a short heading-less note whole', async () => {
		const { client } = fakeClient();
		const project = await loadContextFinderProject(client, PROJECT, signal());
		const note = 'Call Sam about the venue deposit.';
		project.documents.push({
			id: id(4),
			title: 'Venue',
			description: null,
			type_key: 'document.note',
			updated_at: '2026-11-01T00:00:00Z',
			outline: extractOutline(note),
			content_hash: hashDocumentContent(note)
		});
		project.documentText = async () =>
			new Map([[id(4), { content: note, contentHash: hashDocumentContent(note) }]]);
		const { decider: d } = decider((k) => (k === 'e_d3' ? 0.9 : 0));
		const result = await findProjectContext({ project, message: 'Venue?', decider: d });
		expect(result.evidence.full[0]!.card!.text).toBe(note);
		expect(renderContextEvidenceBlock(result.evidence)).toContain(note);
	});

	it('leaves the full budget to hosts that select directly (drift review)', async () => {
		const { client } = fakeClient();
		const project = await loadContextFinderProject(client, PROJECT, signal());
		const entities = buildContextFinderEntities(project);
		const plan = selectProjectContext({
			entities,
			scores: { e_d0: 0.9, h_d0_0: 0.8, h_d0_1: 0.8, h_d0_2: 0.8 }
		});
		expect(plan.items[0]!.sections).toHaveLength(3);
	});
});

describe('plainOutlineHeading', () => {
	it('strips the rendered HTML the outline stores and decodes entities', () => {
		expect(plainOutlineHeading('<strong>Bold</strong> &amp; <code>x</code>')).toBe('Bold & x');
		expect(plainOutlineHeading('Sub <a href="x">link</a> &#39;q&#39; &#x2014;')).toBe(
			"Sub link 'q' —"
		);
		expect(plainOutlineHeading('&unknown; stays')).toBe('&unknown; stays');
	});
});
