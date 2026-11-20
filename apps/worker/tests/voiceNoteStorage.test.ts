// apps/worker/tests/voiceNoteStorage.test.ts
import { describe, expect, it } from 'vitest';
import { isOwnVoiceNoteObject } from '../src/workers/voice-notes/voiceNoteStorage';

const USER = '11111111-1111-4111-8111-111111111111';

describe('isOwnVoiceNoteObject', () => {
	it('accepts the path the upload route writes', () => {
		expect(isOwnVoiceNoteObject(USER, 'voice_notes', `${USER}/note-1.webm`)).toBe(true);
	});

	// The worker downloads with the service role, and fetch resolves `%2e%2e` like `..`: these
	// paths start in the user's folder but the request would reach another API or bucket.
	it.each([
		['a literal traversal', `${USER}/../other-user/note.webm`],
		[
			'an encoded traversal to the database API',
			`${USER}/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/rest/v1/users?select=*`
		],
		['an encoded traversal to another folder', `${USER}/%2E%2E/other-user/note.webm`],
		['a half-encoded traversal', `${USER}/.%2e/other-user/note.webm`],
		['a traversal split by a tab', `${USER}/.\t./other-user/note.webm`],
		['another user folder', '22222222-2222-4222-8222-222222222222/note.webm'],
		['the bare folder', `${USER}/`]
	])('rejects %s', (_label, path) => {
		expect(isOwnVoiceNoteObject(USER, 'voice_notes', path)).toBe(false);
	});

	it('rejects other buckets', () => {
		expect(isOwnVoiceNoteObject(USER, 'onto-assets', `${USER}/note-1.webm`)).toBe(false);
	});
});
