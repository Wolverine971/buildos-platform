<!-- apps/web/src/lib/components/landing/home-variants/c/TaskStateIcon.svelte -->
<!-- Small state glyph for example task rows on the version C stage. -->
<script lang="ts">
	import { Circle, CircleCheck, CircleDot, CircleSlash } from '$lib/icons/lucide';
	import type { ExampleTaskState } from '../fading-crown';

	let { state }: { state: ExampleTaskState } = $props();
</script>

{#if state === 'done'}
	<CircleCheck class="h-4 w-4 shrink-0 text-success" aria-label="Done" />
{:else if state === 'in_progress'}
	<CircleDot class="h-4 w-4 shrink-0 text-info" aria-label="In progress" />
{:else if state === 'blocked'}
	<CircleSlash class="h-4 w-4 shrink-0 text-destructive" aria-label="Blocked" />
{:else}
	<Circle class="h-4 w-4 shrink-0 text-muted-foreground" aria-label="To do" />
{/if}
