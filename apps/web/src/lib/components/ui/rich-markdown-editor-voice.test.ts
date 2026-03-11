// apps/web/src/lib/components/ui/rich-markdown-editor-voice.test.ts
import { describe, expect, it } from 'vitest';
import {
	canReplaceInsertedVoiceRange,
	normalizeVoiceTranscript,
	preserveInsertedVoiceSpacing
} from './rich-markdown-editor-voice';

describe('rich-markdown-editor voice helpers', () => {
	it('normalizes transcript whitespace before reconciliation', () => {
		expect(normalizeVoiceTranscript('  hello   world  ')).toBe('hello world');
	});

	it('preserves insertion boundary spacing when replacing live transcript text', () => {
		expect(preserveInsertedVoiceSpacing(' hello ', 'better transcript')).toBe(
			' better transcript '
		);
		expect(preserveInsertedVoiceSpacing('hello ', 'better transcript')).toBe(
			'better transcript '
		);
		expect(preserveInsertedVoiceSpacing(' hello', 'better transcript')).toBe(
			' better transcript'
		);
	});

	it('only replaces the inserted range when the current editor content still matches it', () => {
		expect(
			canReplaceInsertedVoiceRange('Before hello after', {
				from: 6,
				to: 13,
				text: ' hello '
			})
		).toBe(true);

		expect(
			canReplaceInsertedVoiceRange('Before hullo after', {
				from: 6,
				to: 13,
				text: ' hello '
			})
		).toBe(false);
	});
});
