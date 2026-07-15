// apps/web/src/lib/components/ui/CommentTextareaWithVoice.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CommentTextareaWithVoiceHarness from './CommentTextareaWithVoice.test-harness.svelte';

type VoiceCallbacks = {
	onError: (message: string) => void;
	onPhaseChange: (phase: 'idle' | 'transcribing') => void;
	onCapabilityUpdate?: (update: { canUseLiveTranscript: boolean }) => void;
};

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

const voiceMock = vi.hoisted(() => ({
	callbacks: null as VoiceCallbacks | null,
	durationSubscriber: null as ((duration: number) => void) | null,
	start: null as ReturnType<typeof deferred> | null,
	stop: null as ReturnType<typeof deferred> | null
}));

vi.mock('$lib/services/voiceRecording.service', () => ({
	voiceRecordingService: {
		cleanup: vi.fn(),
		getRecordingDuration: vi.fn(() => ({
			subscribe(callback: (duration: number) => void) {
				voiceMock.durationSubscriber = callback;
				callback(0);
				return () => {
					voiceMock.durationSubscriber = null;
				};
			}
		})),
		initialize: vi.fn((callbacks: VoiceCallbacks) => {
			voiceMock.callbacks = callbacks;
			callbacks.onCapabilityUpdate?.({ canUseLiveTranscript: true });
		}),
		isLiveTranscriptSupported: vi.fn(() => true),
		isVoiceSupported: vi.fn(() => true),
		setVocabularyTerms: vi.fn(),
		startRecording: vi.fn(() => voiceMock.start?.promise ?? Promise.resolve()),
		stopRecording: vi.fn(() => voiceMock.stop?.promise ?? Promise.resolve())
	}
}));

vi.mock('$lib/services/voice-note-groups.service', () => ({
	cleanupVoiceNoteGroups: vi.fn(() => Promise.resolve()),
	createVoiceNoteGroup: vi.fn(() => Promise.resolve())
}));

vi.mock('$lib/services/voice-notes.service', () => ({
	uploadVoiceNote: vi.fn(() => Promise.resolve()),
	updateVoiceNote: vi.fn(() => Promise.resolve())
}));

vi.mock('$lib/utils/voice', () => ({
	liveTranscript: {
		subscribe(callback: (value: string) => void) {
			callback('');
			return () => {};
		}
	}
}));

vi.mock('$lib/utils/haptic', () => ({
	haptic: vi.fn()
}));

describe('CommentTextareaWithVoice state ownership', () => {
	beforeEach(() => {
		voiceMock.callbacks = null;
		voiceMock.durationSubscriber = null;
		voiceMock.start = deferred();
		voiceMock.stop = deferred();
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

	it('publishes voice state directly through the bindable state boundary', async () => {
		render(CommentTextareaWithVoiceHarness);

		await fireEvent.click(screen.getByRole('button', { name: 'Record voice note' }));
		voiceMock.start?.resolve();
		await waitFor(() => {
			expect(screen.getByTestId('recording')).toHaveTextContent('true');
		});

		voiceMock.durationSubscriber?.(12);
		voiceMock.callbacks?.onPhaseChange('transcribing');
		await tick();
		expect(screen.getByTestId('duration')).toHaveTextContent('12');
		expect(screen.getByTestId('transcribing')).toHaveTextContent('true');

		await fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
		expect(screen.getByTestId('recording')).toHaveTextContent('false');

		voiceMock.stop?.resolve();
		voiceMock.callbacks?.onError('Microphone denied');
		await tick();
		expect(screen.getByTestId('voice-error')).toHaveTextContent('Microphone denied');
	});
});
