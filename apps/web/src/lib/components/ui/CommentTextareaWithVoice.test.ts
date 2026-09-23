// apps/web/src/lib/components/ui/CommentTextareaWithVoice.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import CommentTextareaWithVoiceHarness from './CommentTextareaWithVoice.test-harness.svelte';
import { deferred, installResizeObserverStub, voiceFake } from '$lib/voice/test-fakes';

vi.mock('$lib/voice/audio-capture', async (orig) =>
	(await import('$lib/voice/test-fakes')).fakeAudioCaptureModule(await orig())
);
vi.mock('$lib/voice/live-draft', async (orig) =>
	(await import('$lib/voice/test-fakes')).fakeLiveDraftModule(await orig())
);
vi.mock('$lib/voice/transcribe-client', async (orig) =>
	(await import('$lib/voice/test-fakes')).fakeTranscribeModule(await orig())
);

vi.mock('$lib/services/voice-note-groups.service', () => ({
	cleanupVoiceNoteGroups: vi.fn(() => Promise.resolve()),
	createVoiceNoteGroup: vi.fn(() => Promise.resolve())
}));

vi.mock('$lib/services/voice-notes.service', () => ({
	uploadVoiceNote: vi.fn(() => Promise.resolve({ id: 'note-1' })),
	updateVoiceNote: vi.fn(() => Promise.resolve({ id: 'note-1' }))
}));

vi.mock('$lib/utils/haptic', () => ({
	haptic: vi.fn()
}));

beforeAll(() => installResizeObserverStub());

describe('CommentTextareaWithVoice', () => {
	beforeEach(() => {
		voiceFake.reset();
		vi.stubGlobal('requestIdleCallback', vi.fn());
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('keeps the comment binding writable in both directions and forwards input once', async () => {
		render(CommentTextareaWithVoiceHarness);
		const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

		expect(textarea.value).toBe('Initial comment');
		await fireEvent.input(textarea, { target: { value: 'Typed comment' } });
		expect(screen.getByTestId('value')).toHaveTextContent('Typed comment');
		expect(screen.getByTestId('input-count')).toHaveTextContent('1');

		await fireEvent.click(screen.getByRole('button', { name: 'Replace comment' }));
		expect(textarea.value).toBe('Parent replacement');
		expect(screen.getByTestId('input-count')).toHaveTextContent('1');
	});

	it('inserts the server transcript (not the rough live draft) at the caret', async () => {
		voiceFake.transcription = deferred();
		render(CommentTextareaWithVoiceHarness);
		const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

		await fireEvent.focus(textarea);
		textarea.setSelectionRange(8, 8); // "Initial |comment"
		await fireEvent.click(screen.getByRole('button', { name: 'Record voice note' }));
		await waitFor(() => expect(screen.getByTestId('recording')).toHaveTextContent('true'));
		expect(screen.getByTestId('voice-busy')).toHaveTextContent('true');

		voiceFake.liveEvents?.onChange({ finalText: 'rough word', interimText: '' });
		await waitFor(() => expect(textarea.value).toBe('Initial rough word comment'));

		await fireEvent.click(screen.getByRole('button', { name: 'Stop and insert text' }));
		await waitFor(() => expect(screen.getByTestId('transcribing')).toHaveTextContent('true'));
		expect(screen.getByTestId('voice-busy')).toHaveTextContent('true');

		voiceFake.transcription.resolve({ text: 'Refined wording,', model: 'm' });
		await waitFor(() => expect(textarea.value).toBe('Initial Refined wording, comment'));
		expect(screen.getByTestId('value')).toHaveTextContent('Initial Refined wording, comment');
		expect(screen.getByTestId('voice-busy')).toHaveTextContent('false');
	});

	it('shows mic errors in full, readable text', async () => {
		const { VoiceCaptureError } = await import('$lib/voice/audio-capture');
		voiceFake.start = deferred();
		render(CommentTextareaWithVoiceHarness);
		await fireEvent.click(screen.getByRole('button', { name: 'Record voice note' }));
		voiceFake.start.reject(new VoiceCaptureError('device-busy'));
		const alert = await screen.findByRole('alert');
		expect(alert).toHaveTextContent('Your microphone is busy in another app');
		expect(screen.getByTestId('voice-error')).toHaveTextContent('busy in another app');
	});
});
