<!-- src/lib/components/phases/PhaseInstructionsInput.svelte -->
<script lang="ts">
	import { createEventDispatcher, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { fade, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import {
		Loader2,
		Check,
		AlertTriangle,
		Info,
		Mic,
		MicOff,
		Circle,
		Square,
		MessageSquare
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';

	// Props
	export let instructions = '';
	export let placeholder =
		'Provide guidance for how the phases should be scheduled and organized (optional)...';
	export let maxLength = 2000;
	export let disabled = false;

	const dispatch = createEventDispatcher();

	// Voice recording state
	let isCurrentlyRecording = false;
	let isInitializingRecording = false;
	let isTranscribing = false;
	let voiceError = '';
	let recordingDuration = 0;
	let microphonePermissionGranted = false;
	let voiceCapabilitiesChecked = false;
	let accumulatedTranscript = '';

	// Audio recording
	let mediaRecorder: MediaRecorder | null = null;
	let audioChunks: Blob[] = [];
	let recordingStartTime: number | null = null;
	let recordingInterval: NodeJS.Timeout | null = null;

	// Check browser support
	$: isVoiceSupported = browser && 'MediaRecorder' in window && navigator.mediaDevices;

	onDestroy(() => {
		stopRecording();
		if (recordingInterval) {
			clearInterval(recordingInterval);
		}
	});

	function isIOS() {
		if (!browser) return false;
		return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
	}

	function handleTextInput() {
		dispatch('change', instructions);
	}

	async function handleVoiceToggle() {
		if (isCurrentlyRecording) {
			stopRecording();
		} else {
			await startRecording();
		}
	}

	async function startRecording() {
		if (!isVoiceSupported || isInitializingRecording) return;

		isInitializingRecording = true;
		voiceError = '';

		try {
			// Request microphone permission
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

			// Create MediaRecorder with appropriate options
			const options = { mimeType: 'audio/webm' };
			if (!MediaRecorder.isTypeSupported(options.mimeType)) {
				// Fallback to any supported format
				mediaRecorder = new MediaRecorder(stream);
			} else {
				mediaRecorder = new MediaRecorder(stream, options);
			}

			audioChunks = [];
			accumulatedTranscript = '';

			mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					audioChunks.push(event.data);
				}
			};

			mediaRecorder.onstop = async () => {
				const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
				await transcribeAudio(audioBlob);

				// Clean up stream
				stream.getTracks().forEach((track) => track.stop());
			};

			mediaRecorder.start();
			isCurrentlyRecording = true;
			microphonePermissionGranted = true;
			voiceCapabilitiesChecked = true;
			recordingStartTime = Date.now();
			recordingDuration = 0;

			// Update recording duration every second
			recordingInterval = setInterval(() => {
				if (recordingStartTime) {
					recordingDuration = Math.floor((Date.now() - recordingStartTime) / 1000);
				}
			}, 1000);
		} catch (error) {
			console.error('Error starting recording:', error);
			voiceError = 'Failed to access microphone. Please check permissions.';
			microphonePermissionGranted = false;
			voiceCapabilitiesChecked = true;
		} finally {
			isInitializingRecording = false;
		}
	}

	function stopRecording() {
		if (mediaRecorder && isCurrentlyRecording) {
			mediaRecorder.stop();
			isCurrentlyRecording = false;

			if (recordingInterval) {
				clearInterval(recordingInterval);
				recordingInterval = null;
			}
		}
	}

	async function transcribeAudio(audioBlob: Blob) {
		isTranscribing = true;
		voiceError = '';

		try {
			const formData = new FormData();
			formData.append('audio', audioBlob, 'recording.webm');

			const response = await fetch('/api/transcribe', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				throw new Error('Transcription failed');
			}

			const result = await response.json();

			if (result.success && result.data?.transcript) {
				// Append transcribed text to existing instructions
				instructions = instructions
					? `${instructions}\n\n${result.data.transcript}`
					: result.data.transcript;
				dispatch('change', instructions);
			} else {
				throw new Error(result.error || 'No transcript received');
			}
		} catch (error) {
			console.error('Transcription error:', error);
			voiceError = 'Failed to transcribe audio. Please try again.';
		} finally {
			isTranscribing = false;
		}
	}

	function formatDuration(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	// Voice button state logic
	$: voiceButtonState = (() => {
		if (isInitializingRecording) {
			return {
				icon: Loader2,
				variant: 'ghost',
				disabled: true,
				tooltip: 'Initializing...'
			};
		}

		if (isCurrentlyRecording) {
			return {
				icon: MicOff,
				variant: 'recording',
				disabled: false,
				tooltip: 'Click to stop recording'
			};
		}

		if (isTranscribing) {
			return {
				icon: Loader2,
				variant: 'ghost',
				disabled: true,
				tooltip: 'Transcribing...'
			};
		}

		if (!microphonePermissionGranted && voiceCapabilitiesChecked) {
			return {
				icon: Mic,
				variant: 'default',
				disabled: false,
				tooltip: 'Click to enable microphone'
			};
		}

		return {
			icon: Mic,
			variant: 'default',
			disabled: disabled,
			tooltip: 'Click to record instructions'
		};
	})();
</script>

<div class="w-full">
	<!-- Header -->
	<div class="flex items-center justify-between mb-2">
		<label class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
			<MessageSquare class="w-4 h-4" />
			Phase Scheduling Instructions
			<span class="text-xs text-gray-500 dark:text-gray-400">(optional)</span>
		</label>

		{#if instructions.length > 0}
			<span class="text-xs text-gray-500 dark:text-gray-400">
				{instructions.length} / {maxLength}
			</span>
		{/if}
	</div>

	<!-- Textarea Container -->
	<div class="relative">
		<textarea
			bind:value={instructions}
			on:input={handleTextInput}
			{placeholder}
			{disabled}
			maxlength={maxLength}
			class="w-full min-h-[100px] p-3 pr-14 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg outline-none resize-y text-gray-900 dark:text-gray-100 text-sm leading-relaxed placeholder:text-gray-500 dark:placeholder:text-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500/50"
			spellcheck="true"
		/>

		<!-- Voice Button (positioned in top-right of textarea) -->
		{#if isVoiceSupported}
			<div class="absolute top-2 right-2">
				<button
					on:click={handleVoiceToggle}
					disabled={voiceButtonState.disabled}
					class="w-9 h-9 p-0 rounded-full flex items-center justify-center transition-all duration-200 {isCurrentlyRecording
						? 'bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 text-white scale-110 animate-recording-pulse shadow-lg'
						: 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 hover:scale-105'} disabled:opacity-50 disabled:cursor-not-allowed"
					aria-label={voiceButtonState.tooltip}
					title={voiceButtonState.tooltip}
				>
					{#if isCurrentlyRecording && voiceButtonState.icon === MicOff}
						<Square class="w-3.5 h-3.5 fill-current" />
					{:else}
						<svelte:component
							this={voiceButtonState.icon}
							class="w-4 h-4 {voiceButtonState.icon === Loader2
								? 'animate-spin'
								: ''}"
						/>
					{/if}
				</button>
			</div>
		{/if}
	</div>

	<!-- Status Messages -->
	{#if isCurrentlyRecording}
		<div
			class="mt-2 flex items-center gap-2 text-sm text-red-600 dark:text-red-400"
			transition:fade
		>
			<Circle class="w-3 h-3 fill-current animate-pulse" />
			<span>Recording... {formatDuration(recordingDuration)}</span>
			{#if isIOS() && !accumulatedTranscript}
				<span class="text-xs text-gray-500 dark:text-gray-400">
					• Will transcribe when stopped
				</span>
			{/if}
		</div>
	{/if}

	{#if isTranscribing}
		<div
			class="mt-2 flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400"
			transition:fade
		>
			<Loader2 class="w-3 h-3 animate-spin" />
			<span>Transcribing audio...</span>
		</div>
	{/if}

	{#if voiceError}
		<div
			class="mt-2 flex items-center gap-2 text-sm text-red-600 dark:text-red-400"
			transition:fade
		>
			<AlertTriangle class="w-3 h-3" />
			<span>{voiceError}</span>
		</div>
	{/if}

	<!-- Help Text -->
	<div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
		<p>Provide guidance for how phases should be organized, such as:</p>
		<ul class="list-disc list-inside mt-1 space-y-0.5">
			<li>Preferred phase duration or number of phases</li>
			<li>Task prioritization or sequencing preferences</li>
			<li>Dependencies or milestones to consider</li>
			<li>Time constraints or deadline requirements</li>
		</ul>
	</div>
</div>

<style>
	@keyframes recording-pulse {
		0% {
			box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4);
		}
		50% {
			box-shadow: 0 0 0 6px rgba(220, 38, 38, 0.15);
		}
		100% {
			box-shadow: 0 0 0 8px rgba(220, 38, 38, 0);
		}
	}

	.animate-recording-pulse {
		animation: recording-pulse 2s infinite;
	}

	textarea {
		scrollbar-width: thin;
		scrollbar-color: theme('colors.gray.300') transparent;
	}

	textarea::-webkit-scrollbar {
		width: 6px;
	}

	textarea::-webkit-scrollbar-track {
		background: transparent;
	}

	textarea::-webkit-scrollbar-thumb {
		background: theme('colors.gray.300');
		border-radius: 3px;
	}

	:global(.dark) textarea {
		scrollbar-color: theme('colors.gray.600') transparent;
	}

	:global(.dark) textarea::-webkit-scrollbar-thumb {
		background: theme('colors.gray.600');
	}
</style>
