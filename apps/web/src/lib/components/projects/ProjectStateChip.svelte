<!-- apps/web/src/lib/components/projects/ProjectStateChip.svelte -->
<script lang="ts">
	import { PROJECT_STATE_META, normalizeProjectState } from '$lib/config/project-states';
	import type { ProjectState } from '$lib/types/onto';

	interface Props {
		state: ProjectState | string | null | undefined;
		size?: 'xs' | 'sm';
		tone?: 'semantic' | 'neutral';
		class?: string;
	}

	const { state, size = 'sm', tone = 'semantic', class: className = '' }: Props = $props();

	const normalized = $derived(normalizeProjectState(state));
	const meta = $derived(PROJECT_STATE_META[normalized]);
	const sizeClass = $derived(size === 'xs' ? 'px-1.5 py-0.5 text-2xs' : 'px-2 py-0.5 text-2xs');
	const toneClass = $derived(
		tone === 'neutral'
			? 'border border-border/80 bg-muted/40 font-medium text-muted-foreground'
			: `${meta.chipClass} font-semibold uppercase tracking-wide`
	);
</script>

<span
	class="inline-flex items-center rounded-full {sizeClass} {toneClass} {className}"
	aria-label="Project state: {meta.label}"
>
	{meta.label}
</span>
