<!-- apps/web/src/lib/components/agent/AgentComposer.svelte -->
<!-- INKPRINT Design System: Composer input with inner shadow styling -->
<script lang="ts">
	import {
		AlertTriangle,
		CheckCircle2,
		FileImage,
		ImagePlus,
		Images,
		LoaderCircle,
		Send,
		Square,
		X
	} from 'lucide-svelte';
	import TextareaWithVoice from '$lib/components/ui/TextareaWithVoice.svelte';
	import type TextareaWithVoiceComponent from '$lib/components/ui/TextareaWithVoice.svelte';
	import type { AgentChatImageAttachment } from './agent-chat.types';
	import type { VoiceNote } from '$lib/types/voice-notes';

	interface Props {
		inputValue: string;
		isStreaming: boolean;
		isSendDisabled: boolean;
		allowSendWhileStreaming?: boolean;
		displayContextLabel: string;
		disabled?: boolean;
		/** Optional human-readable reason the composer is disabled (e.g. "Loading session"). */
		disabledReason?: string | null;
		vocabularyTerms?: string;
		voiceInputRef: TextareaWithVoiceComponent | null;
		isVoiceRecording: boolean;
		isVoiceInitializing: boolean;
		isVoiceStopping: boolean;
		isVoiceTranscribing: boolean;
		voiceErrorMessage: string;
		voiceRecordingDuration: number;
		voiceSupportsLiveTranscript: boolean;
		voiceNoteGroupId?: string | null;
		onVoiceNoteSegmentSaved?: (voiceNote: VoiceNote) => void;
		onVoiceNoteSegmentError?: (error: string) => void;
		onKeyDownHandler?: (event: KeyboardEvent) => void;
		onSend?: () => void;
		onStop?: () => void;
		imageAttachments?: AgentChatImageAttachment[];
		attachmentLimit?: number;
		onAttachmentFiles?: (files: File[]) => void;
		onAttachExistingImages?: () => void;
		canAttachExistingImages?: boolean;
		onRemoveAttachment?: (attachmentId: string) => void;
	}

	let {
		inputValue = $bindable(),
		isStreaming,
		isSendDisabled,
		allowSendWhileStreaming = false,
		displayContextLabel,
		disabled = false,
		disabledReason = null,
		vocabularyTerms = '',
		voiceInputRef = $bindable(),
		isVoiceRecording = $bindable(),
		isVoiceInitializing = $bindable(),
		isVoiceStopping = $bindable(),
		isVoiceTranscribing = $bindable(),
		voiceErrorMessage = $bindable(),
		voiceRecordingDuration = $bindable(),
		voiceSupportsLiveTranscript = $bindable(),
		voiceNoteGroupId = $bindable(null),
		onVoiceNoteSegmentSaved,
		onVoiceNoteSegmentError,
		onKeyDownHandler,
		onSend,
		onStop,
		imageAttachments = [],
		attachmentLimit = 4,
		onAttachmentFiles,
		onAttachExistingImages,
		canAttachExistingImages = false,
		onRemoveAttachment
	}: Props = $props();

	let dragDepth = $state(0);
	let fileInput: HTMLInputElement | null = $state(null);
	const isDropActive = $derived(dragDepth > 0 && !disabled && !isStreaming);

	// Generic labels like "general chat" / "project chat" / "open-ended chat" /
	// the unconfigured placeholder don't read naturally with "Ask about ...".
	// Fall through to the catch-all in those cases.
	const GENERIC_CONTEXT_LABELS = new Set([
		'',
		'general chat',
		'project chat',
		'open-ended chat',
		'select a focus to begin'
	]);

	// Context-specific relief prompts. We lead with "brain-dump", not "chat with AI" —
	// the input is a place to offload messy thinking, not another assistant to manage.
	const CONTEXT_PLACEHOLDERS: Record<string, string> = {
		'new project flow':
			"Dump everything you're thinking about — messy is fine. BuildOS turns it into a structured project."
	};

	const placeholder = $derived.by(() => {
		const label = displayContextLabel.trim().toLowerCase();
		if (CONTEXT_PLACEHOLDERS[label]) {
			return CONTEXT_PLACEHOLDERS[label];
		}
		if (!label || GENERIC_CONTEXT_LABELS.has(label)) {
			return 'Brain-dump anything — messy is fine.';
		}
		return `Ask about ${label}...`;
	});

	const initialRows = 1;
	const maxRows = 6;
	const isVoiceBlocked = $derived(isStreaming || disabled);
	const composerHint = $derived.by(() => {
		if (disabled) {
			// Prefer the parent-supplied reason (e.g. "Loading session" /
			// "Preparing session") over a generic "Loading..." placeholder.
			return disabledReason ? `${disabledReason}...` : 'Preparing chat...';
		}
		if (isStreaming) return 'BuildOS is responding...';
		return undefined;
	});

	function handleSubmit(event: Event) {
		event.preventDefault();
		if (disabled || isSendDisabled) return;
		onSend?.();
	}

	function filesFromList(fileList: FileList | null | undefined): File[] {
		return Array.from(fileList ?? []);
	}

	function hasImageDrag(event: DragEvent): boolean {
		const items = Array.from(event.dataTransfer?.items ?? []);
		return items.some((item) => item.kind === 'file' && item.type.startsWith('image/'));
	}

	function handleDragEnter(event: DragEvent) {
		if (disabled || isStreaming || !hasImageDrag(event)) return;
		event.preventDefault();
		dragDepth += 1;
	}

	function handleDragOver(event: DragEvent) {
		if (disabled || isStreaming || !hasImageDrag(event)) return;
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'copy';
		}
	}

	function handleDragLeave(event: DragEvent) {
		if (dragDepth === 0) return;
		event.preventDefault();
		dragDepth = Math.max(0, dragDepth - 1);
	}

	function handleDrop(event: DragEvent) {
		// Always clear the drag overlay, even on the early-return paths below.
		dragDepth = 0;
		if (disabled || isStreaming) return;
		const files = filesFromList(event.dataTransfer?.files);
		if (!files.length) return;
		event.preventDefault();
		onAttachmentFiles?.(files);
	}

	function handlePaste(event: ClipboardEvent) {
		if (disabled || isStreaming) return;
		const files = filesFromList(event.clipboardData?.files);
		if (!files.length) return;
		event.preventDefault();
		onAttachmentFiles?.(files);
	}

	function handleFileInputChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = filesFromList(input.files);
		input.value = '';
		if (!files.length) return;
		onAttachmentFiles?.(files);
	}

	function attachmentStatusIcon(attachment: AgentChatImageAttachment) {
		if (attachment.status === 'error') return AlertTriangle;
		if (attachment.status === 'ready' || attachment.status === 'deduped') return CheckCircle2;
		return LoaderCircle;
	}

	function attachmentStatusClass(attachment: AgentChatImageAttachment): string {
		if (attachment.status === 'error')
			return 'border-destructive/30 bg-destructive/10 text-destructive';
		if (attachment.status === 'ready' || attachment.status === 'deduped') {
			return 'border-success/30 bg-success/10 text-success';
		}
		return 'border-accent/30 bg-accent/10 text-accent';
	}
