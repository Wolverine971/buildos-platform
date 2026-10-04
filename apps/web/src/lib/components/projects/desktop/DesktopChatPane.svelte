<!-- apps/web/src/lib/components/projects/desktop/DesktopChatPane.svelte -->
<!--
	Chat beside the reader (a sheet on phones): the full agent chat (suggestions,
	Steps / Tools / Changes) without its modal frame, focused on the open doc, task
	or goal, or on the whole project. Switching scope starts a chat with the new
	focus; earlier chats stay in history.
-->
<script lang="ts">
	import { LoaderCircle, X } from '$lib/icons/lucide';
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import { KIND_WORD, type ChatScope, type ReaderItem } from './reader-model';
	import { shortName } from './desktop-model';

	type ChatComponent = typeof import('$lib/components/agent/AgentChatModal.svelte').default;

	let {
		projectId,
		projectName,
		item,
		itemTitle,
		scope,
		phone,
		onScope,
		onClose,
		onDocumentChanged
	}: {
		projectId: string;
		projectName: string;
		item: ReaderItem | null;
		itemTitle: string;
		scope: ChatScope;
		phone: boolean;
		onScope: (scope: ChatScope) => void;
		onClose: () => void;
		/** The chat edited a doc: the reader reloads it. */
		onDocumentChanged: () => void;
	} = $props();

	let Chat = $state<ChatComponent | null>(null);
	let loadError = $state('');
	$effect(() => {
		if (Chat) return;
		import('$lib/components/agent/AgentChatModal.svelte').then(
			(module) => (Chat = module.default),
			() => (loadError = 'Chat could not load. Check your connection and try again.')
		);
	});

	const aboutItem = $derived(scope === 'item' && item !== null);
	const focus = $derived<ProjectFocus>(
		aboutItem && item
			? {
					focusType: item.kind,
					focusEntityId: item.id,
					focusEntityName: itemTitle || 'Untitled',
					projectId,
					projectName
				}
			: {
					focusType: 'project-wide',
					focusEntityId: null,
					focusEntityName: null,
					projectId,
					projectName
				}
	);
	const focusKey = $derived(`${focus.focusType}:${focus.focusEntityId ?? projectId}`);
</script>

<section class="chat" class:phone aria-label="Chat">
	<header class="head">
		<img src="/brain-bolt.webp" alt="" class="h-6 w-6 shrink-0 rounded object-cover" />
		<div class="scope" role="group" aria-label="Chat about">
			{#if item}
				<button
					type="button"
					class="item"
					aria-pressed={aboutItem}
					title={itemTitle}
					onclick={() => onScope('item')}
				>
					This {KIND_WORD[item.kind]}
				</button>
			{/if}
			<button
				type="button"
				aria-pressed={!aboutItem}
				title={projectName}
				onclick={() => onScope('project')}
			>
				All of {shortName(projectName, 28)}
			</button>
		</div>
		<button type="button" class="ib" onclick={onClose} aria-label="Close chat">
			<X class="h-4 w-4" />
		</button>
	</header>
	<div class="body">
		{#if Chat}
			{#key focusKey}
				<Chat
					isOpen={true}
					embedded={true}
					initialProjectFocus={focus}
					composerPlaceholder="Ask about {aboutItem ? itemTitle : projectName}…"
					onDocumentMutation={onDocumentChanged}
					{onClose}
				/>
			{/key}
		{:else}
			<div class="loading" role={loadError ? 'alert' : undefined}>
				{#if loadError}{loadError}{:else}<LoaderCircle
						class="h-5 w-5 animate-spin motion-reduce:animate-none"
					/>{/if}
			</div>
		{/if}
	</div>
</section>

<style>
	.chat {
		display: flex;
		height: 100%;
		min-height: 0;
		min-width: 0;
		flex-direction: column;
		background: hsl(var(--card));
	}
	.head {
		display: flex;
		flex: none;
		align-items: center;
		gap: 8px;
		min-height: 52px;
		padding: 8px 8px 8px 12px;
		border-bottom: 1px solid hsl(var(--border));
	}
	.scope {
		display: inline-flex;
		min-width: 0;
		flex: 1;
		justify-self: start;
		gap: 2px;
		border-radius: 8px;
		background: hsl(var(--muted));
		padding: 2px;
		max-width: max-content;
	}
	.scope button {
		min-height: 28px;
		min-width: 0;
		overflow: hidden;
		border-radius: 6px;
		padding: 0 9px;
		font-size: 12px;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: hsl(var(--muted-foreground));
	}
	.scope button.item {
		flex: none;
	}
	.phone .scope button {
		min-height: 36px;
	}
	.scope button[aria-pressed='true'] {
		background: hsl(var(--background));
		color: hsl(var(--foreground));
	}
	.ib {
		display: inline-grid;
		margin-left: auto;
		place-items: center;
		width: 34px;
		height: 34px;
		flex: none;
		border-radius: 8px;
		color: hsl(var(--muted-foreground));
	}
	.phone .ib {
		width: 44px;
		height: 44px;
	}
	.ib:hover {
		background: hsl(var(--muted));
		color: hsl(var(--foreground));
	}
	.ib:focus-visible,
	.scope button:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 1px;
	}
	.body {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}
	.loading {
		display: grid;
		height: 100%;
		place-items: center;
		padding: 24px;
		text-align: center;
		font-size: 13px;
		color: hsl(var(--muted-foreground));
	}
</style>
