// apps/worker/tests/freshnessRadarRollup.test.ts
//
// Tasker 106: recorded decisions as news, document sections, Jev targeting,
// the section dig, and the roll-up (merge, accumulate, close). Pure stages
// only; the end-to-end scan lives in freshnessRadarWorker.test.ts.
import type { FreshnessConcernDetail, FreshnessConcernEvidence } from '@buildos/shared-types';
import { describe, expect, it } from 'vitest';
import { combineDocumentDecisions } from '../src/workers/freshness-radar/combine';
import { candidateSnapshot } from '../src/workers/freshness-radar/context';
import {
	decisionsSince,
	recordedDecisionsFromStartHere
} from '../src/workers/freshness-radar/decisions';
import { fixInChatPrompt } from '../src/workers/freshness-radar/fixInChat';
import { FRESHNESS_POLICY_V1 as POLICY } from '../src/workers/freshness-radar/freshnessPolicy';
import type { FreshnessCandidate } from '../src/workers/freshness-radar/prefilter';
import {
	type ConcernObservation,
	type ConcernRow,
	concernScore,
	evidenceKey,
	mergeConcerns
} from '../src/workers/freshness-radar/rollup';
import { applyTargeting } from '../src/workers/freshness-radar/scanStages';
import { documentSegments, segmentHashes } from '../src/workers/freshness-radar/sections';

const NOW = new Date('2026-09-25T01:00:00.000Z');

const START_HERE = `# Book

<!-- managed:status v=1 -->
**State:** planning
<!-- /managed:status -->

## Decisions

- **Book Contract locked** — reader: men under ~$100K.
- **AI is the why-now** — AI makes building cheap. _(2026-09-23)_
- **The Reindex** — the Life Audit move is called The Reindex. _(2026-09-23)_
- **Reindex folded into Card 2** — the Monday move lives in Card 2. _(2026-09-24)_

## Open questions

- **AI's role** — undecided.
`;

const PILLAR = `# AI Pillar — Working Doc

_Assembled 2026-09-23._

## The Monday move: the Life Audit (working title)

Tell AI to act like your coach.

### Naming the move (decide before the outline fold)

Candidates: The Life Audit, The Reindex, The Asset Inventory.

## The questions (reader prompts — keep verbatim)

- What does your dream lifestyle look like?

## Open questions before folding into the outline

- **Name of the move** — not settled.
`;

function candidate(
	kind: FreshnessCandidate['kind'],
	id: string,
	title: string,
	extra: Partial<FreshnessCandidate> = {}
): FreshnessCandidate {
	return {
		kind,
		id,
		title,
		description: null,
		state: kind === 'task' ? 'todo' : kind === 'document' ? 'draft' : 'active',
		startAt: null,
		dueAt: null,
		targetDate: null,
		startCivil: null,
		dueCivil: null,
		targetCivil: null,
		updatedAt: '2026-09-23T17:56:40.000Z',
		createdAt: '2026-09-20T00:00:00.000Z',
		partOf: null,
		summary: null,
		props: {},
		...extra
	};
}

function detail(extra: Partial<FreshnessConcernDetail> = {}): FreshnessConcernDetail {
	return {
		changeKind: 'rewrite_details',
		sections: [],
		decisions: [],
		evidenceExcerpt: null,
		proposal: null,
		fixInChatPrompt: 'Update it.',
		...extra
	};
}

function observation(
	subject: FreshnessCandidate,
	probability: number,
	key: string,
	extra: Partial<ConcernObservation> = {}
): ConcernObservation {
	return {
		candidate: subject,
		flagId: `flag-${key}`,
		probability,
		suppressed: false,
		noChangeNeeded: false,
		evidenceKey: key,
		detail: detail(),
		...extra
	};
}

