<!-- apps/web/src/lib/components/ui/TextareaWithVoice.test-harness.svelte -->
<script lang="ts">
	import TextareaWithVoice from './TextareaWithVoice.svelte';

	let value = $state('Initial draft');
	let isRecording = $state(false);
	let isInitializing = $state(false);
	let isStopping = $state(false);
	let isTranscribing = $state(false);
	let voiceError = $state('');
	let recordingDuration = $state(0);
	let canUseLiveTranscript = $state(false);
</script>

<TextareaWithVoice
	bind:value
	bind:isRecording
	bind:isInitializing
	bind:isStopping
	bind:isTranscribing
	bind:voiceError
	bind:recordingDuration
	bind:canUseLiveTranscript
	showStatusRow={false}
/>

<button type="button" onclick={() => (value = 'Parent replacement')}>Replace draft</button>

<output data-testid="value">{value}</output>
<output data-testid="recording">{String(isRecording)}</output>
<output data-testid="initializing">{String(isInitializing)}</output>
<output data-testid="stopping">{String(isStopping)}</output>
<output data-testid="transcribing">{String(isTranscribing)}</output>
<output data-testid="voice-error">{voiceError}</output>
<output data-testid="duration">{recordingDuration}</output>
<output data-testid="live-transcript-capability">{String(canUseLiveTranscript)}</output>