</script>

<!-- INKPRINT composer: Grid texture marks this surface as editable/writable (§3.4). -->
<form
	class="relative"
	class:rounded-xl={isDropActive}
	class:ring-2={isDropActive}
	class:ring-accent={isDropActive}
	class:ring-offset-2={isDropActive}
	class:ring-offset-background={isDropActive}
	onsubmit={handleSubmit}
	ondragenter={handleDragEnter}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	onpaste={handlePaste}
>
	{#if isDropActive}
		<div
			class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-background/85 shadow-ink backdrop-blur-sm"
		>
			<div
				class="flex items-center gap-3 rounded-full border border-accent/40 bg-card px-4 py-2 text-sm font-semibold text-accent shadow-ink tx tx-grid tx-weak"
			>
				<FileImage class="h-4 w-4" />
				Drop image to attach
			</div>
		</div>
	{/if}

	{#if imageAttachments.length > 0}
		<div
			class="mb-2 overflow-hidden rounded-xl border border-border bg-card/95 shadow-ink tx tx-grid tx-weak"
			aria-label="Attached images"
		>
			<div class="flex items-center justify-between border-b border-border/70 px-3 py-2">
				<div
					class="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"
				>
					<FileImage class="h-3.5 w-3.5" />
					Images {imageAttachments.length}/{attachmentLimit}
				</div>
				<span class="text-[0.68rem] font-medium text-muted-foreground">
					OCR starts after upload
				</span>
			</div>
			<div class="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2">
				{#each imageAttachments as attachment (attachment.id)}
					{@const StatusIcon = attachmentStatusIcon(attachment)}
					<div
						class="group flex min-w-0 gap-2 rounded-lg border border-border bg-background/80 p-2 shadow-sm"
					>
						<img
							src={attachment.previewUrl}
							alt={attachment.fileName}
							class="h-14 w-14 shrink-0 rounded-md border border-border object-cover bg-muted"
							loading="lazy"
							decoding="async"
						/>
						<div class="min-w-0 flex-1">
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0">
									<p class="truncate text-xs font-semibold text-foreground">
										{attachment.fileName}
									</p>
									<p class="mt-0.5 text-[0.68rem] text-muted-foreground">
										{Math.max(1, Math.round(attachment.fileSizeBytes / 1024))} KB
									</p>
								</div>
								<button
									type="button"
									class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-80 transition hover:border-destructive/40 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
									aria-label={`Remove ${attachment.fileName}`}
									onclick={() => onRemoveAttachment?.(attachment.id)}
								>
									<X class="h-3.5 w-3.5" />
								</button>
							</div>
							<div
								class={`mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${attachmentStatusClass(attachment)}`}
							>
								<StatusIcon
									class={`h-3 w-3 ${attachment.status === 'hashing' || attachment.status === 'uploading' || attachment.status === 'processing' ? 'animate-spin' : ''}`}
								/>
								<span class="truncate">{attachment.statusLabel}</span>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<TextareaWithVoice
		bind:this={voiceInputRef}
		bind:value={inputValue}
		bind:isRecording={isVoiceRecording}
		bind:isInitializing={isVoiceInitializing}
		bind:isStopping={isVoiceStopping}
		bind:isTranscribing={isVoiceTranscribing}
		bind:voiceError={voiceErrorMessage}
		bind:recordingDuration={voiceRecordingDuration}
		bind:canUseLiveTranscript={voiceSupportsLiveTranscript}
		bind:voiceNoteGroupId
		voiceNoteSource="agent_chat"
		{onVoiceNoteSegmentSaved}
		{onVoiceNoteSegmentError}
		class="w-full"
		containerClass="rounded-lg border border-border bg-card shadow-ink tx tx-grid tx-weak focus-within:border-accent/70 focus-within:ring-1 focus-within:ring-accent/30 transition-all"
		textareaClass="border-none bg-transparent px-3 py-2 text-base font-medium leading-snug text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 sm:px-4 sm:py-3"
		{placeholder}
		autoResize
		rows={initialRows}
		{maxRows}
		{disabled}
		voiceBlocked={isVoiceBlocked}
		hintText={composerHint}
		voiceButtonLabel="Record voice note"
		listeningLabel="Listening"
		transcribingLabel="Transcribing..."
		preparingLabel="Preparing mic…"
		liveTranscriptLabel="Live"
		showStatusRow={true}
		showLiveTranscriptPreview={true}
		{vocabularyTerms}
		onkeydown={onKeyDownHandler}
	>
		{#snippet actions()}
			<!-- INKPRINT action buttons: inline with status row hints -->
			<input
				bind:this={fileInput}
				type="file"
				accept="image/*"
				multiple
				class="sr-only"
				tabindex="-1"
				onchange={handleFileInputChange}
			/>
			{#if !isStreaming}
				<button
					type="button"
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-ink transition-all duration-100 touch-manipulation pressable hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:w-8 dark:focus-visible:ring-offset-background"
					style="-webkit-tap-highlight-color: transparent;"
					aria-label="Attach image"
					title="Attach image"
					{disabled}
					onclick={() => fileInput?.click()}
				>
					<ImagePlus class="h-4 w-4 sm:h-3.5 sm:w-3.5" />
				</button>
				{#if canAttachExistingImages}
					<button
						type="button"
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-ink transition-all duration-100 touch-manipulation pressable hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:w-8 dark:focus-visible:ring-offset-background"
						style="-webkit-tap-highlight-color: transparent;"
						aria-label="Attach existing project image"
						title="Attach existing project image"
						{disabled}
						onclick={() => onAttachExistingImages?.()}
					>
						<Images class="h-4 w-4 sm:h-3.5 sm:w-3.5" />
					</button>
				{/if}
			{/if}
			{#if isStreaming}
				<!-- Stop button: destructive semantic for urgency -->
				<button
					type="button"
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-destructive bg-destructive text-destructive-foreground shadow-ink transition-all duration-100 touch-manipulation pressable hover:bg-destructive/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 sm:h-8 sm:w-8 dark:focus-visible:ring-offset-background"
					style="-webkit-tap-highlight-color: transparent;"
					aria-label="Stop response"
					onclick={onStop}
				>
					<Square class="h-4 w-4 sm:h-3.5 sm:w-3.5" />
				</button>
				{#if allowSendWhileStreaming}
					<!-- Send while streaming: accent for primary action -->
					<button
						type="submit"
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent bg-accent text-accent-foreground shadow-ink transition-all duration-100 touch-manipulation pressable hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:border-border disabled:bg-muted disabled:text-muted-foreground/50 disabled:cursor-not-allowed disabled:shadow-none sm:h-8 sm:w-8 dark:focus-visible:ring-offset-background"
						style="-webkit-tap-highlight-color: transparent;"
						aria-label="Send & stop"
						title="Send & stop"
						disabled={disabled || isSendDisabled}
					>
						<Send class="h-4 w-4 sm:h-3.5 sm:w-3.5" />
					</button>
				{/if}
			{:else}
				<!-- Send button: accent color for primary action, clear disabled state -->
				<button
					type="submit"
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent bg-accent text-accent-foreground shadow-ink transition-all duration-100 touch-manipulation pressable hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:border-border disabled:bg-muted disabled:text-muted-foreground/50 disabled:cursor-not-allowed disabled:shadow-none sm:h-8 sm:w-8 dark:focus-visible:ring-offset-background"
					style="-webkit-tap-highlight-color: transparent;"
					aria-label="Send message"
					disabled={disabled || isSendDisabled}
				>
					<Send class="h-4 w-4 sm:h-3.5 sm:w-3.5" />
				</button>
			{/if}
		{/snippet}
	</TextareaWithVoice>
</form>