function openRow(subject: FreshnessCandidate, extra: Partial<ConcernRow> = {}): ConcernRow {
	return {
		id: `concern-${subject.id}`,
		subject_kind: subject.kind,
		subject_id: subject.id,
		subject_title: subject.title,
		status: 'open',
		score: 0.25,
		peak_probability: 0.5,
		last_probability: 0.5,
		evidence_count: 1,
		seen_count: 1,
		first_flag_id: 'flag-0',
		last_flag_id: 'flag-0',
		evidence: [
			{
				flagId: 'flag-0',
				scanId: 'scan-0',
				probability: 0.5,
				at: NOW.toISOString(),
				key: 'k0'
			}
		],
		detail: detail(),
		subject_snapshot: candidateSnapshot(subject),
		subject_updated_at: subject.updatedAt,
		first_seen_at: NOW.toISOString(),
		last_seen_at: NOW.toISOString(),
		last_evidence_at: NOW.toISOString(),
		surfaced_at: null,
		surfaced_scan_id: null,
		...extra
	};
}

const closedStates = (subject: FreshnessCandidate) =>
	Boolean(subject.archivedAt) || (subject.kind === 'task' && subject.state === 'done');

function merge(params: {
	open?: ConcernRow[];
	observations?: ConcernObservation[];
	current: FreshnessCandidate[];
	sectionHashes?: Map<string, Map<string, string>>;
	now?: Date;
}) {
	return mergeConcerns({
		open: params.open ?? [],
		observations: params.observations ?? [],
		current: new Map(params.current.map((entry) => [`${entry.kind}:${entry.id}`, entry])),
		isClosed: closedStates,
		sectionHashes: params.sectionHashes ?? new Map(),
		scanId: 'scan-now',
		now: params.now ?? NOW,
		policy: POLICY
	});
}

describe('recorded decisions (START HERE)', () => {
	it('reads dated decision bullets, newest first, and strips the stamp', () => {
		const decisions = recordedDecisionsFromStartHere(START_HERE, POLICY.decisions);
		expect(decisions.map((decision) => [decision.id, decision.recorded])).toEqual([
			['d1', '2026-09-24'],
			['d2', '2026-09-23'],
			['d3', '2026-09-23'],
			['d4', null]
		]);
		expect(decisions[0]!.text).toBe(
			'**Reindex folded into Card 2** — the Monday move lives in Card 2.'
		);
		expect(decisions.map((decision) => decision.text).join(' ')).not.toContain('_(');
		// Open questions are not decisions.
		expect(decisions.map((decision) => decision.text).join(' ')).not.toContain('undecided');
	});

	it('counts same-day decisions as newer, never unstamped ones', () => {
		const decisions = recordedDecisionsFromStartHere(START_HERE, POLICY.decisions);
		expect(decisionsSince(decisions, '2026-09-23').map((decision) => decision.id)).toEqual([
			'd1',
			'd2',
			'd3'
		]);
		expect(decisionsSince(decisions, '2026-09-24').map((decision) => decision.id)).toEqual([
			'd1'
		]);
		expect(recordedDecisionsFromStartHere(null, POLICY.decisions)).toEqual([]);
		expect(recordedDecisionsFromStartHere('# No sections', POLICY.decisions)).toEqual([]);
	});
});

