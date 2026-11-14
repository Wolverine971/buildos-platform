<!-- apps/web/src/lib/components/agent/UserMessageText.svelte -->
<!-- The user's message, with the words each change came from lit up (tasker 155). -->
<script lang="ts">
	import { splitByMarks, type PhraseMark } from './agent-chat-phrase-marks';

	interface Props {
		content: string;
		marks?: readonly PhraseMark[];
	}

	let { content, marks = [] }: Props = $props();

	const pieces = $derived(marks.length ? splitByMarks(content, marks) : null);
	const ACTION_WORDS: Record<PhraseMark['action'], string> = {
		created: 'created',
		updated: 'updated',
		archived: 'archived',
		deleted: 'deleted',
		moved: 'moved',
		linked: 'linked'
	};

	// The tooltip only ever claims what the step's state says.
	function markTitle(mark: PhraseMark): string | undefined {
		if (mark.state === 'landed') return `This ${mark.label} was ${ACTION_WORDS[mark.action]}`;
		if (mark.state === 'held') return 'Waiting for your choice. Nothing was saved yet';
		if (mark.state === 'failed') return "This change didn't go through";
		return undefined;
	}
</script>

{#if pieces}{#each pieces as piece, index (index)}{#if piece.mark}<span
				class="phrase-mark"
				data-quote-mark={piece.mark.id}
				data-action={piece.mark.action}
				data-state={piece.mark.state}
				title={markTitle(piece.mark)}>{piece.text}</span
			>{:else}{piece.text}{/if}{/each}{:else}{content}{/if}

<style>
	.phrase-mark {
		border-radius: 0.2rem;
		padding: 0 0.1rem;
		margin: 0 -0.1rem;
		box-decoration-break: clone;
		-webkit-box-decoration-break: clone;
		transition:
			background-color 300ms ease,
			box-shadow 300ms ease;
		background: hsl(var(--accent) / 0.22);
		box-shadow: inset 0 -1px 0 hsl(var(--accent) / 0.55);
	}

	.phrase-mark[data-action='created'] {
		background: hsl(var(--info) / 0.22);
		box-shadow: inset 0 -1px 0 hsl(var(--info) / 0.55);
	}

	.phrase-mark[data-action='archived'],
	.phrase-mark[data-action='deleted'] {
		background: hsl(var(--muted));
		box-shadow: inset 0 -1px 0 hsl(var(--border-strong, var(--border)));
	}

	.phrase-mark[data-state='live'] {
		animation: phrase-live 1.1s ease-in-out infinite;
	}

	/* Held for the person's choice: outlined, never filled. Nothing was saved. */
	.phrase-mark[data-state='held'] {
		background: transparent;
		box-shadow: none;
		text-decoration: underline dashed hsl(var(--accent) / 0.7);
		text-underline-offset: 0.18em;
	}

	.phrase-mark[data-state='failed'] {
		background: transparent;
		box-shadow: inset 0 -1px 0 hsl(var(--destructive) / 0.5);
	}

	@keyframes phrase-live {
		50% {
			box-shadow: inset 0 -2px 0 hsl(var(--accent) / 0.9);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.phrase-mark[data-state='live'] {
			animation: none;
		}
	}
</style>
