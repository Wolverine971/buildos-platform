<!-- apps/web/src/lib/components/task-entities/TaskMentionText.svelte -->
<!--
	Plain text (a task title) with its first mention of each person, organization and place as a
	button that opens the entity's card, and phone numbers and emails as links. For markdown
	rendered with {@html}, use the entityMentions attachment instead.
-->
<script lang="ts">
	import { splitMentions } from './entity-mentions';
	import type { TaskEntities } from './task-entities.svelte';

	let { text, entities }: { text: string; entities: TaskEntities } = $props();

	const segments = $derived(splitMentions(text, entities.targets, entities.titleLinks));
</script>

{#each segments as segment, index (index)}{#if segment.kind === 'mention'}<button
			type="button"
			class="entity-mention"
			aria-haspopup="dialog"
			title="About {segment.label}"
			onclick={(event) => entities.openCardFor(segment.id, event.currentTarget)}
			>{segment.text}</button
		>{:else if segment.kind === 'link'}<a class="entity-link" href={segment.href}
			>{segment.text}</a
		>{:else}{segment.text}{/if}{/each}

<style>
	.entity-link {
		color: inherit;
		text-decoration: underline dotted;
		text-underline-offset: 3px;
	}
	.entity-link:hover {
		color: hsl(var(--accent));
	}
</style>