describe('document sections', () => {
	it('splits a doc into its own-text sections with chat-compatible anchors', () => {
		const segments = documentSegments(PILLAR, { sectionChars: 1_500 });
		expect(segments.map((segment) => [segment.anchor, segment.heading])).toEqual([
			['ai-pillar--working-doc', 'AI Pillar — Working Doc'],
			[
				'the-monday-move-the-life-audit-working-title',
				'The Monday move: the Life Audit (working title)'
			],
			[
				'naming-the-move-decide-before-the-outline-fold',
				'Naming the move (decide before the outline fold)'
			],
			[
				'the-questions-reader-prompts--keep-verbatim',
				'The questions (reader prompts — keep verbatim)'
			],
			[
				'open-questions-before-folding-into-the-outline',
				'Open questions before folding into the outline'
			]
		]);
		// A parent's own text stops at its first child heading.
		expect(segments[1]!.text).not.toContain('Candidates');
		expect(segments[2]!.text).toContain('Candidates');
	});

	it('hashes each section so an edit elsewhere leaves it untouched', () => {
		const before = segmentHashes(PILLAR);
		const edited = PILLAR.replace(
			'- **Name of the move** — not settled.',
			'- Named: The Reindex.'
		);
		const after = segmentHashes(edited);
		expect(after.get('open-questions-before-folding-into-the-outline')).not.toBe(
			before.get('open-questions-before-folding-into-the-outline')
		);
		expect(after.get('naming-the-move-decide-before-the-outline-fold')).toBe(
			before.get('naming-the-move-decide-before-the-outline-fold')
		);
	});

	it('clips long sections with a visible marker', () => {
		const long = `## Big\n\n${'word '.repeat(600)}`;
		const [segment] = documentSegments(long, { sectionChars: 200 });
		expect(segment!.text.length).toBeLessThanOrEqual(230);
		expect(segment!.text).toContain('[section shortened]');
	});
});

describe('Jev targeting', () => {
	const pool = ['a', 'b', 'c', 'd'].map((id, rank) => ({
		candidate: candidate(id === 'd' ? 'document' : 'task', id, `Record ${id}`),
		features: {
			score: 0,
			title: 0,
			description: 0,
			dateMention: 0,
			dueSoon: 0,
			edge: 0,
			kindBonus: 0,
			padded: false,
			rank
		}
	}));
	const context = { pool, prefiltered: pool.slice(0, 2) } as never;
	const plan = { request: null, records: pool, droppedForSize: 0 };
	const answers = (values: number[]) =>
		Object.fromEntries(
			values.map((noul, index) => [`target_${index}`, { type: 'noul', noul }])
		);

	it('keeps records above both the floor and half the best score, split by kind', () => {
		const result = applyTargeting({
			context,
			plan,
			answers: answers([0.78, 0.26, 0.2, 0.9]) as never,
			forcedKeys: new Set(),
			policy: POLICY
		});
		expect(result.source).toBe('jev');
		expect(result.entities.map((entry) => entry.candidate.id)).toEqual(['a']);
		expect(result.documents.map((entry) => entry.candidate.id)).toEqual(['d']);
		expect(result.scores.get('task:b')).toBe(0.26);
	});

	it('always keeps open-concern subjects (they need fresh evidence)', () => {
		const result = applyTargeting({
			context,
			plan,
			answers: answers([0.1, 0.1, 0.1, 0.1]) as never,
			forcedKeys: new Set(['task:c']),
			policy: POLICY
		});
		expect(result.entities.map((entry) => entry.candidate.id)).toEqual(['c']);
		expect(result.documents).toEqual([]);
	});

	it('falls back to the lexical top-N when Jev failed', () => {
		const result = applyTargeting({
			context,
			plan,
			answers: null,
			forcedKeys: new Set(),
			policy: POLICY
		});
		expect(result.source).toBe('lexical_fallback');
		expect(result.entities.map((entry) => entry.candidate.id)).toEqual(['a', 'b']);
	});
});

