// apps/web/src/lib/builder-profile/project-pages.test.ts
import { describe, expect, it } from 'vitest';
import {
	isEmailReply,
	isProjectPageSlug,
	normalizeReplyUrl,
	projectPaths,
	projectSlug,
	replyDisplay
} from './project-pages';

const A = '05c40ed8-9dbe-4893-bd64-8aeec90eab40';
const B = '7bb400ff-e299-40b0-9a4b-e6081f2e6ef8';
const C = 'f85b6c5f-59fb-4e4c-8654-748f793d8f4b';

describe('projectSlug', () => {
	it('lowercases and turns other characters into single dashes', () => {
		expect(projectSlug('9takes')).toBe('9takes');
		expect(projectSlug('Wayne Strategies')).toBe('wayne-strategies');
		expect(projectSlug('  BuildOS — v2!  ')).toBe('buildos-v2');
		expect(projectSlug('***')).toBe('');
	});
});

describe('isProjectPageSlug', () => {
	it('accepts slugs and project ids, nothing else', () => {
		expect(isProjectPageSlug('wayne-strategies')).toBe(true);
		expect(isProjectPageSlug(A)).toBe(true);
		expect(isProjectPageSlug('-lead')).toBe(false);
		expect(isProjectPageSlug('a--b')).toBe(false);
		expect(isProjectPageSlug('Has Space')).toBe(false);
		expect(isProjectPageSlug('../etc')).toBe(false);
	});
});

describe('projectPaths', () => {
	it('gives Live projects a page by name and skips Listed ones', () => {
		const paths = projectPaths('djwayne', [
			{ id: A, name: '9takes', level: 'live' },
			{ id: B, name: 'Radar', level: 'listed' },
			{ id: C, name: 'Wayne Strategies', level: 'live' }
		]);
		expect(paths.get(A)).toBe('/@djwayne/9takes');
		expect(paths.get(B)).toBeUndefined();
		expect(paths.get(C)).toBe('/@djwayne/wayne-strategies');
	});

	it('falls back to the id for a repeated slug, an empty one, or a non-ASCII name', () => {
		const paths = projectPaths('dj', [
			{ id: A, name: 'Side Project', level: 'live' },
			{ id: B, name: 'side-project', level: 'live' },
			{ id: C, name: 'Café', level: 'live' }
		]);
		expect(paths.get(A)).toBe('/@dj/side-project');
		expect(paths.get(B)).toBe(`/@dj/${B}`);
		expect(paths.get(C)).toBe(`/@dj/${C}`);
	});
});

describe('normalizeReplyUrl', () => {
	it('turns an email into a mailto: link and a bare domain into https', () => {
		expect(normalizeReplyUrl('dj@example.com')).toBe('mailto:dj@example.com');
		expect(normalizeReplyUrl('mailto:dj@example.com')).toBe('mailto:dj@example.com');
		expect(normalizeReplyUrl('calendly.com/dj')).toBe('https://calendly.com/dj');
		expect(normalizeReplyUrl(' https://9takes.com/beta ')).toBe('https://9takes.com/beta');
	});

	it('refuses other schemes and broken addresses', () => {
		expect(normalizeReplyUrl('javascript:alert(1)')).toBeNull();
		expect(normalizeReplyUrl('mailto:nobody')).toBeNull();
		expect(normalizeReplyUrl('data:text/html,hi')).toBeNull();
		expect(normalizeReplyUrl('')).toBeNull();
		expect(normalizeReplyUrl('not a link')).toBeNull();
	});

	it('reads back without the scheme in the editor', () => {
		expect(replyDisplay('mailto:dj@example.com')).toBe('dj@example.com');
		expect(replyDisplay('https://calendly.com/dj')).toBe('calendly.com/dj');
		expect(replyDisplay(null)).toBe('');
		expect(isEmailReply('mailto:dj@example.com')).toBe(true);
		expect(isEmailReply('https://x.com')).toBe(false);
	});
});
