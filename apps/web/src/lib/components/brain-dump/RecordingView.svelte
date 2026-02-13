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

	// Required props - Svelte 5 runes mode
	let {
		projects = [],
		selectedProject,
		inputText = '',
		currentPhase = 'idle',
		isProcessing = false,
		isSaving = false,
		voiceError = '',
		microphonePermissionGranted = false,
		voiceCapabilitiesChecked = false,
		isInitializingRecording = false,
		canUseLiveTranscript = false,
		hasUnsavedChanges = false,
		isVoiceSupported = false,
		isCurrentlyRecording = false,
		isLiveTranscribing = false,
		isRefiningTranscript = false,
		accumulatedTranscript = '',
		recordingDuration = 0,
		showOverlay = false,
		innerWidth = 0,
		allowProjectChange = true,
		inModal = false,
		displayedQuestions = [],
		processingProjectIds = new Set()
	}: {
		projects?: any[];
		selectedProject?: any;
		inputText?: string;
		currentPhase?: 'idle' | 'transcribing' | 'parsing' | 'saving';
		isProcessing?: boolean;
		isSaving?: boolean;
		voiceError?: string;
		microphonePermissionGranted?: boolean;
		voiceCapabilitiesChecked?: boolean;
		isInitializingRecording?: boolean;
		canUseLiveTranscript?: boolean;
		hasUnsavedChanges?: boolean;
		isVoiceSupported?: boolean;
		isCurrentlyRecording?: boolean;
		isLiveTranscribing?: boolean;
		isRefiningTranscript?: boolean;
		accumulatedTranscript?: string;
		recordingDuration?: number;
		showOverlay?: boolean;
		innerWidth?: number;
		allowProjectChange?: boolean;
		inModal?: boolean;
		displayedQuestions?: any[];
		processingProjectIds?: Set<string>;
	} = $props();

	// PHASE 3 OPTIMIZATION: Local textarea state for zero-lag typing
	// The textarea binds to local state for instant updates
	// Changes are synced to parent (and store) with throttling
	let localInputText = $state('');
	let syncTimeout: NodeJS.Timeout;

	// Initialize and sync prop changes to local state (when parent updates)
	$effect(() => {
		// Sync inputText prop to localInputText when it changes
		localInputText = inputText;
	});

	// Computed props - Svelte 5 runes mode
	let projectOptions = $derived([
		{ id: 'new', name: 'New Project / Note', isProject: false },
		...projects
	]);
	let isNewProject = $derived(!selectedProject || selectedProject.id === 'new');
	let selectedProjectName = $derived(selectedProject?.name || 'New Project / Note');
	let canParse = $derived(
		localInputText.trim().length > 0 && currentPhase === 'idle' && !isProcessing && !isSaving
	);
	let selectedProjectId = $derived(selectedProject?.id || 'new');

	// PHASE 2 OPTIMIZATION: Memoize placeholder text computation
	// Only recomputes when actual dependencies change (not on every reactive cycle)
	let placeholderText = $derived.by(() => {
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
	});

	const dispatch = createEventDispatcher();

	// Auto-save timeout
	let autoSaveTimeout: NodeJS.Timeout;

	// Auto-accept state - properly subscribe to store value
	let autoAcceptEnabled = $derived($brainDumpAutoAccept);

	onDestroy(() => {
		// CRITICAL FIX: Flush any pending text changes before unmounting
		// Prevents data loss if component is destroyed while sync is pending
		if (syncTimeout) {
			clearTimeout(syncTimeout);
			try {
				dispatch('textChange', localInputText);
			} catch (e) {
				// Parent might already be destroyed, silently ignore
				console.warn('Could not dispatch pending text change on destroy:', e);
			}
		}

		if (autoSaveTimeout) {
			clearTimeout(autoSaveTimeout);
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

	function isProjectProcessing(projectId: string): boolean {
		const id = projectId === 'new' ? 'new' : projectId;
		return processingProjectIds.has(id);
	}

	function handleTextInput() {
		// PHASE 3 OPTIMIZATION: Throttle dispatch to parent (100ms)
		// localInputText is already updated by bind:value instantly
		clearTimeout(syncTimeout);
		syncTimeout = setTimeout(() => {
			dispatch('textChange', localInputText);
		}, 100);

		// Throttle auto-save for very large inputs to prevent performance issues
		if (localInputText.length > 10000) {
			// Longer delay for large texts
			debouncedAutoSave(5000);
		} else {
			debouncedAutoSave();
		}
	}

	function handleTextBlur() {
		// CRITICAL FIX: Flush any pending text changes before saving
		// If user types and immediately blurs, we need to ensure latest text is synced
		if (syncTimeout) {
			clearTimeout(syncTimeout);
			dispatch('textChange', localInputText);
		}
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
		if (isCurrentlyRecording) {
			dispatch('stopRecording');
		} else {
			dispatch('startRecording');
		}
	}

	// Helper function to format recording duration
	function formatDuration(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	// Voice button state logic with proper priority ordering
	// CRITICAL: Check isCurrentlyRecording FIRST so recording state takes precedence
	let voiceButtonState = $derived.by(() => {
		// Priority 1: Active recording (user can stop)
		if (isCurrentlyRecording) {
			return {
				text: 'Recording...',
				icon: MicOff,
				variant: 'recording',
				disabled: false,
				isLoading: false
			};
		}

		// Priority 2: Initializing recording
		if (isInitializingRecording) {
			return {
				text: 'Initializing...',
				icon: LoaderCircle,
				variant: 'ghost',
				disabled: true,
				isLoading: true
			};
		}

		// Priority 3: Transcribing
		if (currentPhase === 'transcribing') {
			return {
				text: isRefiningTranscript ? 'Refining transcript...' : 'Transcribing...',
				icon: LoaderCircle,
				variant: 'ghost',
				disabled: true,
				isLoading: true
			};
		}

		// Priority 4: Microphone permission needed
		if (!microphonePermissionGranted && voiceCapabilitiesChecked) {
			return {
				text: 'Grant microphone access',
				icon: Mic,
				variant: 'default',
				disabled: false,
				isLoading: false
			};
		}

		// Priority 5: General processing
		if (isProcessing || currentPhase !== 'idle') {
			return {
				text: 'Processing...',
				icon: Mic,
				variant: 'ghost',
				disabled: true,
				isLoading: false
			};
		}

		// Default: Ready to record
		return {
			text: 'Start voice recording',
			icon: Mic,
			variant: 'default',
			disabled: false,
			isLoading: false
		};
	});
</script>

<div
	class="flex flex-col bg-background relative {inModal
		? 'h-[min(70vh,650px)] sm:h-[min(60vh,650px)] min-h-[50vh] max-h-[80vh]'
		: 'h-full'}"
>
	<!-- Header -->
	<header class="flex-shrink-0 border-b border-border bg-muted z-[5]">
		<div class="flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-4 max-w-full">
			{#if !inModal}
				<Button
					onclick={handleBack}
					variant="ghost"
					size="sm"
					icon={ChevronLeft}
					class="flex-shrink-0 -ml-1 hover:bg-muted transition-colors"
					aria-label="Back to project selection"
				/>
			{/if}

			<div class="flex-1 min-w-0">
				{#if allowProjectChange}
					<Select
						bind:value={selectedProjectId}
						onchange={handleProjectChange}
						size="sm"
						class="w-full font-semibold text-[0.9375rem]"
					>
						{#each projectOptions as project}
							<option value={project.id} disabled={isProjectProcessing(project.id)}>
								{project.name}
								{#if isProjectProcessing(project.id)}
									(processing)
								{/if}
							</option>
						{/each}
					</Select>
				{:else}
					<div class="font-semibold text-foreground text-[0.9375rem] py-2 truncate">
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
				class="absolute top-0 left-0 right-0 z-10 flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm border-b border-red-200 dark:border-red-800 shadow-ink"
				transition:fade={{ duration: 200 }}
			>
				<TriangleAlert class="w-4 h-4 flex-shrink-0" />
				<span>{voiceError}</span>
			</div>
		{/if}

		<!-- Textarea Container -->
		<div class="flex-1 relative flex flex-col min-h-0 p-4 sm:p-5">
			<!-- PHASE 3 OPTIMIZATION: Bind to local state for instant, zero-lag updates -->
			<textarea
				bind:value={localInputText}
				oninput={handleTextInput}
				onblur={handleTextBlur}
				placeholder={placeholderText}
				disabled={isProcessing || isInitializingRecording}
				class="input-scratchpad flex-1 w-full p-5 pb-[env(keyboard-inset-height,4rem)] resize-none text-base sm:text-[15px] leading-relaxed placeholder:text-muted-foreground placeholder:whitespace-pre-line disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 bg-background text-foreground border border-border rounded-lg focus:ring-2 focus:ring-ring focus:outline-none shadow-ink-inner tx tx-grain tx-weak"
				spellcheck="true"
				autocomplete="off"
			></textarea>

			<!-- Bottom Status Container (positioned at bottom of textarea) -->
			<div
				class="absolute bottom-4 left-7 right-7 flex flex-col gap-2 pointer-events-none z-[2]"
			>
				<!-- Live Transcription Preview -->
				{#if isCurrentlyRecording && accumulatedTranscript && canUseLiveTranscript}
					<div
						class="p-2.5 px-3.5 bg-accent/10 border border-accent/20 rounded-lg backdrop-blur-md max-h-20 overflow-y-auto pointer-events-auto shadow-ink"
						transition:fade={{ duration: 200 }}
					>
						<p
							class="text-sm text-muted-foreground italic m-0 leading-normal break-words"
						>
							{accumulatedTranscript}
						</p>
					</div>
				{/if}

				<!-- Status Row (Save indicator + Character count) -->
				<div class="flex justify-between items-center text-xs px-0.5">
					<!-- Save Status -->
					<div
						class="flex items-center gap-1.5 text-muted-foreground pointer-events-auto"
					>
						{#key `${isSaving}-${hasUnsavedChanges}-${localInputText.trim().length > 0}`}
							{#if isSaving}
								<span
									class="flex items-center gap-1.5 px-2 py-1 bg-muted rounded transition-all duration-200"
									in:fade={{ duration: 150 }}
								>
									<LoaderCircle class="w-3 h-3 flex-shrink-0 animate-spin" />
									Saving...
								</span>
							{:else if hasUnsavedChanges && localInputText.trim()}
								<span
									class="flex items-center gap-1.5 px-2 py-1 bg-muted rounded transition-all duration-200"
									in:fade={{ duration: 150 }}
								>
									<Circle
										class="w-3 h-3 flex-shrink-0 fill-amber-500 text-amber-500"
									/>
									Unsaved changes
								</span>
							{:else if !hasUnsavedChanges && localInputText.trim()}
								<span
									class="flex items-center gap-1.5 px-2 py-1 bg-muted rounded transition-all duration-200"
									in:fade={{ duration: 150 }}
								>
									<Check class="w-3 h-3 flex-shrink-0 text-emerald-500" />
									Saved
								</span>
							{/if}
						{/key}
					</div>

					<!-- Character Count -->
					{#if localInputText.length > 0}
						<div
							class="text-muted-foreground px-2 py-1 bg-muted rounded pointer-events-auto"
							transition:fade={{ duration: 150 }}
						>
							{localInputText.length} characters
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
		class="flex-shrink-0 border-t border-border bg-card px-4 sm:px-5 py-3 sm:py-4 pb-[max(1rem,env(safe-area-inset-bottom))] z-10"
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
							class="inline-flex items-center gap-2 px-3.5 py-2 bg-red-50/80 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200/60 dark:border-red-700/60 rounded-full text-sm font-medium backdrop-blur-md shadow-ink"
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
						class="flex items-center gap-2 cursor-pointer mr-auto px-2 py-1 rounded-lg hover:bg-muted transition-colors"
					>
						<input
							type="checkbox"
							checked={!!autoAcceptEnabled}
							onchange={() => brainDumpAutoAccept.toggle()}
							disabled={isProcessing || currentPhase !== 'idle'}
							class="w-4 h-4 text-purple-600 border-border rounded focus:ring-purple-500 disabled:opacity-50"
						/>
						<span class="text-sm text-foreground select-none"> Auto-accept </span>
					</label>
				{/if}

				{#if isVoiceSupported}
					<div class="relative flex items-center">
						<button
							onclick={handleVoiceToggle}
							disabled={voiceButtonState.disabled}
							class="ml-auto w-11 h-11 sm:w-12 sm:h-12 p-0 rounded-full flex-shrink-0 transition-all duration-200 relative overflow-visible flex items-center justify-center shadow-ink {voiceButtonState.isLoading
								? 'bg-muted border border-border text-muted-foreground'
								: isCurrentlyRecording
									? 'bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 border-red-600 dark:border-red-500 text-white scale-110 animate-recording-pulse shadow-ink-strong'
									: 'bg-card hover:bg-muted border border-border text-foreground hover:scale-105 hover:shadow-ink'} disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
							aria-label={voiceButtonState.text ||
								(isCurrentlyRecording ? 'Stop recording' : 'Start recording')}
							title={voiceButtonState.text}
						>
							{#if isCurrentlyRecording && voiceButtonState.icon === MicOff}
								<!-- Show stop square when recording -->
								<Square class="w-4 h-4 fill-current" />
							{:else}
								{@const Icon = voiceButtonState.icon}
								<Icon
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
									class="bg-gray-900 text-white text-xs px-2 py-1 rounded-md"
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
					onclick={handleParse}
					disabled={!canParse}
					loading={currentPhase === 'parsing'}
					variant="primary"
					size="lg"
					icon={currentPhase !== 'parsing' ? Send : undefined}
					iconPosition="right"
					class="min-w-[100px] sm:min-w-[120px] transition-all duration-200 shadow-ink hover:shadow-ink-strong active:scale-95"
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