describe('section dig', () => {
	const doc = candidate('document', 'doc-1', 'AI Pillar — Working Doc');
	const segments = documentSegments(PILLAR, { sectionChars: 1_500 });
	const input = {
		index: 3,
		documentIndex: 0,
		candidate: doc,
		prefilter: {} as never,
		segments,
		sectionIndexes: segments.map((_, index) => ({ segmentIndex: index, questionIndex: index }))
	};
	// Probe 2026-09-24 on the real doc: the three stale sections scored 0.70-0.88.
	const answers = {
		section_0: { type: 'noul', noul: 0.2 },
		section_1: { type: 'noul', noul: 0.7 },
		section_2: { type: 'noul', noul: 0.88 },
		section_3: { type: 'noul', noul: 0.15 },
		section_4: { type: 'noul', noul: 0.86 }
	};

	it('flags a document by its stalest sections, best first, capped at three', () => {
		const [decision] = combineDocumentDecisions({
			documents: [input],
			answers: answers as never,
			sentences: [],
			suppressed: new Map(),
			policy: POLICY
		});
		expect(decision).toMatchObject({
			disposition: 'surfaced',
			reason: 'stale_sections',
			probability: 0.88,
			changeKind: 'content_outdated',
			proposal: null
		});
		expect(decision!.sections.map((section) => section.anchor)).toEqual([
			'naming-the-move-decide-before-the-outline-fold',
			'open-questions-before-folding-into-the-outline',
			'the-monday-move-the-life-audit-working-title'
		]);
	});

	it('keeps a doc below the bar as evaluated, and honours suppression', () => {
		const calm = Object.fromEntries(
			segments.map((_, index) => [`section_${index}`, { type: 'noul', noul: 0.3 }])
		);
		const [below] = combineDocumentDecisions({
			documents: [input],
			answers: calm as never,
			sentences: [],
			suppressed: new Map(),
			policy: POLICY
		});
		expect(below).toMatchObject({ disposition: 'evaluated', reason: 'below_stale_threshold' });
		expect(below!.sections).toEqual([]);
		const [suppressed] = combineDocumentDecisions({
			documents: [input],
			answers: answers as never,
			sentences: [],
			suppressed: new Map([['document:doc-1', 'marked_not_stale' as const]]),
			policy: POLICY
		});
		expect(suppressed!.disposition).toBe('suppressed');
	});
});

describe('Fix in chat prompt', () => {
	it('names the doc, its stale sections and the decisions that came after', () => {
		const prompt = fixInChatPrompt({
			kind: 'document',
			title: 'AI Pillar — Working Doc',
			changeKind: 'content_outdated',
			sections: [
				{ anchor: 'a', heading: 'Naming the move', probability: 0.88, textSha256: 'x' },
				{ anchor: null, heading: '(opening)', probability: 0.8, textSha256: 'y' }
			],
			decisions: [
				{
					text: '**The Reindex** — the move is called The Reindex.',
					recorded: '2026-09-23'
				}
			]
		});
		expect(prompt).toBe(
			'In "AI Pillar — Working Doc": This section looks out of date: "Naming the move". Since then I decided: The Reindex — the move is called The Reindex. (2026-09-23). Update just that section to match, and leave the rest of the doc as is.'
		);
	});

	it('falls back to "what I said" without decisions, and to drop/replace wording', () => {
		expect(
			fixInChatPrompt({
				kind: 'task',
				title: 'Blueprint',
				changeKind: 'rewrite_details',
				sections: [],
				decisions: []
			})
		).toBe('Update "Blueprint" to reflect what I just said.');
		expect(
			fixInChatPrompt({
				kind: 'task',
				title: 'Blueprint',
				changeKind: 'cancel_or_drop',
				sections: [],
				decisions: []
			})
		).toBe(`Drop "Blueprint", it's no longer needed.`);
	});
});

