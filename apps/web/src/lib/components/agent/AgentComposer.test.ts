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

describe('Project review composer', () => {
	it('offers an explicit toggle and labels the read-only review send', async () => {
		const onToggleReview = vi.fn();
		const view = render(AgentComposer, {
			props: createProps({ reviewAvailable: true, onToggleReview })
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Review project' }));
		expect(onToggleReview).toHaveBeenCalledOnce();
		await view.rerender({ reviewSelected: true });
		expect(screen.getByRole('button', { name: 'Review project' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		expect(screen.getByText(/Read-only; no project changes/)).toBeInTheDocument();
		expect(
			screen.getAllByRole('button', { name: 'Send project review' }).length
		).toBeGreaterThan(0);
		expect(screen.queryByRole('button', { name: 'Attach image' })).toBeNull();
	});

	it('hides the review choice outside the rollout and blocks incompatible drafts', async () => {
		const view = render(AgentComposer, { props: createProps() });
		expect(screen.queryByRole('button', { name: 'Review project' })).toBeNull();
		await view.rerender({ reviewAvailable: true, reviewDisabled: true });
		expect(screen.getByRole('button', { name: 'Review project' })).toBeDisabled();
	});
});

describe('Document organization composer', () => {
	it('gates the new choice independently from project review', async () => {
		const view = render(AgentComposer, { props: createProps({ reviewAvailable: true }) });
		expect(screen.getByRole('button', { name: 'Review project' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Organize documents' })).toBeNull();
		await view.rerender({ reviewAvailable: false, documentOrganizationAvailable: true });
		expect(screen.queryByRole('button', { name: 'Review project' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Organize documents' })).toHaveAttribute(
			'aria-pressed',
			'false'
		);
	});

	it('offers an editable read-only draft without sending when the specialist is selected', async () => {
		const onToggleDocumentOrganization = vi.fn();
		const onSend = vi.fn();
		const view = render(AgentComposer, {
			props: createProps({
				reviewAvailable: true,
				documentOrganizationAvailable: true,
				inputValue: 'Focus on our meeting notes.',
				onToggleDocumentOrganization,
				onSend
			})
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Organize documents' }));
		expect(onToggleDocumentOrganization).toHaveBeenCalledOnce();
		expect(onSend).not.toHaveBeenCalled();
		await view.rerender({ documentOrganizationSelected: true });
		expect(screen.getByRole('button', { name: 'Organize documents' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		expect(screen.getByRole('button', { name: 'Review project' })).toHaveAttribute(
			'aria-pressed',
			'false'
		);
		const draft = screen.getByPlaceholderText(
			'What should we improve about this project’s documents?'
		);
		expect(draft).toHaveValue('Focus on our meeting notes.');
		expect(draft).not.toBeDisabled();
		await fireEvent.input(draft, {
			target: { value: 'Keep archived decisions easy to find.' }
		});
		expect(draft).toHaveValue('Keep archived decisions easy to find.');
		expect(
			screen.getByText(
				/A specialist suggests a document structure. Read-only; no project changes./
			)
		).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Attach image' })).toBeNull();
		for (const button of screen.getAllByRole('button', {
			name: 'Send document organization review'
		})) {
			expect(button).not.toBeDisabled();
		}
		expect(onSend).not.toHaveBeenCalled();
		await fireEvent.submit(view.container.querySelector('form')!);
		expect(onSend).toHaveBeenCalledOnce();
	});

	it.each(['reviewDisabled', 'disabled', 'isStartingStream', 'isStreaming'])(
		'blocks the specialist choice while %s',
		(blockedState) => {
			const onToggleDocumentOrganization = vi.fn();
			render(AgentComposer, {
				props: createProps({
					documentOrganizationAvailable: true,
					[blockedState]: true,
					onToggleDocumentOrganization
				})
			});
			const choice = screen.getByRole('button', { name: 'Organize documents' });
			expect(choice).toBeDisabled();
			// Native activation respects disabled; fireEvent directly dispatches an event.
			choice.click();
			expect(onToggleDocumentOrganization).not.toHaveBeenCalled();
		}
	);

	it('rejects image input while the read-only document workflow is selected', async () => {
		const onAttachmentFiles = vi.fn();
		const { container } = render(AgentComposer, {
			props: createProps({
				documentOrganizationAvailable: true,
				documentOrganizationSelected: true,
				onAttachmentFiles
			})
		});
		await fireEvent.change(container.querySelector('input[type="file"]')!, {
			target: { files: [new File(['image'], 'notes.png', { type: 'image/png' })] }
		});
		expect(onAttachmentFiles).not.toHaveBeenCalled();
	});
});
