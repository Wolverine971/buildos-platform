// apps/worker/tests/projectLoopDriftEvidence.test.ts
import { describe, expect, it, vi } from 'vitest';
import type {
	ContextFinderDecider,
	ContextFinderProjectV1
} from '@buildos/agentic-chat-runtime/context-finder';
import {
	buildDriftFinderRequest,
	diffDocumentSections,
	flatDocumentSections,
	loadProjectDriftEvidence,
	renderDriftEvidence,
	type DriftEvidenceClient
} from '../src/workers/project-loop/driftEvidence';

const START_HERE = '00000000-0000-4000-8000-000000000001';
const OUTLINE = '00000000-0000-4000-8000-000000000002';
const PILLAR = '00000000-0000-4000-8000-000000000003';
const NOW = new Date('2026-09-25T02:00:00Z');

const startHereBefore = [
	'# Book',
	'<!-- managed:status v=1 -->',
	'**Next step:** old',
	'<!-- /managed:status -->',
	'## Decisions',
	'- **Book Contract locked**',
	'## Open questions',
	"- **AI's role** — one pillar, or the why-now?"
].join('\n');
const startHereNow = [
	'# Book',
	'<!-- managed:status v=1 -->',
	'**Next step:** refreshed every few minutes',
	'<!-- /managed:status -->',
	'## Decisions',
	'- **Book Contract locked**',
	'- **AI is the why-now** — decided 2026-09-23',
	'## Open questions',
	"- **AI's role** — one pillar, or the why-now?"
].join('\n');
const pillar = [
	'# AI Pillar — Working Doc',
	'## The Monday move',
	'Brain-dump your life into the chat.',
	'## Open questions before folding into the outline',
	'- **Name of the move** — not settled.',
	"- **AI's role in the book overall** — one pillar, or the why-now?"
].join('\n');

function project(): ContextFinderProjectV1 {
	return {
		project: { id: 'project-1', name: 'Book', description: 'A nonfiction book.' },
		documents: [
			{
				id: START_HERE,
				title: 'START HERE',
				type_key: 'document.context.project',
				content: startHereNow,
				created_at: '2026-08-20T00:00:00Z',
				updated_at: '2026-09-25T01:00:00Z'
			},
			{
				id: OUTLINE,
				title: 'Outline',
				type_key: 'document.creative.structure',
				content: '## Part II\n**Card 9** — Decision: AI is the why-now.',
				created_at: '2026-08-20T00:00:00Z',
				updated_at: '2026-09-24T00:00:00Z'
			},
			{
				id: PILLAR,
				title: 'AI Pillar — Working Doc',
				type_key: 'document.creative.structure',
				content: pillar,
				// Untouched for a month: not a change, but it is where the drift lives.
				created_at: '2026-08-01T00:00:00Z',
				updated_at: '2026-08-25T00:00:00Z'
			}
		],
		tasks: [],
		goals: [],
		plans: [],
		milestones: [],
		risks: []
	};
}

type Version = { document_id: string; created_at: string; number: number; content: string };

function versionsClient(versions: Version[]): DriftEvidenceClient {
	return {
		from() {
			const filters: Record<string, string> = {};
			const query: Record<string, unknown> = {};
			for (const method of ['select', 'order', 'limit', 'abortSignal', 'in', 'is'])
				query[method] = () => query;
			query.eq = (column: string, value: string) => ((filters[column] = value), query);
			query.lt = (column: string, value: string) => (
				(filters[`lt:${column}`] = value),
				query
			);
			query.maybeSingle = async () => {
				const match = versions
					.filter(
						(v) =>
							v.document_id === filters.document_id &&
							v.created_at < filters['lt:created_at']!
					)
					.sort((a, b) => b.number - a.number)[0];
				return { data: match ? { content: match.content } : null, error: null };
			};
			return query;
		}
	} as unknown as DriftEvidenceClient;
}

function decider(score: (key: string, request: { questions: Record<string, unknown> }) => number) {
	const decide = vi.fn(
		async (request: { state: unknown; questions: Record<string, unknown> }) => {
			const keys = Object.keys(request.questions);
			return {
				ok: true as const,
				answers: Object.fromEntries(
					keys.map((k) => [k, { type: 'noul', noul: score(k, request) }])
				),
				receipt: {
					modelRequested: 'typesafe/jev-1.13',
					modelUsed: 'typesafe/jev-1.13',
					requestId: 'r1',
					inputTokens: 100,
					outputTokens: 10,
					costUsd: 0.0003,
					durationMs: 400,
					requestBytes: 1000,
					questionCount: keys.length,
					attempts: 1
				}
			};
		}
	);
	return { decide, decider: { decide } as unknown as ContextFinderDecider };
}

const signal = new AbortController().signal;
const baseline: Version[] = [
	{
		document_id: START_HERE,
		created_at: '2026-09-01T00:00:00Z',
		number: 1,
		content: startHereBefore
	},
	{
		document_id: OUTLINE,
		created_at: '2026-09-01T00:00:00Z',
		number: 1,
		content: '## Part II\n**Card 9** — [GAP]'
	}
];

