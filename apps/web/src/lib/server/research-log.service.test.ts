// apps/web/src/lib/server/research-log.service.test.ts
import { describe, expect, it } from 'vitest';
import {
	RESEARCH_ENTRY_MAX_CHARS,
	RESEARCH_LOG_MAX_BYTES,
	RESEARCH_LOG_MAX_ENTRIES,
	buildLogDescription,
	hasEntryForRun,
	planRotation,
	prependEntry,
	renderResearchEntry,
	splitEntries,
	type ResearchEntryInput
} from './research-log.service';

function entry(overrides: Partial<ResearchEntryInput> = {}): ResearchEntryInput {
	return {
		streamRunId: 'run-1',
		userMessage: 'i think we need to figure out what people charge for this',
		queries: ['competitor pricing scheduling', 'acuity pricing 2026'],
		visitedUrls: ['https://calendly.com/pricing', 'https://acuityscheduling.com/pricing'],
		findings: ['Calendly Standard is $10/seat/mo annual'],
		unresolved: ['no public pricing for two vendors'],
		capturedAt: '2026-07-26T02:30:00.000Z',
		...overrides
	};
}

describe('renderResearchEntry', () => {
	it('renders a dated heading, the run marker, and the detail lines', () => {
		const rendered = renderResearchEntry(entry());
		expect(rendered).toContain('## 2026-07-26 · i think we need to figure out');
		expect(rendered).toContain('<!-- run:run-1 -->');
		expect(rendered).toContain('- Queries: competitor pricing scheduling');
		expect(rendered).toContain('https://calendly.com/pricing');
		expect(rendered).toContain('- Unresolved:');
	});

	it('stays within the per-entry cap even with a lot of input', () => {
		const rendered = renderResearchEntry(
			entry({
				userMessage: 'x'.repeat(500),
				queries: Array.from({ length: 12 }, (_, i) => `query number ${i} `.repeat(6)),
				visitedUrls: Array.from(
					{ length: 12 },
					(_, i) => `https://example.com/${'segment/'.repeat(10)}${i}`
				),
				findings: Array.from({ length: 12 }, (_, i) => `finding ${i} `.repeat(10)),
				unresolved: Array.from({ length: 6 }, (_, i) => `unresolved ${i} `.repeat(8))
			})
		);
		expect(rendered.length).toBeLessThanOrEqual(RESEARCH_ENTRY_MAX_CHARS);
	});

	it('never truncates mid-URL when shedding content to fit the cap', () => {
		const rendered = renderResearchEntry(
			entry({
				findings: Array.from({ length: 10 }, (_, i) => `finding ${i} `.repeat(12)),
				visitedUrls: ['https://example.com/a', 'https://example.com/b']
			})
		);
		const urls = rendered.match(/https?:\/\/\S+/g) ?? [];
		for (const url of urls) {
			expect(url.endsWith('…')).toBe(false);
		}
	});

	it('deduplicates repeated queries and urls', () => {
		const rendered = renderResearchEntry(
			entry({
				queries: ['same query', 'same query', 'same query'],
				visitedUrls: ['https://a.com', 'https://a.com']
			})
		);
		expect(rendered.match(/same query/g)).toHaveLength(1);
		expect(rendered.match(/https:\/\/a\.com/g)).toHaveLength(1);
	});
});

describe('idempotency', () => {
	it('detects an entry already written for the same run', () => {
		const content = prependEntry('', renderResearchEntry(entry({ streamRunId: 'run-abc' })));
		expect(hasEntryForRun(content, 'run-abc')).toBe(true);
		expect(hasEntryForRun(content, 'run-xyz')).toBe(false);
	});

	it('treats an empty stream run id as not present', () => {
		expect(hasEntryForRun('anything', '')).toBe(false);
	});
});

describe('prependEntry / splitEntries', () => {
	it('puts the newest entry first and keeps a single header', () => {
		let content = prependEntry('', renderResearchEntry(entry({ streamRunId: 'r1' })));
		content = prependEntry(content, renderResearchEntry(entry({ streamRunId: 'r2' })));
		const entries = splitEntries(content);
		expect(entries).toHaveLength(2);
		expect(entries[0]).toContain('run:r2');
		expect(entries[1]).toContain('run:r1');
		expect(content.match(/# Research Log/g)).toHaveLength(1);
	});
});

describe('planRotation', () => {
	function logWith(count: number): string {
		let content = '';
		for (let i = 0; i < count; i += 1) {
			content = prependEntry(
				content,
				renderResearchEntry(entry({ streamRunId: `run-${i}` }))
			);
		}
		return content;
	}

	it('does nothing while under both caps', () => {
		expect(planRotation(logWith(RESEARCH_LOG_MAX_ENTRIES))).toBeNull();
	});

	it('rotates the oldest entries once the entry cap is exceeded', () => {
		const plan = planRotation(logWith(RESEARCH_LOG_MAX_ENTRIES + 3));
		expect(plan).not.toBeNull();
		expect(splitEntries(plan!.liveContent)).toHaveLength(RESEARCH_LOG_MAX_ENTRIES);
		expect(plan!.rotatedEntries).toHaveLength(3);
		// Newest survives in the live log; oldest is the one rotated out.
		expect(plan!.liveContent).toContain(`run-${RESEARCH_LOG_MAX_ENTRIES + 2}`);
		expect(plan!.rotatedEntries.join('\n')).toContain('run-0');
	});

	it('rotates on the byte cap even when the entry count is fine', () => {
		const fat = Array.from({ length: 8 }, (_, i) =>
			[`## 2026-07-26 · big ${i}`, `<!-- run:big-${i} -->`, '', 'x'.repeat(4000)].join('\n')
		);
		const content = `# Research Log\n\n${fat.join('\n\n')}`;
		expect(Buffer.byteLength(content, 'utf8')).toBeGreaterThan(RESEARCH_LOG_MAX_BYTES);

		const plan = planRotation(content);
		expect(plan).not.toBeNull();
		expect(Buffer.byteLength(plan!.liveContent, 'utf8')).toBeLessThanOrEqual(
			RESEARCH_LOG_MAX_BYTES
		);
		expect(plan!.rotatedEntries.length).toBeGreaterThan(0);
		expect(splitEntries(plan!.liveContent).length).toBeLessThan(8);
	});

	it('always keeps at least the newest entry, even if it alone busts the byte cap', () => {
		const huge = ['## 2026-07-26 · huge', '<!-- run:huge -->', '', 'y'.repeat(40_000)].join(
			'\n'
		);
		const older = ['## 2026-07-25 · older', '<!-- run:older -->', '', 'z'.repeat(100)].join(
			'\n'
		);
		const plan = planRotation(`# Research Log\n\n${huge}\n\n${older}`);
		expect(plan).not.toBeNull();
		expect(splitEntries(plan!.liveContent)).toHaveLength(1);
		expect(plan!.liveContent).toContain('run:huge');
	});
});

describe('buildLogDescription', () => {
	it('summarizes the latest topic within the highlight truncation budget', () => {
		const description = buildLogDescription(entry({ userMessage: 'z'.repeat(400) }));
		expect(description.length).toBeLessThanOrEqual(180);
		expect(description.startsWith('Auto-captured research. Latest:')).toBe(true);
	});
});
