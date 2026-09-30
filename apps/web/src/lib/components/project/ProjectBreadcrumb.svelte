<!-- apps/web/src/lib/components/project/ProjectBreadcrumb.svelte -->
<!--
	"Part of Wayne Strategies ›" above a sub-project's title. Renders nothing when
	there is no parent or the viewer can't open it (the server sends null then).
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { ChevronRight } from '$lib/icons/lucide';
	import type { ProjectFamilyParentV1 } from '@buildos/shared-types';

	let { parent }: { parent: ProjectFamilyParentV1 | null } = $props();
</script>

{#if parent}
	<nav aria-label="Project hierarchy" class="min-w-0">
		<!-- The ::after area enlarges the touch target without growing the header. -->
		<a
			href={resolve('/projects/[id]', { id: parent.id })}
			class="group relative inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-sm text-muted-foreground transition-colors after:absolute after:inset-x-0 after:-bottom-1 after:-top-2 after:content-[''] hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
		>
			<span class="micro-label shrink-0">Part of</span>
			<span
				class="min-w-0 truncate text-xs font-semibold text-foreground group-hover:text-accent"
				>{parent.name || 'Untitled project'}</span
			>
			<ChevronRight class="h-3 w-3 shrink-0" aria-hidden="true" />
		</a>
	</nav>
{/if}
