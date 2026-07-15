<!-- apps/web/src/lib/components/ui/RichMarkdownEditor.state.test-harness.svelte -->
<script lang="ts">
	import RichMarkdownEditor from './RichMarkdownEditor.svelte';

	let value = $state('Initial document');
	let isRecording = $state(false);
	let isTranscribing = $state(false);
	let voiceError = $state('');
	let recordingDuration = $state(0);
</script>

<RichMarkdownEditor
	bind:value
	bind:isRecording
	bind:isTranscribing
	bind:voiceError
	bind:recordingDuration
/>

<output data-testid="recording">{String(isRecording)}</output>
<output data-testid="transcribing">{String(isTranscribing)}</output>
<output data-testid="voice-error">{voiceError}</output>
<output data-testid="duration">{recordingDuration}</output>
