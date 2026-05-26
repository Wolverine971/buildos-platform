// apps/web/src/lib/components/agent/AgentComposer.test.ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import AgentComposer from './AgentComposer.svelte';

function createProps(overrides: Record<string, unknown> = {}) {
	return {
		inputValue: '',
		isStreaming: false,
		isSendDisabled: false,
		displayContextLabel: 'Project Apollo',
		voiceInputRef: null,
		isVoiceRecording: false,
		isVoiceInitializing: false,
		isVoiceStopping: false,
		isVoiceTranscribing: false,
		voiceErrorMessage: '',
		voiceRecordingDuration: 0,
		voiceSupportsLiveTranscript: false,
		onSend: vi.fn(),
		...overrides
	};
}

describe('AgentComposer', () => {
	it('uses chat copy by default', () => {
		render(AgentComposer, {
			props: createProps()
		});

		const textbox = screen.getByPlaceholderText('Ask about project apollo...');
		expect(textbox).toHaveAttribute('rows', '1');
	});

	it('disables input when requested', () => {
		render(AgentComposer, {
			props: createProps({
				disabled: true
			})
		});

		const textbox = screen.getByPlaceholderText('Ask about project apollo...');
		expect(textbox).toHaveAttribute('rows', '1');
		expect(textbox).toBeDisabled();
		expect(screen.getAllByRole('button', { name: /send message/i })[0]).toBeDisabled();
	});

	it('does not show the project image library action when unavailable', () => {
		render(AgentComposer, {
			props: createProps({
				displayContextLabel: 'General chat',
				canAttachExistingImages: false
			})
		});

		expect(screen.getAllByRole('button', { name: /attach image/i }).length).toBeGreaterThan(0);
		expect(screen.queryByRole('button', { name: /attach existing project image/i })).toBeNull();
	});

	it('passes selected files through so the parent can report skipped unsupported files', async () => {
		const onAttachmentFiles = vi.fn();
		const { container } = render(AgentComposer, {
			props: createProps({
				onAttachmentFiles
			})
		});

		const input = container.querySelector('input[type="file"]');
		expect(input).toBeInstanceOf(HTMLInputElement);
		const image = new File(['image'], 'screenshot.png', { type: 'image/png' });
		const pdf = new File(['pdf'], 'brief.pdf', { type: 'application/pdf' });

		await fireEvent.change(input as HTMLInputElement, {
			target: {
				files: [image, pdf]
			}
		});

		expect(onAttachmentFiles).toHaveBeenCalledWith([image, pdf]);
	});
});
