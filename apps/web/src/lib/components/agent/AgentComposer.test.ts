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
	it('uses creation guidance based on context, independent of its display label', () => {
		render(AgentComposer, {
			props: createProps({
				contextType: 'project_create',
				displayContextLabel: 'Create a project'
			})
		});
		expect(
			screen.getByPlaceholderText(/Dump everything you're thinking about/)
		).toBeInTheDocument();
	});

	it('acknowledges send immediately and prevents duplicate submission during admission', async () => {
		const onSend = vi.fn();
		const view = render(AgentComposer, {
			props: createProps({ inputValue: 'My new project', isStartingStream: true, onSend })
		});
		expect(screen.getByRole('status')).toHaveTextContent('Sending your message…');
		for (const button of screen.getAllByRole('button', { name: 'Send message' })) {
			expect(button).toBeDisabled();
		}
		await fireEvent.submit(view.container.querySelector('form')!);
		expect(onSend).not.toHaveBeenCalled();
	});

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

	it('shows the project image library action when available', () => {
		render(AgentComposer, {
			props: createProps({
				displayContextLabel: 'General chat',
				canAttachExistingImages: true
			})
		});

		expect(
			screen.getAllByRole('button', { name: /attach existing project image/i }).length
		).toBeGreaterThan(0);
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
