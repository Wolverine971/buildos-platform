<!-- apps/web/src/lib/components/workspace/WorkspaceCapture.svelte -->
<!--
	One capture box for the Workspace and Today. Type or speak, Enter saves (Shift+Enter is
	a new line). The jot lands in the Workspace as a note right away, then BuildOS sorts it
	a second later: it may become tasks or notes, land in a project it clearly belongs to,
	or mark an existing task done. A toast says what happened, with Undo. Nobody picks
	"note" or "task" by hand.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { Send } from '$lib/icons/lucide';
	import TextareaWithVoice from '$lib/components/ui/TextareaWithVoice.svelte';
	import { toastService, TOAST_DURATION } from '$lib/stores/toast.store';
	import type { CaptureSortResult, CaptureUndoResult, LooseItem } from './workspace-model';

	let {
		source = 'workspace',
		placeholder = 'Jot anything: a thought, a task, an update…',
		autofocus = false,
		onCaptured,
		onSorted,
		onUndone
	}: {
		/** Where the capture happened, for the item's props and logs. */
		source?: string;
		placeholder?: string;
		/** Focus the box on arrival (the PWA "Capture" shortcut opens /projects?capture=1). */
		autofocus?: boolean;
		/** The note is saved (sorting starts right after). */
		onCaptured?: (item: LooseItem) => void;
		/** Sorting finished for this note; `result.outcome` says what it became. */
		onSorted?: (documentId: string, result: CaptureSortResult) => void;
		/** The person undid a sort. */
		onUndone?: (result: CaptureUndoResult) => void;
	} = $props();

	let root = $state<HTMLElement | null>(null);
	onMount(() => {
		if (!autofocus) return;
		void tick().then(() => root?.querySelector<HTMLTextAreaElement>('textarea')?.focus());
	});

	let text = $state('');
	let saving = $state(false);
	let sorting = $state(0);
	let recording = $state(false);
	let transcribing = $state(false);
	const voiceBusy = $derived(recording || transcribing);
	const canSend = $derived(Boolean(text.trim()) && !saving && !voiceBusy);

	async function post<T>(url: string, body: unknown): Promise<T> {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Change-Source': 'workspace' },
			body: JSON.stringify(body)
		});
		const payload = await response.json().catch(() => null);
		if (!response.ok) {
			throw new Error(
				(typeof payload?.error === 'string' && payload.error) ||
					payload?.error?.message ||
					'Something went wrong. Please try again.'
			);
		}
		return (payload?.data ?? payload) as T;
	}

	async function save() {
		const value = text.trim();
		if (!value || saving || voiceBusy) return;
		saving = true;
		try {
			const { item } = await post<{ item: LooseItem }>('/api/workspace/capture', {
				kind: 'note',
				text: value,
				source,
				idempotency_key: crypto.randomUUID()
			});
			text = '';
			onCaptured?.(item);
			void sort(item.id);
		} catch (cause) {
			toastService.error(
				cause instanceof Error && cause.message ? cause.message : 'Could not save that.'
			);
		} finally {
			saving = false;
		}
	}

	function summary(lines: string[]): string {
		const shown = lines.slice(0, 3).join(' · ');
		return lines.length > 3 ? `${shown} · +${lines.length - 3} more` : shown;
	}

	async function sort(documentId: string) {
		sorting += 1;
		let result: CaptureSortResult;
		try {
			result = await post<CaptureSortResult>('/api/workspace/capture/sort', {
				document_id: documentId,
				source
			});
		} catch {
			// The note is saved either way; sorting just didn't happen.
			result = { outcome: 'kept', lines: [], added: [], removed_ids: [], receipt: null };
		} finally {
			sorting -= 1;
		}
		onSorted?.(documentId, result);
		if (!result.lines.length) return;
		const receipt = result.receipt;
		const toastId: string = toastService.add({
			type: result.outcome === 'skipped' ? 'info' : 'success',
			message: summary(result.lines),
			duration: TOAST_DURATION.LONG,
			...(receipt
				? {
						action: {
							label: 'Undo',
							onClick: () => {
								toastService.remove(toastId);
								void undo(receipt);
							}
						}
					}
				: {})
		});
	}

	async function undo(receipt: unknown) {
		try {
			const result = await post<CaptureUndoResult & { failed: number }>(
				'/api/workspace/capture/sort/undo',
				{ receipt }
			);
			onUndone?.(result);
			if (result.failed) toastService.error("Some of that couldn't be put back.");
			else toastService.success('Back the way you wrote it.');
		} catch (cause) {
			toastService.error(
				cause instanceof Error && cause.message ? cause.message : 'Could not undo that.'
			);
		}
	}

	function keydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || event.isComposing || event.shiftKey || event.altKey) return;
		event.preventDefault();
		void save();
	}
</script>

<section class="capture" aria-label="Capture to your Workspace" bind:this={root}>
	<TextareaWithVoice
		bind:value={text}
		bind:isRecording={recording}
		bind:isTranscribing={transcribing}
		aria-label="Jot a note, task or update"
		{placeholder}
		rows={2}
		maxRows={10}
		autoResize={true}
		showStatusRow={true}
		hintText={sorting > 0 ? 'Sorting…' : undefined}
		voiceNoteSource="workspace_capture"
		voiceButtonLabel="Record a thought"
		onkeydown={keydown}
		class="w-full"
		containerClass="rounded-lg border border-border bg-card shadow-ink tx tx-grid tx-weak transition-colors focus-within:border-accent/70 focus-within:ring-1 focus-within:ring-accent/30"
		textareaClass="border-none bg-transparent px-3 pt-3 pb-1 text-base leading-snug text-foreground placeholder:text-muted-foreground shadow-none focus:outline-none focus:ring-0 sm:px-4 sm:text-sm"
	>
		{#snippet actions()}
			<button
				type="button"
				class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-accent bg-accent text-accent-foreground shadow-ink touch-manipulation pressable hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground/50 disabled:shadow-none sm:h-8 sm:w-8 dark:focus-visible:ring-offset-background"
				aria-label="Save to your Workspace"
				title="Save (Enter)"
				disabled={!canSend}
				onclick={() => void save()}
			>
				<Send class="h-4 w-4 sm:h-3.5 sm:w-3.5" />
			</button>
		{/snippet}
	</TextareaWithVoice>
</section>

<style>
	/* The box itself shows focus; drop the field's own underline inside it. */
	.capture :global(textarea:focus) {
		box-shadow: none;
	}
</style>
