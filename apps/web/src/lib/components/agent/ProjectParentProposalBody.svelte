<!-- apps/web/src/lib/components/agent/ProjectParentProposalBody.svelte -->
<!--
	The nest card's body (tasker 122, WP4): what putting a project inside
	another (or taking it out) does, in plain lines. Nothing moves and no one
	gains access; the lines are built from the card's structured fields.
	INKPRINT: Thread texture (relationships) on an inset inside the card frame.
-->
<script lang="ts">
	import type { ProjectParentProposalPayloadV1 } from '@buildos/shared-agent-ops/chat-cards/project-parent-card';
	import { projectParentLines } from './proposal-cards';

	let { payload }: { payload: ProjectParentProposalPayloadV1 } = $props();

	const lines = $derived(projectParentLines(payload));
</script>

<ul
	class="mx-3 mt-2 space-y-1 rounded-md border border-border bg-background/60 px-3 py-2 text-xs leading-snug text-foreground tx tx-thread tx-weak"
	aria-label="What this changes"
	data-testid="project-parent-proposal-body"
>
	{#each lines as line, index (index)}
		<li class="flex gap-1.5 [overflow-wrap:anywhere]">
			<span class="text-muted-foreground" aria-hidden="true">•</span>
			<span class="min-w-0">{line}</span>
		</li>
	{/each}
</ul>
