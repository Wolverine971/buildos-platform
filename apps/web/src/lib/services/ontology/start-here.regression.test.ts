// apps/web/src/lib/services/ontology/start-here.regression.test.ts
// Regression tests for the Start Here pure utilities (managed-region merge,
// authored-section append, prompt excerpt). These cover bugs found in the
// 2026-06-24 review: authored appends leaking into managed regions, and the
// managed/authored ownership boundary that keeps capture proposals safe.
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
	buildStartHereTemplate,
	appendStartHereAuthoredSectionUpdates,
	mergeStartHereManagedRegions,
	stripStartHereManagedRegions,
	extractStartHereManagedRegions,
	buildStartHerePromptExcerpt,
	renderStartHereMapContent,
	sanitizeStartHereAuthoredMarkdown,
	preserveCurrentStartHereManagedRegions,
	readStartHereAuthoredSections,
	reconcileStartHereAuthoredSections,
	type StartHereAuthoredSectionUpdate
} from '@buildos/shared-agent-ops/ontology/start-here';
import { loadProjectStartHereExcerpt } from '@buildos/shared-agent-ops/ontology/start-here.service';

const template = () =>
	buildStartHereTemplate({ projectName: 'Apollo', projectDescription: 'Ship the thing.' });

describe('appendStartHereAuthoredSectionUpdates', () => {
	it('appends to the last authored section WITHOUT leaking into the managed map region', () => {
		const body = template();
		const next = appendStartHereAuthoredSectionUpdates(body, [
			{ section: 'Open questions', markdown: '- Are we launching in July?' }
		]);

		// The appended line must appear before the managed:map fence, never inside it.
		const appendedIdx = next.indexOf('- Are we launching in July?');
		const mapOpenIdx = next.indexOf('<!-- managed:map');
		expect(appendedIdx).toBeGreaterThan(-1);
		expect(mapOpenIdx).toBeGreaterThan(-1);
		expect(appendedIdx).toBeLessThan(mapOpenIdx);

		// The managed map region must remain intact and free of authored text.
		const regions = extractStartHereManagedRegions(next);
		expect(regions.map).toBeTruthy();
		expect(regions.map).not.toContain('Are we launching in July?');
	});

	it('appended authored content survives a subsequent managed refresh', () => {
		const body = appendStartHereAuthoredSectionUpdates(template(), [
			{ section: 'Open questions', markdown: '- Durable open question.' }
		]);

		const refreshed = mergeStartHereManagedRegions(body, [
			{ name: 'status', content: '**State:** active\n**Now:** 3 open tasks' },
			{ name: 'map', content: renderStartHereMapContent({ documents: [] }) }
		]);

		// Managed regions updated, authored content preserved.
		expect(refreshed).toContain('Durable open question.');
		expect(refreshed).toContain('3 open tasks');
		const idxQuestion = refreshed.indexOf('Durable open question.');
		const idxMap = refreshed.indexOf('<!-- managed:map');
		expect(idxQuestion).toBeLessThan(idxMap);
	});

	it('appends to a middle authored section in place', () => {
		const next = appendStartHereAuthoredSectionUpdates(template(), [
			{ section: 'Decisions', markdown: '- **Use Postgres** - simplest. _(2026-06-24)_' }
		]);
		const idxDecision = next.indexOf('Use Postgres');
		const idxVocab = next.indexOf('## Vocabulary and mental model');
		expect(idxDecision).toBeGreaterThan(-1);
		expect(idxDecision).toBeLessThan(idxVocab);
	});
});

