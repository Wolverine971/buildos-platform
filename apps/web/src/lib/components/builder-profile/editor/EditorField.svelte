<!-- apps/web/src/lib/components/builder-profile/editor/EditorField.svelte -->
<!-- A labelled text input or textarea with a character count, a quiet "Saved", and the
     server's message when a save fails (the typed text stays put). -->
<script lang="ts">
	import { Check } from '$lib/icons/lucide';
	import { inputClass, inputErrorClass } from './editor-styles';

	let {
		id,
		label,
		value = $bindable(''),
		max,
		multiline = false,
		rows = 3,
		placeholder = '',
		hint = '',
		error = null,
		saving = false,
		saved = false,
		type = 'text',
		inputmode,
		onblur
	}: {
		id: string;
		label: string;
		value?: string;
		max?: number;
		multiline?: boolean;
		rows?: number;
		placeholder?: string;
		hint?: string;
		error?: string | null;
		saving?: boolean;
		saved?: boolean;
		type?: 'text' | 'url';
		inputmode?: 'text' | 'url';
		/** Save-on-blur fields pass this; Enter in a one-line field blurs too. */
		onblur?: () => void;
	} = $props();

	const count = $derived(value.length);
	const describedBy = $derived(
		[hint ? `${id}-hint` : null, max ? `${id}-count` : null, error ? `${id}-error` : null]
			.filter(Boolean)
			.join(' ') || undefined
	);

	function blurOnEnter(event: KeyboardEvent) {
		if (event.key === 'Enter' && onblur && !event.isComposing) {
			event.preventDefault();
			(event.currentTarget as HTMLInputElement).blur();
		}
	}
</script>

<div class="space-y-1.5">
	<div class="flex items-baseline justify-between gap-2">
		<label for={id} class="text-sm font-medium text-foreground">{label}</label>
		<span class="flex shrink-0 items-center gap-2 text-xs">
			<span aria-live="polite" class="inline-flex items-center">
				{#if saving}
					<span class="text-muted-foreground">Saving…</span>
				{:else if saved}
					<span class="inline-flex items-center gap-1 text-success"
						><Check class="h-3.5 w-3.5" aria-hidden="true" />Saved</span
					>
				{/if}
			</span>
			{#if max}
				<span
					id="{id}-count"
					class="stamp {count >= max ? 'font-semibold text-foreground' : 'text-muted-foreground'}"
					>{count}/{max}<span class="sr-only"> characters</span></span
				>
			{/if}
		</span>
	</div>
	{#if multiline}
		<textarea
			{id}
			bind:value
			{rows}
			{placeholder}
			maxlength={max}
			aria-describedby={describedBy}
			aria-invalid={error ? true : undefined}
			{onblur}
			class="{inputClass} resize-y leading-relaxed {error ? inputErrorClass : ''}"
		></textarea>
	{:else}
		<input
			{id}
			{type}
			bind:value
			{placeholder}
			{inputmode}
			maxlength={max}
			autocomplete="off"
			spellcheck={type === 'url' ? false : undefined}
			autocapitalize={type === 'url' ? 'off' : undefined}
			aria-describedby={describedBy}
			aria-invalid={error ? true : undefined}
			{onblur}
			onkeydown={blurOnEnter}
			class="{inputClass} {error ? inputErrorClass : ''}"
		/>
	{/if}
	{#if hint}
		<p id="{id}-hint" class="text-xs text-muted-foreground">{hint}</p>
	{/if}
	{#if error}
		<p id="{id}-error" class="text-xs text-destructive" role="alert">{error}</p>
	{/if}
</div>
