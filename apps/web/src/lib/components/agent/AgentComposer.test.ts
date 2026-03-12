// apps/web/src/lib/components/agent/AgentComposer.test.ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
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

	it('uses braindump sizing and disables input when requested', () => {
		render(AgentComposer, {
			props: createProps({
				mode: 'braindump',
				disabled: true
			})
		});

		const textbox = screen.getByPlaceholderText('Capture whatever is on your mind...');
		expect(textbox).toHaveAttribute('rows', '8');
		expect(textbox).toBeDisabled();
		expect(screen.getAllByRole('button', { name: /send message/i })[0]).toBeDisabled();
	});
});