describe('roll-up score', () => {
	const at = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
	const evidence = (items: Array<[number, number]>): FreshnessConcernEvidence[] =>
		items.map(([probability, daysAgo], index) => ({
			flagId: null,
			scanId: `s${index}`,
			probability,
			at: at(daysAgo),
			key: `k${index}`
		}));

	it('the book ledger: the blueprint task crosses the bar on its 4th observation', () => {
		// 0.50, 0.42 on 09-23; 0.50, 0.41 on 09-25 (prod ledger, tasker 106).
		const scores = [
			evidence([[0.5, 1.2]]),
			evidence([
				[0.5, 1.2],
				[0.42, 1.2]
			]),
			evidence([
				[0.5, 1.2],
				[0.42, 1.2],
				[0.5, 0]
			]),
			evidence([
				[0.5, 1.2],
				[0.42, 1.2],
				[0.5, 0],
				[0.41, 0]
			])
		].map((items) => concernScore(items, NOW, POLICY));
		expect(scores.slice(0, 3).every((score) => score < POLICY.rollup.bar)).toBe(true);
		expect(scores[3]).toBeGreaterThanOrEqual(POLICY.rollup.bar);
	});

	it('a one-off 0.5 never surfaces; a single observation at the bar does', () => {
		expect(concernScore(evidence([[0.5, 0]]), NOW, POLICY)).toBeLessThan(POLICY.rollup.bar);
		expect(concernScore(evidence([[0.6, 0]]), NOW, POLICY)).toBe(0.6);
	});

	it('decays with age', () => {
		expect(concernScore(evidence([[0.8, 7]]), NOW, POLICY)).toBe(0.4);
	});
});

