// apps/web/src/lib/utils/assistant-app-links.test.ts
import { describe, expect, it } from 'vitest';
import { repairAssistantAppLinkHref, repairAssistantAppLinks } from './assistant-app-links';
import { renderAgentMarkdownContent } from './markdown';

const PROJECT = '445dd429-db93-4878-90a9-b3ab1627a9f2';
const DOC = '1cad2618-3188-43ac-98ff-e715a8a8013d';
const DOC_PATH = `/projects/${PROJECT}/documents/${DOC}`;

describe('repairAssistantAppLinkHref', () => {
	it('rewrites an invented origin on a record route to the relative path', () => {
		expect(repairAssistantAppLinkHref(`https://buildos.com${DOC_PATH}`)).toEqual({
			kind: 'rewrite',
			href: DOC_PATH
		});
		expect(
			repairAssistantAppLinkHref(`https://app.build-os.com/projects/${PROJECT}?doc=${DOC}#top`)
		).toEqual({ kind: 'rewrite', href: `/projects/${PROJECT}?doc=${DOC}#top` });
		expect(repairAssistantAppLinkHref(`http://localhost:5173/projects/${PROJECT}`)).toEqual({
			kind: 'rewrite',
			href: `/projects/${PROJECT}`
		});
	});

	it('drops a link whose target is a bare record id', () => {
		expect(repairAssistantAppLinkHref(DOC)).toEqual({ kind: 'unlink' });
		expect(repairAssistantAppLinkHref(` ${DOC.toUpperCase()} `)).toEqual({ kind: 'unlink' });
	});

	it('keeps relative app paths, outside sites, and non-record paths', () => {
		for (const href of [
			DOC_PATH,
			'https://en.wikipedia.org/wiki/Antifragility',
			'https://github.com/org/repo/projects/1',
			'https://build-os.com/pricing',
			`https://example.com/projects/not-a-uuid`,
			'mailto:dj@example.com',
			'#section',
			'',
			null
		]) {
			expect(repairAssistantAppLinkHref(href)).toEqual({ kind: 'keep' });
		}
	});
});

describe('repairAssistantAppLinks', () => {
	it('repairs Markdown links in assistant text and leaves the rest untouched', () => {
		const text = [
			`Updated [Book Contract](https://buildos.com${DOC_PATH}) (edited 8 lines).`,
			`See [the outline](${DOC}) and [Taleb](https://en.wikipedia.org/wiki/Antifragility).`,
			`Already fine: [START HERE](/projects/${PROJECT}/documents/${DOC}).`,
			`![chart](https://buildos.com${DOC_PATH})`
		].join('\n');
		expect(repairAssistantAppLinks(text)).toBe(
			[
				`Updated [Book Contract](${DOC_PATH}) (edited 8 lines).`,
				'See the outline and [Taleb](https://en.wikipedia.org/wiki/Antifragility).',
				`Already fine: [START HERE](/projects/${PROJECT}/documents/${DOC}).`,
				`![chart](https://buildos.com${DOC_PATH})`
			].join('\n')
		);
	});

	it('returns text without links unchanged', () => {
		const text = 'No links here (just parentheses) and [brackets].';
		expect(repairAssistantAppLinks(text)).toBe(text);
	});
});

describe('renderAgentMarkdownContent link repair', () => {
	it('renders an invented-origin record link as a same-tab relative link', () => {
		const html = renderAgentMarkdownContent(`Updated [Book Contract](https://buildos.com${DOC_PATH}).`);
		expect(html).toContain(`href="${DOC_PATH}"`);
		expect(html).not.toContain('buildos.com');
		expect(html).not.toContain('target="_blank"');
	});

	it('renders a bare-id link as plain text', () => {
		const html = renderAgentMarkdownContent(`See [the outline](${DOC}).`);
		expect(html).not.toContain('<a');
		expect(html).toContain('the outline');
	});

	it('still opens outside links in a new tab', () => {
		const html = renderAgentMarkdownContent('[Taleb](https://en.wikipedia.org/wiki/Antifragility)');
		expect(html).toContain('href="https://en.wikipedia.org/wiki/Antifragility"');
		expect(html).toContain('target="_blank"');
	});
});
