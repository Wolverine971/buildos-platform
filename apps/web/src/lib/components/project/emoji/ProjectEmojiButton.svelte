<!-- apps/web/src/lib/components/project/emoji/ProjectEmojiButton.svelte -->
<!--
	The project's emoji beside its title on the project page: the two the Projects tile shows,
	or its initials when it has none. People who can edit tap it to choose their own
	(ProjectEmojiPicker); for everyone else it is decoration.
-->
<script lang="ts">
	import { monogram } from '$lib/components/projects/desktop/desktop-model';
	import ProjectEmojiPicker from './ProjectEmojiPicker.svelte';
	import type { ProjectEmoji } from './project-emoji';

	let {
		projectId,
		projectName,
		emoji,
		canEdit,
		onChange
	}: {
		projectId: string;
		projectName: string;
		emoji: ProjectEmoji | null;
		canEdit: boolean;
		onChange: (emoji: ProjectEmoji) => void;
	} = $props();

	let open = $state(false);
	const glyphs = $derived(emoji?.glyphs ?? []);
</script>

{#snippet face()}
	{#if glyphs.length}
		<span class="emoji-face" class:pair={glyphs.length > 1}>
			{#each glyphs as glyph, index (index)}<span>{glyph}</span>{/each}
		</span>
	{:else}
		<span class="font-mono text-sm font-semibold tracking-tight text-muted-foreground">
			{monogram(projectName)}
		</span>
	{/if}
{/snippet}

{#if canEdit}
	<button
		type="button"
		class="emoji-tile pressable hover:border-foreground/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		aria-label={glyphs.length
			? `Project emoji ${glyphs.join(' ')}. Change emoji`
			: 'Choose a project emoji'}
		title="Change emoji"
		onclick={() => (open = true)}
	>
		{@render face()}
	</button>
	<ProjectEmojiPicker
		isOpen={open}
		{projectId}
		{projectName}
		{emoji}
		onClose={() => (open = false)}
		onSaved={onChange}
	/>
{:else}
	<span class="emoji-tile" aria-hidden="true">{@render face()}</span>
{/if}

<style>
	.emoji-tile {
		display: grid;
		flex: none;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 0.65rem;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--muted) / 0.35);
		box-shadow: var(--shadow-ink);
		transition: border-color 140ms ease;
	}
	.emoji-face {
		display: flex;
		align-items: center;
		gap: 1px;
		font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
		font-size: 1.45rem;
		line-height: 1;
	}
	.emoji-face.pair {
		font-size: 1rem;
	}
	:global(.dark) .emoji-face {
		filter: drop-shadow(0 0 1.5px hsl(0 0% 100% / 0.35));
	}
	@media (min-width: 640px) {
		.emoji-tile {
			width: 3.25rem;
			height: 3.25rem;
		}
		.emoji-face.pair {
			font-size: 1.2rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.emoji-tile {
			transition: none;
		}
	}
</style>
