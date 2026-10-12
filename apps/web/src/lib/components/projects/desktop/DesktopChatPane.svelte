<!-- apps/web/src/lib/components/projects/desktop/DesktopChatPane.svelte -->
<!--
	Chat beside the reader (a sheet on phones): the full agent chat (suggestions,
	Steps / Tools / Changes) without its modal frame, focused on the open doc, task
	or goal, or on the whole project. Switching scope starts a chat with the new
	focus; earlier chats stay in history. An earlier chat picked from the card's
	Chats tab opens here with its messages, ready to continue.
-->
<script lang="ts">
	import { LoaderCircle, Plus, X } from '$lib/icons/lucide';
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import { KIND_WORD, type ChatScope, type ReaderItem, type ResumedChat } from './reader-model';
	import { shortName } from './desktop-model';

	type ChatComponent = typeof import('$lib/components/agent/AgentChatModal.svelte').default;

	let {
		projectId,
		projectName,
		item,
		itemTitle,
		scope,
		session = null,
		phone,
		onScope,
		onNewChat,
		onClose,
		onDocumentChanged
	}: {
		projectId: string;
		projectName: string;
		item: ReaderItem | null;
		itemTitle: string;
		scope: ChatScope;
		/** An earlier chat to continue; null starts one about the scope. */
		session?: ResumedChat | null;
		phone: boolean;
		onScope: (scope: ChatScope) => void;
		/** Leave the earlier chat for a new one about the scope. */
		onNewChat?: () => void;
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
	const focusKey = $derived(
		session ? `session:${session.id}` : `${focus.focusType}:${focus.focusEntityId ?? projectId}`
	);
</script>

<section class="chat" class:phone aria-label="Chat">
	<header class="head">
		<img src="/brain-bolt.webp" alt="" class="h-6 w-6 shrink-0 rounded object-cover" />
		{#if session}
			<p class="earlier" title={session.title}>{session.title}</p>
			<button type="button" class="new" onclick={() => onNewChat?.()}>
				<Plus class="h-3.5 w-3.5" /> New chat
			</button>
		{:else}
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
		{/if}
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
					initialChatSessionId={session?.id ?? null}
					initialProjectFocus={session ? null : focus}
					composerPlaceholder={session
						? 'Pick up where you left off…'
						: `Ask about ${aboutItem ? itemTitle : projectName}…`}
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
	.phone .scope button,
	.phone .new {
		min-height: 36px;
	}
	.earlier {
		min-width: 0;
		flex: 1;
		overflow: hidden;
		font-size: 13px;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: hsl(var(--foreground));
	}
	.new {
		display: inline-flex;
		min-height: 28px;
		flex: none;
		align-items: center;
		gap: 4px;
		border-radius: 8px;
		border: 1px solid hsl(var(--border-strong));
		padding: 0 9px;
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
		color: hsl(var(--foreground));
	}
	.new:hover {
		background: hsl(var(--muted));
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
	.new:focus-visible,
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
