<!-- apps/web/src/lib/components/workspace/WorkspaceCapture.svelte -->
<!--
	Capture into the Workspace: type (or speak) and it's saved, no project to pick and no
	model call. Enter saves a note, Shift+Enter is a new line, and Cmd/Ctrl+Enter saves a
	task. On touch screens the Note / Task switch picks the kind and the button saves.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { CircleCheck, FileText, Send } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import TextareaWithVoice from '$lib/components/ui/TextareaWithVoice.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import type { LooseItem } from './workspace-model';

	let {
		source = 'workspace',
		placeholder = 'Jot a note or task…',
		autofocus = false,
		onCaptured
	}: {
		/** Where the capture happened, for the item's props and logs. */
		source?: string;
		placeholder?: string;
		/** Focus the box on arrival (the PWA "Capture" shortcut opens /projects?capture=1). */
		autofocus?: boolean;
		onCaptured: (item: LooseItem) => void;
	} = $props();

	let root = $state<HTMLElement | null>(null);
	onMount(() => {
		if (!autofocus) return;
		void tick().then(() => root?.querySelector<HTMLTextAreaElement>('textarea')?.focus());
	});

	let text = $state('');
	let kind = $state<'note' | 'task'>('note');
	let saving = $state(false);
	let recording = $state(false);
	let transcribing = $state(false);
	const busy = $derived(saving || recording || transcribing);

	async function save(as: 'note' | 'task' = kind) {
		const value = text.trim();
		if (!value || busy) return;
		saving = true;
		try {
			const response = await fetch('/api/workspace/capture', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-Change-Source': 'workspace' },
				body: JSON.stringify({
					kind: as,
					text: value,
					source,
					idempotency_key: crypto.randomUUID()
				})
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok || !payload?.data?.item) {
				throw new Error(
					payload?.error?.message ?? payload?.error ?? 'Could not save that.'
				);
			}
			text = '';
			onCaptured(payload.data.item as LooseItem);
		} catch (cause) {
			toastService.error(
				cause instanceof Error && cause.message ? cause.message : 'Could not save that.'
			);
		} finally {
			saving = false;
		}
	}

	function keydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || event.isComposing || event.shiftKey || event.altKey) return;
		event.preventDefault();
		void save(event.metaKey || event.ctrlKey ? 'task' : kind);
	}
</script>

<section class="capture" aria-label="Capture to your Workspace" bind:this={root}>
	<div class="flex items-end gap-2">
		<div class="min-w-0 flex-1">
			<TextareaWithVoice
				bind:value={text}
				bind:isRecording={recording}
				bind:isTranscribing={transcribing}
				aria-label="Capture a note or task to your Workspace"
				{placeholder}
				rows={1}
				maxRows={8}
				autoResize={true}
				showStatusRow={false}
				voiceNoteSource="workspace_capture"
				onkeydown={keydown}
				textareaClass="border-0 bg-transparent px-1 py-1.5 text-base sm:text-sm shadow-none focus:ring-0 [@media(pointer:fine)]:min-h-8"
			/>
		</div>
		<div class="kinds" role="radiogroup" aria-label="Save as">
			<button
				type="button"
				role="radio"
				aria-checked={kind === 'note'}
				class:on={kind === 'note'}
				onclick={() => (kind = 'note')}
				title="Save as a note"
			>
				<FileText class="h-3.5 w-3.5" /><span class="hidden sm:inline">Note</span>
			</button>
			<button
				type="button"
				role="radio"
				aria-checked={kind === 'task'}
				class:on={kind === 'task'}
				onclick={() => (kind = 'task')}
				title="Save as a task"
			>
				<CircleCheck class="h-3.5 w-3.5" /><span class="hidden sm:inline">Task</span>
			</button>
		</div>
		<Button
			onclick={() => save()}
			loading={saving}
			disabled={!text.trim() || busy}
			variant="ghost"
			size="sm"
			class="shrink-0 px-2 text-accent [@media(pointer:fine)]:min-h-8 [@media(pointer:fine)]:min-w-8 [@media(pointer:fine)]:py-1"
			title="Save to your Workspace"
			aria-label="Save to your Workspace"
		>
			<Send class="h-4 w-4" />
		</Button>
	</div>
	<p class="keys" aria-hidden="true">
		<kbd>Enter</kbd>
		{kind === 'task' ? 'task' : 'note'} · <kbd>⌘ Enter</kbd> task ·
		<kbd>Shift Enter</kbd> new line
	</p>
</section>

<style>
	.capture {
		border: 1px solid hsl(var(--border));
		border-radius: 0.6rem;
		background: hsl(var(--card));
		padding: 0.25rem 0.5rem 0.2rem;
		box-shadow: var(--shadow-ink);
	}
	.capture:focus-within {
		border-color: hsl(var(--accent) / 0.6);
	}
	.kinds {
		display: inline-flex;
		flex: none;
		align-self: center;
		border-radius: 0.45rem;
		background: hsl(var(--muted));
		padding: 2px;
	}
	.kinds button {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		min-height: 2.25rem;
		padding: 0 0.55rem;
		border-radius: 0.35rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
	}
	@media (pointer: fine) {
		.kinds button {
			min-height: 1.75rem;
		}
	}
	.kinds button.on {
		background: hsl(var(--card));
		color: hsl(var(--foreground));
		box-shadow: var(--shadow-ink);
	}
	.kinds button:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 1px;
	}
	.keys {
		display: none;
		padding: 0 0.25rem 0.1rem;
		font-size: 11px;
		color: hsl(var(--muted-foreground));
	}
	.capture:focus-within .keys {
		display: block;
	}
	@media (pointer: coarse) {
		.capture:focus-within .keys {
			display: none;
		}
	}
	kbd {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 10px;
		border: 1px solid hsl(var(--border));
		border-radius: 3px;
		padding: 0 3px;
		background: hsl(var(--background));
	}
</style>
