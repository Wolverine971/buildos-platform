<!-- apps/web/src/lib/components/agent/SharedChatMessage.svelte -->
<script lang="ts">
	import type { SharedChatSnapshotV1 } from '$lib/types/chat-share';
	import { getProseClasses } from '$lib/utils/markdown';
	import { observeAgentMarkdownTables } from './agent-chat-markdown';
	import { renderSharedChatMarkdown } from './shared-chat-markdown';

	let { message }: { message: SharedChatSnapshotV1['messages'][number] } = $props();
	const html = $derived(renderSharedChatMarkdown(message.markdown));
	// The strict share sanitizer (no media, https-only external links) runs before
	// the only raw-HTML insertion below.
	const withheld = $derived(
		[
			{ count: message.withheld?.images ?? 0, label: 'image' },
			{ count: message.withheld?.files ?? 0, label: 'file' },
			{ count: message.withheld?.voice ?? 0, label: 'voice note' }
		].filter((item) => item.count > 0)
	);
</script>

<div class="min-w-0">
	{#if message.markdown}
		<div
			class="shared-chat-markdown {getProseClasses('sm')} min-w-0 max-w-none break-words"
			{@attach observeAgentMarkdownTables}
		>
			{@html html}
		</div>
	{/if}
	{#if message.role === 'assistant' && message.work}
		<p class="mt-3 text-xs text-muted-foreground">
			Worked for {Math.round(message.work.seconds)}s · {message.work.steps}
			{message.work.steps === 1 ? 'step' : 'steps'}
		</p>
	{/if}
	{#if message.made?.length}
		<ul class="mt-3 flex flex-wrap gap-2" aria-label="Work created">
			{#each message.made as item (item)}
				<li
					class="rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground"
				>
					Created {item.kind} ·
					<span class="font-medium text-foreground">{item.label}</span>
				</li>
			{/each}
		</ul>
	{/if}
	{#if withheld.length}
		<ul
			class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"
			aria-label="Attachments not shared"
		>
			{#each withheld as item (item.label)}
				<li>{item.count} {item.label}{item.count === 1 ? '' : 's'} not shared</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.shared-chat-markdown :global(> :first-child) {
		margin-top: 0;
	}
	.shared-chat-markdown :global(> :last-child) {
		margin-bottom: 0;
	}
	.shared-chat-markdown :global(pre) {
		max-width: 100%;
		overflow-x: auto;
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
	}
	.shared-chat-markdown :global(pre code) {
		white-space: pre;
		overflow-wrap: normal;
	}
	.shared-chat-markdown :global(.agent-markdown-table-shell) {
		margin-block: 0.75rem;
	}
	.shared-chat-markdown :global(.agent-markdown-table-scroll) {
		overflow-x: auto;
		overscroll-behavior-inline: contain;
		scrollbar-width: thin;
	}
	.shared-chat-markdown :global(.agent-markdown-table-scroll:focus-visible) {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 2px;
	}
	.shared-chat-markdown :global(.agent-markdown-table-cue) {
		display: none;
	}
	.shared-chat-markdown
		:global(.agent-markdown-table-shell[data-scrollable='true'] > .agent-markdown-table-cue) {
		display: block;
		text-align: right;
		font-size: 0.7rem;
		color: hsl(var(--muted-foreground));
	}
</style>
