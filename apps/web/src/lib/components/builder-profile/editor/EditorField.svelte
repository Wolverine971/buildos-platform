<!-- apps/web/src/lib/components/builder-profile/editor/EditorField.svelte -->
<!-- A labelled text input or textarea. The character count shows only near the limit;
     saving shows once, in the top bar. A failed save shows the server's message here and
     keeps the typed text. -->
<script lang="ts">
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
		type?: 'text' | 'url';
		inputmode?: 'text' | 'url';
		/** Save-on-blur fields pass this; Enter in a one-line field blurs too. */
		onblur?: () => void;
	} = $props();

	const count = $derived(value.length);
	const showCount = $derived(!!max && count >= max * 0.8);
	const describedBy = $derived(
		[hint ? `${id}-hint` : null, showCount ? `${id}-count` : null, error ? `${id}-error` : null]
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
		{#if showCount && max}
			<span
				id="{id}-count"
				class="stamp text-xs {count >= max
					? 'font-semibold text-foreground'
					: 'text-muted-foreground'}"
				>{count}/{max}<span class="sr-only"> characters</span></span
			>
		{/if}
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
			style:min-height="calc({rows} * 1.45rem + 1.1rem)"
			class="{inputClass} field-sizing-content resize-none leading-relaxed {error
				? inputErrorClass
				: ''}"
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

<style>
	/* Grow with the text where the browser supports it; `rows` is the floor. */
	.field-sizing-content {
		field-sizing: content;
	}
</style>