describe('roll-up merge', () => {
	const task = candidate('task', 't1', 'Complete chapter and framework blueprint', {
		updatedAt: '2026-09-23T16:31:47.000Z'
	});
	const doc = candidate('document', 'd1', 'AI Pillar — Working Doc');
	const segments = documentSegments(PILLAR, { sectionChars: 1_500 });
	const stale = segments.filter((segment) =>
		[
			'naming-the-move-decide-before-the-outline-fold',
			'open-questions-before-folding-into-the-outline'
		].includes(segment.anchor ?? '')
	);
	const docSections = stale.map((segment) => ({
		anchor: segment.anchor,
		heading: segment.heading,
		probability: 0.87,
		textSha256: segment.textSha256
	}));

	it('opens a concern at the floor and surfaces it once it crosses the bar', () => {
		const first = merge({ observations: [observation(task, 0.5, 'k1')], current: [task] });
		expect(first.inserts).toHaveLength(1);
		expect(first.inserts[0]).toMatchObject({ status: 'open', score: 0.5, surfaced_at: null });
		expect(first.newlySurfaced).toEqual([]);

		const quiet = merge({ observations: [observation(task, 0.2, 'k1')], current: [task] });
		expect(quiet.inserts).toEqual([]); // below the floor: nothing to track
	});

	it('accumulates independent evidence, and never counts the same evidence twice', () => {
		let row = openRow(task);
		const keys = ['k1', 'k2', 'k2', 'k3', 'k4'];
		const probabilities = [0.42, 0.5, 0.5, 0.41, 0.45];
		const surfacedAt: number[] = [];
		keys.forEach((key, index) => {
			const plan = merge({
				open: [row],
				observations: [observation(task, probabilities[index]!, key)],
				current: [task]
			});
			const update = plan.updates[0]!;
			row = { ...row, ...update.patch } as ConcernRow;
			if (plan.newlySurfaced.length) surfacedAt.push(index);
		});
		// k2 repeated: one evidence item; the 4th distinct observation crosses the bar, once.
		expect(row.evidence.map((item) => item.key)).toEqual(['k0', 'k1', 'k2', 'k3', 'k4']);
		expect(row.evidence_count).toBe(5);
		expect(row.seen_count).toBe(6);
		expect(surfacedAt).toEqual([3]);
		expect(row.surfaced_at).toBe(NOW.toISOString());
	});

	it('closes a task concern when the task is edited, finished or deleted', () => {
		const edited = { ...task, description: 'New blueprint scope' };
		expect(merge({ open: [openRow(task)], current: [edited] }).updates[0]!.patch).toMatchObject(
			{
				status: 'resolved',
				close_reason: 'resolved_by_update',
				closed_scan_id: 'scan-now'
			}
		);
		const done = { ...task, state: 'done' };
		expect(merge({ open: [openRow(task)], current: [done] }).updates[0]!.patch).toMatchObject({
			status: 'resolved',
			close_reason: 'subject_closed'
		});
		expect(merge({ open: [openRow(task)], current: [] }).updates[0]!.patch).toMatchObject({
			close_reason: 'subject_closed'
		});
	});

	it('closes a document concern only when its flagged sections change', () => {
		const row = openRow(doc, { detail: detail({ sections: docSections }) });
		const unrelatedEdit = segmentHashes(PILLAR.replace('Tell AI to act', 'Ask AI to act'));
		const keep = merge({
			open: [row],
			current: [{ ...doc, updatedAt: NOW.toISOString() }],
			sectionHashes: new Map([['d1', unrelatedEdit]])
		});
		expect(keep.updates.every((update) => !update.patch.closed_at)).toBe(true);

		const partial = segmentHashes(
			PILLAR.replace('- **Name of the move** — not settled.', '- Named: The Reindex.')
		);
		const narrowed = merge({
			open: [row],
			current: [doc],
			sectionHashes: new Map([['d1', partial]])
		});
		expect(
			narrowed.updates[0]!.patch.detail!.sections.map((section) => section.anchor)
		).toEqual(['naming-the-move-decide-before-the-outline-fold']);

		const fixed = segmentHashes(
			PILLAR.replace(
				'- **Name of the move** — not settled.',
				'- Named: The Reindex.'
			).replace(
				'Candidates: The Life Audit, The Reindex, The Asset Inventory.',
				'Decided: The Reindex.'
			)
		);
		expect(
			merge({ open: [row], current: [doc], sectionHashes: new Map([['d1', fixed]]) })
				.updates[0]!.patch
		).toMatchObject({ status: 'resolved', close_reason: 'resolved_by_update' });
	});

	it('ages out without new evidence, and closes on a later user dismissal', () => {
		const old = new Date(NOW.getTime() - 15 * 86_400_000).toISOString();
		const aged = merge({
			open: [openRow(task, { last_evidence_at: old })],
			current: [task]
		});
		expect(aged.updates[0]!.patch).toMatchObject({
			status: 'expired',
			close_reason: 'aged_out'
		});
		const dismissed = merge({
			open: [openRow(task)],
			observations: [observation(task, 0.7, 'k9', { suppressed: true })],
			current: [task]
		});
		expect(dismissed.updates[0]!.patch).toMatchObject({
			status: 'dismissed',
			close_reason: 'user_dismissed'
		});
	});

	it('never accumulates what Jev itself says needs no change (the book goal, 09-25 replay)', () => {
		// Replay: the 100-day goal scored 0.45, 0.44, 0.47 with no_change_needed each
		// time; counting those would have surfaced it on the 4th check.
		const noChange = { noChangeNeeded: true };
		const fresh = merge({
			observations: [observation(task, 0.45, 'g1', noChange)],
			current: [task]
		});
		expect(fresh.inserts).toHaveLength(0);
		const existing = merge({
			open: [openRow(task)],
			observations: [observation(task, 0.47, 'g2', noChange)],
			current: [task]
		});
		expect(existing.updates[0]?.patch.evidence_count).toBeUndefined();
		expect(existing.updates[0]?.patch.seen_count).toBeUndefined();
		expect(existing.newlySurfaced).toHaveLength(0);
	});

	it('evidence keys ignore chat messages unless the chat bears on the subject', () => {
		const base = {
			snapshot: candidateSnapshot(task),
			subjectUpdatedAt: task.updatedAt,
			kind: 'task' as const,
			newerDecisionTexts: ['AI is the why-now']
		};
		expect(evidenceKey({ ...base, chatMessageIds: [] })).toBe(
			evidenceKey({ ...base, chatMessageIds: [] })
		);
		expect(evidenceKey({ ...base, chatMessageIds: ['m1'] })).not.toBe(
			evidenceKey({ ...base, chatMessageIds: ['m2'] })
		);
		expect(evidenceKey({ ...base, chatMessageIds: [] })).not.toBe(
			evidenceKey({ ...base, newerDecisionTexts: ['A new decision'], chatMessageIds: [] })
		);
	});
});
