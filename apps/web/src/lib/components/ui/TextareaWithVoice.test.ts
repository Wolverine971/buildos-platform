// apps/web/src/lib/components/ui/TextareaWithVoice.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import TextareaWithVoice from './TextareaWithVoice.svelte';
import TextareaWithVoiceHarness from './TextareaWithVoice.test-harness.svelte';
import { deferred, installResizeObserverStub, voiceFake as engine } from '$lib/voice/test-fakes';

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

describe('TextareaWithVoice dictation', () => {
	beforeEach(() => {
		engine.reset();
		engine.start = deferred();
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('keeps the draft binding writable in both directions', async () => {
		render(TextareaWithVoiceHarness);
		const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

		expect(textarea.value).toBe('Initial draft');
		await fireEvent.input(textarea, { target: { value: 'Typed draft' } });
		expect(screen.getByTestId('value')).toHaveTextContent('Typed draft');

		await fireEvent.click(screen.getByRole('button', { name: 'Replace draft' }));
		expect(textarea.value).toBe('Parent replacement');
	});

	it('shows the mic even when the status row is hidden', () => {
		render(TextareaWithVoiceHarness);
		expect(screen.getByRole('button', { name: 'Record voice note' })).toBeVisible();
	});

	it('puts spoken words in the field as they arrive, then the final transcript in place', async () => {
		render(TextareaWithVoiceHarness);
		const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

		await fireEvent.click(screen.getByRole('button', { name: 'Record voice note' }));
		expect(screen.getByTestId('initializing')).toHaveTextContent('true');

		engine.start?.resolve();
		await waitFor(() => expect(screen.getByTestId('recording')).toHaveTextContent('true'));
		expect(textarea).toHaveAttribute('readonly');
		expect(screen.getByText('Listening')).toBeInTheDocument();

		engine.liveEvents?.onChange({ finalText: 'hello there', interimText: '' });
		await waitFor(() => expect(textarea.value).toBe('Initial draft hello there'));

		await fireEvent.click(screen.getByRole('button', { name: 'Stop and insert text' }));
		expect(screen.getByTestId('stop-request-count')).toHaveTextContent('1');

		await waitFor(() => expect(textarea.value).toBe('Initial draft Hello there.'));
		expect(screen.getByTestId('value')).toHaveTextContent('Initial draft Hello there.');
		expect(screen.getByTestId('recording')).toHaveTextContent('false');
		expect(screen.getByTestId('transcribing')).toHaveTextContent('false');
		expect(textarea).not.toHaveAttribute('readonly');
	});

	it('shows a blocked-mic error at every width and recovers to idle', async () => {
		const { VoiceCaptureError } = await import('$lib/voice/audio-capture');
		render(TextareaWithVoiceHarness);
		await fireEvent.click(screen.getByRole('button', { name: 'Record voice note' }));
		engine.start?.reject(new VoiceCaptureError('permission-denied'));

		const alert = await screen.findByRole('alert');
		expect(alert).toHaveTextContent('Microphone access is blocked');
		expect(alert.closest('.hidden')).toBeNull();
		expect(screen.getByTestId('voice-error')).toHaveTextContent('Microphone access is blocked');
		expect(screen.getByRole('button', { name: 'Enable microphone' })).toBeEnabled();
	});
});

describe('TextareaWithVoice focus hooks', () => {
	const originalMatchMedia = window.matchMedia;

	function stubPointer(fine: boolean) {
		window.matchMedia = vi.fn().mockImplementation((query: string) => ({
			matches: query === '(pointer: fine)' ? fine : false,
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn()
		})) as typeof window.matchMedia;
	}

	afterEach(() => {
		cleanup();
		window.matchMedia = originalMatchMedia;
		vi.clearAllMocks();
	});

	it('marks the textarea with data-autofocus (not the native attribute) when asked', () => {
		render(TextareaWithVoice, { props: { autofocus: true, enableVoice: false } });
		const textarea = screen.getByRole('textbox');
		expect(textarea).toHaveAttribute('data-autofocus');
		expect(textarea).not.toHaveAttribute('autofocus');
	});

	it('omits data-autofocus by default', () => {
		render(TextareaWithVoice, { props: { enableVoice: false } });
		expect(screen.getByRole('textbox')).not.toHaveAttribute('data-autofocus');
	});

	it('focusIfFinePointer focuses only on fine-pointer devices', () => {
		stubPointer(false);
		const coarse = render(TextareaWithVoice, { props: { enableVoice: false } });
		expect(coarse.component.focusIfFinePointer()).toBe(false);
		expect(screen.getByRole('textbox')).not.toHaveFocus();
		coarse.unmount();

		stubPointer(true);
		const fine = render(TextareaWithVoice, { props: { enableVoice: false } });
		expect(fine.component.focusIfFinePointer()).toBe(true);
		expect(screen.getByRole('textbox')).toHaveFocus();
	});
});
