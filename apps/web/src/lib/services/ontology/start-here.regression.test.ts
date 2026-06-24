// apps/web/src/lib/services/ontology/start-here.regression.test.ts
// Regression tests for the Start Here pure utilities (managed-region merge,
// authored-section append, prompt excerpt). These cover bugs found in the
// 2026-06-24 review: authored appends leaking into managed regions, and the
// managed/authored ownership boundary that keeps capture proposals safe.
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
	preserveCurrentStartHereManagedRegions
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
