// packages/shared-agent-ops/src/utils/document-card.test.ts
import { describe, expect, it } from 'vitest';
import { extractOutline, hashDocumentContent } from './document-outline';
import {
	documentCard,
	freshDigestSummary,
	outlineTopics,
	plainOutlineHeading
} from './document-card';

const TEXT =
	'# Launch plan\n\n## Budget &amp; team\n$300K.\n\n### Hiring\nTwo.\n\n## Timeline\nQ3.';

describe('document cards', () => {
	it('lists headings as topics, without an H1 that repeats the title', () => {
		const outline = extractOutline(TEXT);
		expect(outlineTopics(outline, 'Launch plan')).toEqual([
			'Budget & team',
			'Hiring',
			'Timeline'
		]);
		expect(outlineTopics(outline, 'Something else')[0]).toBe('Launch plan');
		expect(outlineTopics(null)).toEqual([]);
	});

	it('uses the summary only while it matches the text', () => {
		const hash = hashDocumentContent(TEXT);
		const digest = { summary: 'Plan for the launch.', content_hash: hash };
		expect(freshDigestSummary(digest, hash)).toBe('Plan for the launch.');
		expect(freshDigestSummary(digest, 'other')).toBeNull();
		expect(freshDigestSummary({ failed_at: 'x', content_hash: hash }, hash)).toBeNull();
	});

	it("prefers the person's description, then the summary; short text is its own card", () => {
		const hash = hashDocumentContent(TEXT);
		const digest = { summary: 'AI line.', content_hash: hash };
		expect(
			documentCard({ description: 'Mine.', digest, content_hash: hash }).summarySource
		).toBe('description');
		const card = documentCard({ digest, content_hash: hash, outline: extractOutline(TEXT) });
		expect(card).toMatchObject({ summary: 'AI line.', summarySource: 'digest', text: null });
		expect(documentCard({ content: '  call Sam re: venue  ' }).text).toBe('call Sam re: venue');
		expect(documentCard({ content: 'x'.repeat(400) }).text).toBeNull();
	});

	it('decodes heading HTML', () => {
		expect(plainOutlineHeading('<strong>Q3</strong> &amp; &#x1F680; &lt;go&gt;')).toBe(
			'Q3 & 🚀 <go>'
		);
	});
});