describe('managed/authored ownership boundary', () => {
	it('stripStartHereManagedRegions removes both managed regions but keeps authored prose', () => {
		const stripped = stripStartHereManagedRegions(template());
		expect(stripped).not.toContain('<!-- managed:');
		expect(stripped).not.toContain('Where the detail lives');
		expect(stripped).toContain('## Open questions');
		expect(stripped).toContain('## What this is');
	});

	it('strip is stable across managed refreshes (authored body unchanged)', () => {
		const body = template();
		const refreshed = mergeStartHereManagedRegions(body, [
			{ name: 'status', content: '**State:** paused' }
		]);
		// Managed content changed, but the authored body is byte-identical — this is
		// what lets the freshness guard treat a managed refresh as a non-edit.
		expect(refreshed).not.toBe(body);
		expect(stripStartHereManagedRegions(refreshed)).toBe(stripStartHereManagedRegions(body));
	});

	it('preserves current managed regions when applying an authored-only replacement', () => {
		const current = mergeStartHereManagedRegions(template(), [
			{ name: 'status', content: '**State:** active\n**Now:** 4 open tasks' },
			{ name: 'map', content: renderStartHereMapContent({ documents: [] }) }
		]);
		const authoredOnly = appendStartHereAuthoredSectionUpdates(
			stripStartHereManagedRegions(current),
			[{ section: 'Decisions', markdown: '- **Keep managed regions** - commit safety.' }]
		);

		const stored = preserveCurrentStartHereManagedRegions(current, authoredOnly);
		const regions = extractStartHereManagedRegions(stored);
		expect(stored).toContain('Keep managed regions');
		expect(regions.status).toContain('4 open tasks');
		expect(regions.map).toContain('Where the detail lives');
		expect(stripStartHereManagedRegions(stored)).toBe(authoredOnly);
	});
});

