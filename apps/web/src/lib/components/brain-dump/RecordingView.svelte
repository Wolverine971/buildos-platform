<!-- apps/web/src/lib/components/brain-dump/RecordingView.svelte -->
<script lang="ts">
	import { createEventDispatcher, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { fade, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import {
		ChevronLeft,
		LoaderCircle,
		Check,
		TriangleAlert,
		Send,
		Mic,
		MicOff,
		Info,
		Circle,
		Square
	} from 'lucide-svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { brainDumpAutoAccept } from '$lib/stores/brainDumpPreferences';

	// Required props
	export let projects: any[] = [];
	export let selectedProject: any;
	export let inputText = '';
	export let currentPhase: 'idle' | 'transcribing' | 'parsing' | 'saving' = 'idle';
	export let isProcessing = false;
	export let isSaving = false;
	export let voiceError = '';
	export let microphonePermissionGranted = false;
	export let voiceCapabilitiesChecked = false;
	export let isInitializingRecording = false;
	export let canUseLiveTranscript = false;
	export let hasUnsavedChanges = false;
	export let isVoiceSupported = false;
	export let isCurrentlyRecording = false;
	export let isLiveTranscribing = false;
	export let accumulatedTranscript = '';
	export let recordingDuration = 0;
	export let showOverlay = false;
	export let innerWidth = 0;
	export let allowProjectChange = true;
	export let inModal = false;
	export let displayedQuestions: any[] = [];

	// Computed props
	$: projectOptions = [{ id: 'new', name: 'New Project / Note', isProject: false }, ...projects];
	$: isNewProject = !selectedProject || selectedProject.id === 'new';
	$: selectedProjectName = selectedProject?.name || 'New Project / Note';
	$: canParse =
		inputText.trim().length > 0 && currentPhase === 'idle' && !isProcessing && !isSaving;
	$: selectedProjectId = selectedProject?.id || 'new';

	// Format questions for placeholder
	$: placeholderText = (() => {
		if (isNewProject) {
			return "What's on your mind? Share your thoughts, ideas, and tasks...";
		}

		if (displayedQuestions && displayedQuestions.length > 0) {
			const questionsText = displayedQuestions
				.map((q, i) => `${i + 1}. ${q.question}`)
				.join('\n');
			return `Consider discussing:\n${questionsText}\n\nOr share any updates about ${selectedProjectName}...`;
		}

		return `What's happening with ${selectedProjectName}?`;
	})();

	const dispatch = createEventDispatcher();

	// Auto-save timeout
	let autoSaveTimeout: NodeJS.Timeout;

	// Auto-accept state - properly subscribe to store value
	$: autoAcceptEnabled = $brainDumpAutoAccept;

	onDestroy(() => {
		if (autoSaveTimeout) {
			clearTimeout(autoSaveTimeout);
		}
		if (transitionTimeout) {
			clearTimeout(transitionTimeout);
		}
	});

	function isIOS() {
		if (!browser) return false;
		return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
	}

	function handleProjectChange(event: any) {
		const projectId = event.detail || event.target.value;
		const project = projectOptions.find((p) => p.id === projectId);
		dispatch('selectProject', project);
	}

	function handleTextInput() {
		dispatch('textChange', inputText);

		// Throttle auto-save for very large inputs to prevent performance issues
		if (inputText.length > 10000) {
			// Longer delay for large texts
			debouncedAutoSave(5000);
		} else {
			debouncedAutoSave();
		}
	}

	function handleTextBlur() {
		dispatch('save');
	}

	function debouncedAutoSave(delay = 2000) {
		if (autoSaveTimeout) {
			clearTimeout(autoSaveTimeout);
		}
		autoSaveTimeout = setTimeout(() => {
			try {
				dispatch('save');
			} catch (error) {
				console.error('Auto-save dispatch failed:', error);
			}
		}, delay);
	}

	function handleBack() {
		dispatch('back');
	}

	function handleParse() {
		dispatch('parse', { autoAccept: autoAcceptEnabled });
	}

	function handleVoiceToggle() {
		// Show transition state for immediate feedback
		isTransitioning = true;

		// Clear any existing transition timeout
		if (transitionTimeout) {
			clearTimeout(transitionTimeout);
		}

		if (isCurrentlyRecording) {
			dispatch('stopRecording');
		} else {
			dispatch('startRecording');
		}

		// Reset transition state after a delay
		transitionTimeout = setTimeout(() => {
			isTransitioning = false;
			transitionTimeout = null;
		}, 500);
	}

	// Helper function to format recording duration
	function formatDuration(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	// Voice transition state tracking
	let isTransitioning = false;
	let transitionTimeout: NodeJS.Timeout | null = null;

	// Voice button state logic with enhanced loading states
	$: voiceButtonState = (() => {
		if (isInitializingRecording) {
			return {
				text: 'Initializing...',
				icon: LoaderCircle,
				variant: 'ghost',
				disabled: true,
				isLoading: true
			};
		}

		if (isTransitioning) {
			return {
				text: 'Processing...',
				icon: LoaderCircle,
				variant: 'ghost',
				disabled: true,
				isLoading: true
			};
		}

		if (isCurrentlyRecording) {
			return {
				text: 'Recording...',
				icon: MicOff,
				variant: 'recording',
				disabled: false,
				isLoading: false
			};
		}

		if (currentPhase === 'transcribing') {
			return {
				text: 'Transcribing...',
				icon: LoaderCircle,
				variant: 'ghost',
				disabled: true,
				isLoading: true
			};
		}

		if (!microphonePermissionGranted && voiceCapabilitiesChecked) {
			return {
				text: 'Grant microphone access',
				icon: Mic,
				variant: 'default',
				disabled: false,
				isLoading: false
			};
		}

		if (isProcessing || currentPhase !== 'idle') {
			return {
				text: 'Processing...',
				icon: Mic,
				variant: 'ghost',
				disabled: true,
				isLoading: false
			};
		}

		return {
			text: 'Start voice recording',
			icon: Mic,
			variant: 'default',
			disabled: false,
			isLoading: false
		};
	})();
</script>

<div
	class="flex flex-col bg-gradient-to-br from-white to-gray-50/30 dark:from-gray-900 dark:to-gray-800/30 relative {inModal
		? 'h-[min(70vh,650px)] sm:h-[min(60vh,650px)] min-h-[50vh] max-h-[80vh]'
		: 'h-full'}"
>
	<!-- Header -->
	<header
		class="flex-shrink-0 border-b border-gray-200/50 dark:border-gray-700/50 bg-gradient-to-r from-gray-50/50 to-gray-100/30 dark:from-gray-900/50 dark:to-gray-800/30 backdrop-blur-sm z-[5]"
	>
		<div class="flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-4 max-w-full">
			{#if !inModal}
				<Button
					on:click={handleBack}
					variant="ghost"
					size="sm"
					icon={ChevronLeft}
					class="flex-shrink-0 -ml-1 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
					aria-label="Back to project selection"
				/>
			{/if}

			<div class="flex-1 min-w-0">
				{#if allowProjectChange}
					<Select
						bind:value={selectedProjectId}
						on:change={handleProjectChange}
						size="sm"
						class="w-full font-semibold text-[0.9375rem]"
					>
						{#each projectOptions as project}
							<option value={project.id}>{project.name}</option>
						{/each}
					</Select>
				{:else}
					<div
						class="font-semibold text-gray-900 dark:text-white text-[0.9375rem] py-2 truncate"
					>
						{selectedProjectName}
					</div>
				{/if}
			</div>
		</div>
	</header>

	<!-- Main Content -->
	<main class="flex-1 flex flex-col min-h-0 overflow-y-auto relative">
		<!-- Error Message (positioned absolutely to avoid layout shift) -->
		{#if voiceError}
			<div
				class="absolute top-0 left-0 right-0 z-10 flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm border-b border-red-200 dark:border-red-800 shadow-sm"
				transition:fade={{ duration: 200 }}
			>
				<TriangleAlert class="w-4 h-4 flex-shrink-0" />
				<span>{voiceError}</span>
			</div>
		{/if}

		<!-- Textarea Container -->
		<div class="flex-1 relative flex flex-col min-h-0 p-4 sm:p-5">
			<textarea
				bind:value={inputText}
				on:input={handleTextInput}
				on:blur={handleTextBlur}
				placeholder={placeholderText}
				disabled={isProcessing || isInitializingRecording}
				class="flex-1 w-full p-4 pb-[env(keyboard-inset-height,4rem)] bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/30 dark:border-gray-700/30 rounded-xl outline-none resize-none text-gray-900 dark:text-gray-100 text-base sm:text-[15px] leading-relaxed placeholder:text-gray-500 dark:placeholder:text-gray-500 placeholder:whitespace-pre-line disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/50 shadow-sm hover:shadow-md"
				spellcheck="true"
				autocomplete="off"
			/>

			<!-- Bottom Status Container (positioned at bottom of textarea) -->
			<div
				class="absolute bottom-4 left-7 right-7 flex flex-col gap-2 pointer-events-none z-[2]"
			>
				<!-- Live Transcription Preview -->
				{#if isCurrentlyRecording && accumulatedTranscript && canUseLiveTranscript}
					<div
						class="p-2.5 px-3.5 bg-gradient-to-r from-purple-50/60 to-pink-50/60 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-200/40 dark:border-purple-700/40 rounded-lg backdrop-blur-md max-h-20 overflow-y-auto pointer-events-auto shadow-sm"
						transition:fade={{ duration: 200 }}
					>
						<p
							class="text-sm text-gray-600 dark:text-gray-400 italic m-0 leading-normal break-words"
						>
							{accumulatedTranscript}
						</p>
					</div>
				{/if}

				<!-- Status Row (Save indicator + Character count) -->
				<div class="flex justify-between items-center text-xs px-0.5">
					<!-- Save Status -->
					<div
						class="flex items-center gap-1.5 text-gray-600 dark:text-gray-400 pointer-events-auto"
					>
						{#key `${isSaving}-${hasUnsavedChanges}-${inputText.trim().length > 0}`}
							{#if isSaving}
								<span
									class="flex items-center gap-1.5 px-2 py-1 bg-gray-100/50 dark:bg-gray-800/50 rounded transition-all duration-200"
									in:fade={{ duration: 150 }}
								>
									<LoaderCircle class="w-3 h-3 flex-shrink-0 animate-spin" />
									Saving...
								</span>
							{:else if hasUnsavedChanges && inputText.trim()}
								<span
									class="flex items-center gap-1.5 px-2 py-1 bg-gray-100/50 dark:bg-gray-800/50 rounded transition-all duration-200"
									in:fade={{ duration: 150 }}
								>
									<Circle
										class="w-3 h-3 flex-shrink-0 fill-amber-500 text-amber-500"
									/>
									Unsaved changes
								</span>
							{:else if !hasUnsavedChanges && inputText.trim()}
								<span
									class="flex items-center gap-1.5 px-2 py-1 bg-gray-100/50 dark:bg-gray-800/50 rounded transition-all duration-200"
									in:fade={{ duration: 150 }}
								>
									<Check class="w-3 h-3 flex-shrink-0 text-emerald-500" />
									Saved
								</span>
							{/if}
						{/key}
					</div>

					<!-- Character Count -->
					{#if inputText.length > 0}
						<div
							class="text-gray-500 dark:text-gray-400 px-2 py-1 bg-gray-100/50 dark:bg-gray-800/50 rounded pointer-events-auto"
							transition:fade={{ duration: 150 }}
						>
							{inputText.length} characters
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- iOS Notice (moved to bottom area) -->
		{#if isVoiceSupported && isIOS() && !canUseLiveTranscript && isCurrentlyRecording}
			<div
				class="absolute bottom-2 left-4 right-4 flex items-center gap-2 p-2 px-3 bg-primary-50/90 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-xs rounded-md backdrop-blur-md z-[3]"
				transition:fade={{ duration: 200 }}
			>
				<Info class="w-3.5 h-3.5 flex-shrink-0" />
				<span>Audio will be transcribed when you stop recording</span>
			</div>
		{/if}
	</main>

	<!-- Action Bar -->
	<footer
		class="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 sm:px-5 py-3 sm:py-4 pb-[max(1rem,env(safe-area-inset-bottom))] z-10"
	>
		<div class="flex justify-end max-w-full">
			<div class="flex gap-3 items-center w-full justify-end">
				<!-- Recording Status Badge -->
				{#if isCurrentlyRecording}
					<div
						class="mr-auto self-center"
						transition:scale={{ duration: 300, easing: cubicOut, start: 0.8 }}
					>
						<div
							class="inline-flex items-center gap-2 px-3.5 py-2 bg-red-50/80 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200/60 dark:border-red-700/60 rounded-full text-sm font-medium backdrop-blur-md shadow-sm"
						>
							<span>Recording</span>
							<span class="tabular-nums opacity-90">
								{formatDuration(recordingDuration)}
							</span>
							{#if isLiveTranscribing && canUseLiveTranscript && innerWidth > 500}
								<span
									class="text-emerald-500 dark:text-emerald-400 text-xs font-semibold"
								>
									• Live
								</span>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Auto-accept toggle -->
				{#if !isCurrentlyRecording}
					<label
						class="flex items-center gap-2 cursor-pointer mr-auto px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
					>
						<input
							type="checkbox"
							checked={!!autoAcceptEnabled}
							on:change={() => brainDumpAutoAccept.toggle()}
							disabled={isProcessing || currentPhase !== 'idle'}
							class="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 disabled:opacity-50"
						/>
						<span class="text-sm text-gray-700 dark:text-gray-300 select-none">
							Auto-accept
						</span>
					</label>
				{/if}

				{#if isVoiceSupported}
					<div class="relative flex items-center">
						<button
							on:click={handleVoiceToggle}
							disabled={voiceButtonState.disabled}
							class="ml-auto w-11 h-11 sm:w-12 sm:h-12 p-0 rounded-full flex-shrink-0 transition-all duration-200 relative overflow-visible flex items-center justify-center shadow-sm {voiceButtonState.isLoading
								? 'bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
								: isCurrentlyRecording
									? 'bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 border-red-600 dark:border-red-500 text-white scale-110 animate-recording-pulse shadow-lg'
									: 'bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:scale-105 hover:shadow-md'} disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
							aria-label={voiceButtonState.text ||
								(isCurrentlyRecording ? 'Stop recording' : 'Start recording')}
							title={voiceButtonState.text}
						>
							{#if isCurrentlyRecording && voiceButtonState.icon === MicOff}
								<!-- Show stop square when recording -->
								<Square class="w-4 h-4 fill-current" />
							{:else}
								<svelte:component
									this={voiceButtonState.icon}
									class="w-5 h-5 {voiceButtonState.isLoading
										? 'animate-spin'
										: ''}"
								/>
							{/if}
						</button>

						<!-- Helper text when recording -->
						{#if isCurrentlyRecording}
							<div
								class="absolute -top-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap animate-fade-in"
							>
								<div
									class="bg-gray-900 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded-md"
								>
									<span class="opacity-90">Click to stop</span>
									<div
										class="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1"
									>
										<div
											class="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-700"
										></div>
									</div>
								</div>
							</div>
						{/if}

						<!-- Loading state indicator -->
						{#if voiceButtonState.isLoading && voiceButtonState.text}
							<div
								class="absolute -top-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap animate-fade-in"
							>
								<div
									class="bg-blue-600 dark:bg-blue-500 text-white text-xs px-2 py-1 rounded-md"
								>
									<span class="opacity-90">{voiceButtonState.text}</span>
									<div
										class="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1"
									>
										<div
											class="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-blue-600 dark:border-t-blue-500"
										></div>
									</div>
								</div>
							</div>
						{/if}
					</div>
				{/if}

				<Button
					on:click={handleParse}
					disabled={!canParse}
					loading={currentPhase === 'parsing'}
					variant="primary"
					size="lg"
					icon={currentPhase !== 'parsing' ? Send : undefined}
					iconPosition="right"
					class="min-w-[100px] sm:min-w-[120px] transition-all duration-200 shadow-sm hover:shadow-md active:scale-95"
				>
					{currentPhase === 'parsing'
						? 'Processing'
						: autoAcceptEnabled
							? 'Process & Accept Updates'
							: 'Process'}
				</Button>
			</div>
		</div>
	</footer>
</div>

<style>
	/* Minimal custom styles for animations and special effects */
	@keyframes recording-pulse {
		0% {
			box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4);
		}
		50% {
			box-shadow: 0 0 0 8px rgba(220, 38, 38, 0.15);
		}
		100% {
			box-shadow: 0 0 0 12px rgba(220, 38, 38, 0);
		}
	}

	.animate-recording-pulse {
		animation: recording-pulse 2s infinite;
	}

	@keyframes fade-in {
		0% {
			opacity: 0;
			transform: translateX(-50%) translateY(4px);
		}
		100% {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}

	.animate-fade-in {
		animation: fade-in 0.3s ease-out forwards;
	}

	/* Scrollbar styling for transcription preview */
	.overflow-y-auto {
		scrollbar-width: thin;
		scrollbar-color: theme('colors.gray.300') transparent;
	}

	.overflow-y-auto::-webkit-scrollbar {
		width: 6px;
	}

	.overflow-y-auto::-webkit-scrollbar-track {
		background: transparent;
	}

	.overflow-y-auto::-webkit-scrollbar-thumb {
		background: theme('colors.gray.300');
		border-radius: 3px;
	}

	:global(.dark) .overflow-y-auto {
		scrollbar-color: theme('colors.gray.600') transparent;
	}

	:global(.dark) .overflow-y-auto::-webkit-scrollbar-thumb {
		background: theme('colors.gray.600');
	}

	/* Responsive adjustments */
	@media (max-width: 640px) {
		.animate-recording-pulse {
			animation: recording-pulse 2s infinite;
		}
	}
</style>
