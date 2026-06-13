<!-- apps/web/src/lib/components/projects/ProjectStateChip.svelte -->
<script lang="ts">
	import { PROJECT_STATE_META, normalizeProjectState } from '$lib/config/project-states';
	import type { ProjectState } from '$lib/types/onto';

	interface Props {
		state: ProjectState | string | null | undefined;
		size?: 'xs' | 'sm';
		class?: string;
	}

	const { state, size = 'sm', class: className = '' }: Props = $props();

	const normalized = $derived(normalizeProjectState(state));
	const meta = $derived(PROJECT_STATE_META[normalized]);
	const sizeClass = $derived(
		size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
	);
</script>

<span
	class="inline-flex items-center rounded-full font-semibold uppercase tracking-wide {sizeClass} {meta.chipClass} {className}"
	aria-label="Project state: {meta.label}"
>
	{meta.label}
</span>