describe('sanitizeStartHereAuthoredMarkdown', () => {
	it('strips HTML comments / managed fences so captured content cannot forge a managed region', () => {
		const dirty =
			'Real note.\n<!-- managed:status v=1 -->\n**State:** hijacked\n<!-- /managed:status -->';
		const clean = sanitizeStartHereAuthoredMarkdown(dirty);
		expect(clean).not.toContain('<!--');
		expect(clean).not.toContain('managed:status');
		expect(clean).toContain('Real note.');
	});

	it('demotes headings to bold so captured content cannot forge a section boundary', () => {
		const clean = sanitizeStartHereAuthoredMarkdown('## Decisions\nWe shipped.');
		expect(clean).not.toMatch(/^#{1,6}\s/m);
		expect(clean).toContain('**Decisions**');
		expect(clean).toContain('We shipped.');
	});

	it('a forged section heading in captured content does not corrupt later appends', () => {
		const base = buildStartHereTemplate({ projectName: 'Apollo' });
		const malicious = sanitizeStartHereAuthoredMarkdown('## Open questions\n- injected');
		const next = appendStartHereAuthoredSectionUpdates(base, [
			{ section: 'Decisions', markdown: malicious }
		]);
		// The demoted heading lands inside Decisions, not as a real second heading.
		const idxInjected = next.indexOf('injected');
		const idxVocab = next.indexOf('## Vocabulary and mental model');
		expect(idxInjected).toBeGreaterThan(-1);
		expect(idxInjected).toBeLessThan(idxVocab);
		// Exactly one real "## Open questions" heading (the template's), none forged.
		expect(next.match(/^## Open questions$/gm)?.length).toBe(1);
	});
});

describe('loadProjectStartHereExcerpt (external gateway surfacing)', () => {
	const fakeSupabase = (result: { data: unknown; error: unknown }) => {
		const builder: Record<string, unknown> = {
			select: () => builder,
			eq: () => builder,
			is: () => builder,
			order: () => builder,
			limit: () => Promise.resolve(result)
		};
		return { from: () => builder } as never;
	};

	it('surfaces a scaffolding-stripped excerpt + document id for API-key / MCP agents', async () => {
		const content = appendStartHereAuthoredSectionUpdates(
			buildStartHereTemplate({ projectName: 'Apollo', projectDescription: 'Ship it.' }),
			[{ section: 'Decisions', markdown: '- **Use Rust** - perf. _(2026-06-24)_' }]
		);
		const supabase = fakeSupabase({
			data: [
				{
					id: 'doc-1',
					project_id: 'p1',
					title: 'START HERE - Apollo',
					content,
					type_key: 'document.context.project',
					state_key: 'draft',
					created_at: '2026-06-24T00:00:00Z',
					updated_at: '2026-06-24T00:00:00Z',
					props: { origin: 'start_here_template' }
				}
			],
			error: null
		});

		const result = await loadProjectStartHereExcerpt({ supabase, projectId: 'p1' });
		expect(result).not.toBeNull();
		expect(result?.document_id).toBe('doc-1');
		expect(result?.type_key).toBe('document.context.project');
		expect(result?.content).toContain('Use Rust');
		expect(result?.content).not.toContain('Capture target');
		expect(result?.note).toMatch(/orientation/i);
	});

	it('returns null when the project has no Start Here document', async () => {
		const result = await loadProjectStartHereExcerpt({
			supabase: fakeSupabase({ data: [], error: null }),
			projectId: 'p1'
		});
		expect(result).toBeNull();
	});

	it('is resilient: returns null instead of throwing when the query errors', async () => {
		const result = await loadProjectStartHereExcerpt({
			supabase: fakeSupabase({ data: null, error: { message: 'boom' } }),
			projectId: 'p1'
		});
		expect(result).toBeNull();
	});
});

describe('buildStartHerePromptExcerpt', () => {
	it('never exceeds maxChars, even when truncating', () => {
		const long = '# START HERE\n\n' + 'word '.repeat(2000);
		const excerpt = buildStartHerePromptExcerpt(long, 500);
		expect(excerpt.truncated).toBe(true);
		expect(excerpt.content.length).toBeLessThanOrEqual(500);
	});

	it('returns full content untruncated when within budget', () => {
		const short = '# START HERE\n\nShort body.';
		const excerpt = buildStartHerePromptExcerpt(short, 2400);
		expect(excerpt.truncated).toBe(false);
		expect(excerpt.content).toContain('Short body.');
	});

	it('strips authoring scaffolding so a pristine template injects no placeholder context', () => {
		const excerpt = buildStartHerePromptExcerpt(
			buildStartHereTemplate({ projectName: 'Apollo' }),
			2400
		);
		// Section headings survive as an orientation skeleton...
		expect(excerpt.content).toContain('## Open questions');
		// ...but none of the "Capture target" scaffolding or legacy hint reaches the model.
		expect(excerpt.content).not.toContain('Capture target');
		expect(excerpt.content).not.toContain('authored - capture target');
		expect(excerpt.content).not.toMatch(/^>\s*_.+_\s*$/m);
	});

	it('keeps a seeded description and real authored content in the excerpt', () => {
		const seeded = buildStartHereTemplate({
			projectName: 'Apollo',
			projectDescription: 'Ship the lunar lander by Q3.'
		});
		const authored = appendStartHereAuthoredSectionUpdates(seeded, [
			{ section: 'Decisions', markdown: '- **Use Rust** - perf. _(2026-06-24)_' }
		]);
		const excerpt = buildStartHerePromptExcerpt(authored, 2400);
		expect(excerpt.content).toContain('Ship the lunar lander by Q3.');
		expect(excerpt.content).toContain('Use Rust');
		expect(excerpt.content).not.toContain('Capture target');
	});
});

// ---------------------------------------------------------------------------
// tasker/93: the four production captures of project 445dd429 ("100-Day Book
// Project"), reconstructed from the before/after content of their agent_runs
// change sets. Run 3 failed its drift check in production and never applied.
// ---------------------------------------------------------------------------
const FIXTURES = '../../../../../../packages/shared-agent-ops/src/ontology/__fixtures__/';
const readFixture = (name: string) =>
	readFileSync(new URL(`${FIXTURES}${name}`, import.meta.url), 'utf8');

const HISTORICAL_CAPTURES: Array<{
	run: string;
	applied: boolean;
	updates: StartHereAuthoredSectionUpdate[];
}> = [
	{
		run: 'e893c246 (2026-08-22)',
		applied: true,
		updates: [
			{
				section: 'What this is',
				markdown:
					"A 100-day fiction book project using a structured template approach. The project is divided into phases: Phase 1 (Days 1–7) defines the Book Contract, Phase 2 creates the Story Blueprint. The philosophy is 'plan backward from publication, write forward from the seed.'"
			},
			{
				section: 'Decisions',
				markdown:
					'- **Phase 1 starts with the Book Contract** — The first step is to fill out the Book Contract (Target Reader, Reader Promise, One-Sentence Premise, Ending, Form & Voice, Scope Cap, Exclusions). _(2025-04-14)_'
			},
			{
				section: 'Decisions',
				markdown:
					'- **Default scope cap is ~60,000 words** — Approximately 20 chapters × 3,000 words each. _(2025-04-14)_'
			},
			{
				section: 'Decisions',
				markdown:
					'- **The One-Sentence Premise is the seed** — Everything grows from this single sentence. _(2025-04-14)_'
			},
			{
				section: 'Current state',
				markdown:
					'The user has received the full Book Contract & Story Blueprint Template. The immediate next action is to start with the One-Sentence Premise. No work on the template has been done yet.'
			}
		]
	},
	{
		run: 'c173b05a (2026-08-24)',
		applied: true,
		updates: [
			{
				section: 'Decisions',
				markdown:
					'- **Book Contract locked in** — Target reader (men earning <$100K/year, lower-middle class), reader promise (hidden knowledge, practical frameworks), one-sentence premise ("What are the hacks in modern life?"), ending (energized with shortlist), form/voice (first-person, conversational-dense, Marine-meets-Taleb-meets-Ferriss), scope cap (~60,000 words). Exclusions remain open. _(YYYY-MM-DD)_'
			},
			{
				section: 'Decisions',
				markdown:
					"- **Anti-fragility as core philosophy** — The book's backbone is the Nassim Taleb concept of being anti-fragile (getting stronger under pressure). Explicitly stated as the user's life motto. _(YYYY-MM-DD)_"
			},
			{
				section: 'Current state',
				markdown:
					'Day 1 complete. Book Contract is filled and locked (all fields except Exclusions). 100-day clock has started.'
			},
			{
				section: 'Vocabulary and mental model',
				markdown: [
					'- **Hidden knowledge** — The reader should feel they now understand how the world really works.',
					'- **Leverage** — Practical, hackable opportunities across AI, social dynamics, and relationships.',
					'- **Anti-fragile** — The quality of getting stronger under stress, not just resilient.',
					'- **"Hacks in modern life"** — The one-sentence premise; finding where leverage exists and how to employ it.'
				].join('\n')
			},
			{
				section: 'Open questions',
				markdown:
					'- **Exclusions field** — What does the book deliberately *not* cover? (Still unfilled.)'
			}
		]
	},
	{
		run: '83a64c48 (2026-08-24, drift-rejected)',
		applied: false,
		updates: [
			{
				section: 'Decisions',
				markdown:
					'- **Book Contract locked in** — Target reader: men earning under ~$100K/year stuck in lower-middle class. Reader promise: hidden knowledge that makes you want to apply it and tell friends. One-sentence premise: "What are the hacks in modern life?" — finding leverage across AI, social dynamics, and relationships. Ending: energized with a shortlist of things to try and quiet confidence. Form/voice: first-person, conversational but dense, Marine meets Taleb meets Ferriss. Scope cap: ~60,000 words. Anti-fragility as backbone. _(2025-04-14)_'
			},
			{
				section: 'Decisions',
				markdown:
					'- **100-day clock started** — Day 1 milestone (Book Contract) completed. _(2025-04-14)_'
			},
			{
				section: 'Current state',
				markdown:
					'**Phase 1 (Days 1–7): Book Contract** — Target reader, reader promise, one-sentence premise, ending, form/voice, and scope cap are locked in. The Exclusions field remains open. Next steps: either tighten the premise further or move to Phase 2 (Story Blueprint).'
			},
			{
				section: 'Vocabulary and mental model',
				markdown:
					'- **Anti-fragility** — Core life motto and backbone of the book: systems that get stronger under pressure, from Nassim Taleb. The book frames practical advice through this lens.'
			},
			{
				section: 'Open questions',
				markdown:
					'- **Exclusions** — What does this book deliberately NOT cover? (Field remains unfilled in the Book Contract.)'
			}
		]
	},
	{
		run: 'bca8f749 (2026-08-24)',
		applied: true,
		updates: [
			{
				section: 'What this is',
				markdown:
					'A 100-day nonfiction book project that blends AI leverage, social dynamics, relationship strategy, and historical pattern-recognition into a practical anti-fragile playbook for men earning under ~$100K/year who want to escape the permanent lower class.'
			},
			{
				section: 'Current state',
				markdown:
					'**Day 1 of 100 started.** The Book Contract is locked in: target reader, reader promise, one-sentence premise, ending, form & voice, and scope cap (~60,000 words) are defined. The only remaining blank in the contract is **Exclusions** (what the book deliberately does not cover). Next step: define Exclusions, then move to Phase 2 (Story Blueprint).'
			},
			{
				section: 'Decisions',
				markdown: [
					"- **Book Contract locked** – Target reader: men under ~$100K/year; reader promise: hidden knowledge that makes you want to apply it and tell friends; one-sentence premise: 'What are the hacks in modern life?' – finding leverage across AI, social dynamics, and relationships; ending: reader closes energized with a shortlist of things to try; form & voice: first-person, conversational but dense (Marine meets Taleb meets Ferriss); scope cap: ~60,000 words. _(2025-04-14)_",
					'- **100-day clock started** – The project is now on a 100-day writing schedule from this date. _(2025-04-14)_',
					"- **Anti-fragility as backbone** – The book's philosophy is built on Nassim Taleb's anti-fragility (getting stronger under pressure) combined with Tim Ferriss-style leverage and practical hacks. _(2025-04-14)_"
				].join('\n')
			},
			{
				section: 'Vocabulary and mental model',
				markdown: [
					"- **Anti-fragility** – A system that gains from disorder, volatility, and stress; the book's core philosophical stance.",
					"- **Leverage** – Points where small effort yields disproportionate results; the book's practical focus across AI, social dynamics, and relationships.",
					'- **Hacks** – Actionable, unconventional strategies that bypass traditional paths to gain advantage.',
					'- **Hidden knowledge** – The reader promise: after reading, the reader feels they understand how the world actually works and can apply that understanding.'
				].join('\n')
			}
		]
	}
];

/** Mirrors the worker: stage the authored body, commit re-inserts managed regions. */
function commitAuthored(current: string, nextAuthored: string): string {
	return preserveCurrentStartHereManagedRegions(current, nextAuthored);
}

function bulletKeys(markdown: string): string[] {
	return [...markdown.matchAll(/^\s?[-*+]\s+\*\*(.+?)\*\*/gm)].map((match) =>
		(match[1] ?? '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, ' ')
			.trim()
	);
}

describe('tasker/93 replay: 100-Day Book START HERE captures', () => {
	const preCapture = readFixture('start-here-100-day-book.pre-capture.md');
	const production = readFixture('start-here-100-day-book.md');

	it('the old append pipeline reproduces the production damage from these captures', () => {
		let doc = preCapture;
		for (const capture of HISTORICAL_CAPTURES.filter((entry) => entry.applied)) {
			const appended = appendStartHereAuthoredSectionUpdates(doc, capture.updates);
			doc = commitAuthored(doc, stripStartHereManagedRegions(appended));
		}
		expect(readStartHereAuthoredSections(doc)).toEqual(
			readStartHereAuthoredSections(production)
		);
	});

	it('reconciled captures end with no duplicate headings, terms, decisions, or invented dates', () => {
		// Worst realistic model under the new contract: it "merges" by pasting
		// the current section and the new snippet together. Only the
		// deterministic guards stand between that and the old damage.
		const captureDays = ['2026-08-22', '2026-08-24', '2026-08-24', '2026-08-24'];
		let doc = preCapture;
		HISTORICAL_CAPTURES.forEach((capture, index) => {
			const current = readStartHereAuthoredSections(doc);
			const bySection = new Map<StartHereAuthoredSectionUpdate['section'], string[]>();
			for (const update of capture.updates) {
				bySection.set(update.section, [
					...(bySection.get(update.section) ?? []),
					update.markdown
				]);
			}
			const rewrites = [...bySection].map(([section, snippets]) => ({
				section,
				markdown: [current[section] ?? '', ...snippets].filter(Boolean).join('\n\n')
			}));
			const reconciled = reconcileStartHereAuthoredSections({
				currentBody: stripStartHereManagedRegions(doc),
				rewrites,
				dates: {
					today: captureDays[index]!,
					earliest: '2026-08-20',
					allowed: [captureDays[index]!]
				}
			});
			doc = commitAuthored(doc, reconciled.body);
		});

		const sections = readStartHereAuthoredSections(doc);
		const headings = doc.match(/^##\s+.+$/gm) ?? [];
		const decisionKeys = bulletKeys(sections.Decisions ?? '');
		const termKeys = bulletKeys(sections['Vocabulary and mental model'] ?? '');

		expect(new Set(headings).size).toBe(headings.length);
		expect(decisionKeys.filter((key) => key.startsWith('book contract locked'))).toHaveLength(
			1
		);
		expect(decisionKeys.filter((key) => key === '100 day clock started')).toHaveLength(1);
		expect(new Set(termKeys).size).toBe(termKeys.length);
		expect(termKeys.filter((key) => key.startsWith('anti fragil'))).toHaveLength(1);
		expect(doc).not.toMatch(/YYYY-MM-DD|2025-\d{2}-\d{2}/);
		expect(extractStartHereManagedRegions(doc)).toEqual(
			extractStartHereManagedRegions(preCapture)
		);
		// The production doc these captures produced has all of these defects.
		const productionDecisions = bulletKeys(
			readStartHereAuthoredSections(production).Decisions ?? ''
		);
		expect(
			productionDecisions.filter((key) => key.startsWith('book contract locked'))
		).toHaveLength(2);
	});
});