describe('flatDocumentSections', () => {
	it('keeps each section to its own lines and drops managed START HERE regions', () => {
		const sections = flatDocumentSections(startHereNow);
		expect(sections.map((s) => s.heading)).toEqual(['Book', 'Decisions', 'Open questions']);
		expect(sections[0]!.text).toBe('# Book');
		expect(sections[1]!.text).not.toContain('Open questions');
	});

	it('ignores headings inside code fences and keys repeated headings by occurrence', () => {
		const sections = flatDocumentSections(
			'## Notes\na\n```\n## not a heading\n```\n## Notes\nb'
		);
		expect(sections).toHaveLength(2);
		expect(new Set(sections.map((s) => s.key)).size).toBe(2);
	});
});

describe('diffDocumentSections', () => {
	it('reports only the lines an edit added, and never the managed status refresh', () => {
		const changes = diffDocumentSections(startHereBefore, startHereNow);
		expect(changes).toEqual([
			{
				heading: 'Decisions',
				change: 'edited',
				text: '- **AI is the why-now** — decided 2026-09-23'
			}
		]);
	});

	it('treats every section of a new document as added', () => {
		expect(diffDocumentSections(null, pillar).map((c) => c.change)).toEqual([
			'added',
			'added',
			'added'
		]);
	});
});

describe('loadProjectDriftEvidence', () => {
	it('uses the recent changes as the Jev request and loads the stale section it finds', async () => {
		const { decide, decider: jev } = decider((key, request) => {
			const state = request as unknown as { state: { current_request: string } };
			expect(state.state.current_request).toContain('AI is the why-now');
			// Entities: d0 START HERE, d1 outline, d2 pillar. Headings: pillar's open questions.
			if (key === 'e_d2' || key === 'e_d0') return 0.9;
			if (key === 'h_d2_1') return 0.95;
			if (key === 'h_d0_1') return 0.8;
			return 0.05;
		});
		const evidence = await loadProjectDriftEvidence({
			client: versionsClient(baseline),
			projectId: 'project-1',
			decider: jev,
			signal,
			now: NOW,
			project: project()
		});
		expect(decide).toHaveBeenCalledTimes(2);
		expect(evidence?.source).toBe('jev');
		expect(evidence?.changes.map((c) => [c.documentTitle, c.heading, c.change])).toEqual([
			['START HERE', 'Decisions', 'edited'],
			['Outline', 'Part II', 'edited']
		]);
		const pillarItem = evidence?.related.find((item) => item.id === PILLAR);
		expect(pillarItem?.excerpts[0]?.heading).toBe(
			'Open questions before folding into the outline'
		);
		expect(pillarItem?.excerpts[0]?.text).toContain('Name of the move');
		// START HERE is ranked like any document, not skipped as it is in chat.
		expect(evidence?.related.some((item) => item.id === START_HERE)).toBe(true);

		const rendered = renderDriftEvidence(evidence!);
		expect(rendered).toContain('RECENT CHANGES');
		expect(rendered).toContain('RELATED SECTIONS ELSEWHERE');
		expect(rendered).toContain(`document ${PILLAR}`);
	});

	it('skips an older document with no baseline instead of calling all of it new', async () => {
		const evidence = await loadProjectDriftEvidence({
			client: versionsClient([]),
			projectId: 'project-1',
			decider: null,
			signal,
			now: NOW,
			project: project()
		});
		expect(evidence?.changes).toEqual([]);
	});

	it('falls back to START HERE sections and document openings when Jev fails', async () => {
		const decide = vi.fn(async () => ({
			ok: false as const,
			error: 'jev_timeout',
			receipt: {
				modelRequested: 'typesafe/jev-1.13',
				modelUsed: null,
				requestId: null,
				inputTokens: null,
				outputTokens: null,
				costUsd: null,
				durationMs: 6000,
				requestBytes: 1000,
				questionCount: 3,
				attempts: 1
			}
		}));
		const evidence = await loadProjectDriftEvidence({
			client: versionsClient(baseline),
			projectId: 'project-1',
			decider: { decide } as unknown as ContextFinderDecider,
			signal,
			now: NOW,
			project: project()
		});
		expect(evidence?.source).toBe('fallback');
		expect(evidence?.fallbackReason).toBe('jev_unavailable');
		expect(evidence?.changes).toHaveLength(2);
		const startHere = evidence?.related.find((item) => item.id === START_HERE);
		expect(startHere?.excerpts.map((x) => x.heading)).toEqual(['Decisions', 'Open questions']);
	});
});

describe('buildDriftFinderRequest', () => {
	it('asks for the project-wide consistency set when nothing changed', () => {
		expect(buildDriftFinderRequest([], NOW.toISOString())).toContain('internal consistency');
	});
});
