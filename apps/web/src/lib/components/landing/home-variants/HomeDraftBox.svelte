<!-- apps/web/src/lib/components/landing/home-variants/HomeDraftBox.svelte -->
<!--
  Homepage "what are you working on?" box. The visitor's text becomes the first chat message:
  signed in, it opens chat straight away; signed out, it rides through signup
  (`/auth/register?redirect=`) and chat opens with it afterwards. Long pastes wait in this
  browser (see $lib/utils/launch-draft-stash) because the signup redirect can't carry them.
  Nothing is sent until the person presses Send in chat.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ArrowRight } from '$lib/icons/lucide';
	import { buildDraftLaunchPath, MAX_STASHED_DRAFT_CHARS } from '$lib/utils/launch-draft-stash';

	let {
		value = $bindable(''),
		id = 'home-draft',
		label = 'What are you working on?',
		showLabel = false,
		placeholder = "I'm working on… Here's what I have so far. Here's where I'm stuck.",
		submitLabel = 'Build my project',
		rows = 5,
		hint = 'Messy is fine. Nothing is sent until you press Send.',
		onsubmit
	}: {
		value?: string;
		id?: string;
		label?: string;
		showLabel?: boolean;
		placeholder?: string;
		submitLabel?: string;
		rows?: number;
		hint?: string;
		/** Called with the trimmed text right before navigating (analytics hook). */
		onsubmit?: (text: string) => void;
	} = $props();

	let textarea = $state<HTMLTextAreaElement | null>(null);
	let showEmptyNudge = $state(false);
	let submitting = $state(false);

	const isSignedIn = $derived(Boolean(page.data?.user));
	const hintId = $derived(`${id}-hint`);

	async function submit(event?: SubmitEvent) {
		event?.preventDefault();
		const text = value.trim();
		if (!text) {
			showEmptyNudge = true;
			textarea?.focus();
			return;
		}
		submitting = true;
		onsubmit?.(text);
		const launchPath = buildDraftLaunchPath(text);
		const target = isSignedIn
			? launchPath
			: `/auth/register?redirect=${encodeURIComponent(launchPath)}`;
		try {
			await goto(target);
		} finally {
			submitting = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			void submit();
		}
	}

	/** Lets a parent drop example text in and put the cursor at the end. */
	export function focusAtEnd() {
		if (!textarea) return;
		textarea.focus();
		const end = textarea.value.length;
		textarea.setSelectionRange(end, end);
	}
</script>

<form action="/auth/register" method="get" onsubmit={submit} class="w-full">
	<label
		for={id}
		class={showLabel ? 'mb-2 block text-sm font-semibold text-foreground' : 'sr-only'}
		>{label}</label
	>
	<div
		class="relative overflow-hidden rounded-lg border border-border-strong bg-background shadow-ink-inner transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25 motion-reduce:transition-none"
	>
		<textarea
			bind:this={textarea}
			bind:value
			{id}
			{rows}
			{placeholder}
			maxlength={MAX_STASHED_DRAFT_CHARS}
			aria-describedby={hintId}
			oninput={() => (showEmptyNudge = false)}
			onkeydown={handleKeydown}
			class="block w-full resize-none border-0 bg-transparent px-4 pt-4 pb-2 text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:ring-0"
		></textarea>
		<div
			class="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card/60 px-3 py-2.5 sm:px-4"
		>
			<p id={hintId} class="text-xs text-muted-foreground" aria-live="polite">
				{#if showEmptyNudge}
					Write a sentence or two first. Rough notes work.
				{:else}
					{hint}
				{/if}
			</p>
			<button
				type="submit"
				disabled={submitting}
				class="tx-button tx-button-accent inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-5 text-sm font-semibold text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-70"
			>
				{submitLabel}
				<ArrowRight class="h-4 w-4 shrink-0" />
			</button>
		</div>
	</div>
</form>
