// apps/mobile/tests/audio-path.test.ts
import { describe, expect, it } from 'vitest';
import { resolveStoredPath, toStoredPath } from '@/lib/audio-path';

const DOCS = 'file:///var/mobile/Containers/Data/Application/AAAA/Documents/';
const DOCS_AFTER_UPDATE = 'file:///var/mobile/Containers/Data/Application/BBBB/Documents/';

describe('recording paths', () => {
	it('stores a recording relative to the documents folder', () => {
		expect(toStoredPath(`${DOCS}ExpoAudio/rec-1.m4a`, DOCS)).toBe('ExpoAudio/rec-1.m4a');
		expect(toStoredPath(`${DOCS}ExpoAudio/rec-1.m4a`, DOCS.slice(0, -1))).toBe(
			'ExpoAudio/rec-1.m4a'
		);
		expect(
			toStoredPath('file:/var/mobile/Containers/Data/Application/AAAA/Documents/a.m4a', DOCS)
		).toBe('a.m4a');
	});

	it('finds the same recording after an app update moves the container', () => {
		const stored = toStoredPath(`${DOCS}ExpoAudio/rec-1.m4a`, DOCS);
		expect(resolveStoredPath(stored, DOCS_AFTER_UPDATE)).toBe(
			`${DOCS_AFTER_UPDATE}ExpoAudio/rec-1.m4a`
		);
	});

	it('leaves URIs outside the documents folder untouched both ways', () => {
		const cache = 'file:///var/mobile/Containers/Data/Application/AAAA/Library/Caches/x.m4a';
		expect(toStoredPath(cache, DOCS)).toBe(cache);
		expect(resolveStoredPath(cache, DOCS_AFTER_UPDATE)).toBe(cache);
	});
});
