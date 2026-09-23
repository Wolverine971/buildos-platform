// apps/web/src/lib/components/ui/RichMarkdownEditor.state.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RichMarkdownEditorStateHarness from './RichMarkdownEditor.state.test-harness.svelte';

function deferred<T = void>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

const captureMock = vi.hoisted(() => ({
	events: null as null | {
		onSegmentCut?: (index: number) => void;
		onSegment: (segment: {
			index: number;
			blob: Blob;
			startMs: number;
			endMs: number;
			speechMs: number;
			hasSpeech: boolean;
		}) => void;
	},
	start: null as null | { promise: Promise<void> },
	elapsedMs: 0
}));

vi.mock('$lib/voice/audio-capture', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/voice/audio-capture')>();
	class FakeCapture {
		constructor(events: NonNullable<typeof captureMock.events>) {
			captureMock.events = events;
		}
		get elapsedMs() {
			return captureMock.elapsedMs;
		}
		start() {
			return captureMock.start?.promise ?? Promise.resolve();
		}
		async stop() {
			const blob = new Blob(['audio'], { type: 'audio/webm' });
			captureMock.events?.onSegmentCut?.(0);
			captureMock.events?.onSegment({
				index: 0,
				blob,
				startMs: 0,
				endMs: 3_000,
				speechMs: 2_000,
				hasSpeech: true
			});
			return { fullAudio: blob, durationMs: 3_000 };
		}
		abort() {}
	}
	return { ...original, AudioCapture: FakeCapture, voiceCaptureSupported: () => true };
});

const services = vi.hoisted(() => ({
	createVoiceNoteGroup: vi.fn(() => Promise.resolve()),
	uploadVoiceNote: vi.fn(() => Promise.resolve({ id: 'note-1' })),
	updateVoiceNote: vi.fn(() => Promise.resolve({ id: 'note-1' }))
}));

vi.mock('$lib/services/voice-note-groups.service', () => ({
	cleanupVoiceNoteGroups: vi.fn(() => Promise.resolve()),
	createVoiceNoteGroup: services.createVoiceNoteGroup
}));

vi.mock('$lib/services/voice-notes.service', () => ({
	uploadVoiceNote: services.uploadVoiceNote,
	updateVoiceNote: services.updateVoiceNote
}));

vi.mock('$lib/utils/haptic', () => ({
	haptic: vi.fn()
}));

describe('RichMarkdownEditor inline dictation', () => {
	let transcription: ReturnType<typeof deferred<Response>>;

	beforeEach(() => {
		captureMock.events = null;
		captureMock.start = deferred();
		captureMock.elapsedMs = 0;
		transcription = deferred<Response>();
		vi.stubGlobal('requestIdleCallback', vi.fn());
		vi.stubGlobal(
			'fetch',
			vi.fn(() => transcription.promise)
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('publishes voice state through the bindings and lands the transcript in the document', async () => {
		render(RichMarkdownEditorStateHarness);

		await fireEvent.click(screen.getByRole('button', { name: 'Dictate at cursor' }));
		(captureMock.start as ReturnType<typeof deferred>).resolve();
		await waitFor(() => {
			expect(screen.getByTestId('recording')).toHaveTextContent('true');
		});

		captureMock.elapsedMs = 12_400;
		await waitFor(() => expect(screen.getByTestId('duration')).toHaveTextContent('12'));

		await fireEvent.click(screen.getByRole('button', { name: 'Stop and insert text' }));
		await waitFor(() => {
			expect(screen.getByTestId('recording')).toHaveTextContent('false');
			expect(screen.getByTestId('transcribing')).toHaveTextContent('true');
		});

		transcription.resolve(
			new Response(JSON.stringify({ success: true, data: { transcript: 'Spoken words.' } }), {
				status: 200
			})
		);
		await waitFor(() => {
			expect(screen.getByTestId('transcribing')).toHaveTextContent('false');
			expect(screen.getByTestId('value')).toHaveTextContent('Spoken words. Initial document');
		});

		// Linked recordings are created "attached" so the 24h draft cleanup keeps them.
		expect(services.createVoiceNoteGroup).toHaveBeenCalledWith(
			expect.objectContaining({
				linkedEntityType: 'document',
				linkedEntityId: 'doc-1',
				status: 'attached'
			})
		);
		await waitFor(() =>
			expect(services.updateVoiceNote).toHaveBeenCalledWith(
				'note-1',
				expect.objectContaining({
					transcript: 'Spoken words.',
					transcriptionStatus: 'complete'
				})
			)
		);
	});

	it('shows a blocked microphone as a readable error', async () => {
		render(RichMarkdownEditorStateHarness);
		const { VoiceCaptureError } = await import('$lib/voice/audio-capture');

		await fireEvent.click(screen.getByRole('button', { name: 'Dictate at cursor' }));
		(captureMock.start as ReturnType<typeof deferred>).reject(
			new VoiceCaptureError('permission-denied')
		);

		await waitFor(() => {
			expect(screen.getByTestId('voice-error')).toHaveTextContent('Microphone access is blocked');
		});
		expect(screen.getByRole('alert')).toHaveTextContent('Microphone access is blocked');
		expect(screen.getByTestId('recording')).toHaveTextContent('false');
	});
});
