<!-- apps/web/src/lib/components/ui/CommentTextareaWithVoice.test-harness.svelte -->
<script lang="ts">
	import CommentTextareaWithVoice from './CommentTextareaWithVoice.svelte';

	let value = $state('Initial comment');
	let isRecording = $state(false);
	let isTranscribing = $state(false);
	let voiceError = $state('');
	let recordingDuration = $state(0);
	let inputCount = $state(0);
</script>

<CommentTextareaWithVoice
	bind:value
	bind:isRecording
	bind:isTranscribing
	bind:voiceError
	bind:recordingDuration
	oninput={() => (inputCount += 1)}
/>

<button type="button" onclick={() => (value = 'Parent replacement')}>Replace comment</button>

<output data-testid="value">{value}</output>
<output data-testid="input-count">{inputCount}</output>
<output data-testid="recording">{String(isRecording)}</output>
<output data-testid="transcribing">{String(isTranscribing)}</output>
<output data-testid="voice-error">{voiceError}</output>
<output data-testid="duration">{recordingDuration}</output>
