<!-- apps/web/src/lib/components/agent/ProjectFocusIndicator.svelte -->
<!-- INKPRINT Design System: Compact focus indicator badge -->
<script lang="ts">
	import {
		Target,
		ListChecks,
		Calendar,
		FileText,
		Flag,
		TriangleAlert,
		FolderKanban,
		Search
	} from 'lucide-svelte';
	import type { ProjectFocus } from '@buildos/shared-types';

	interface Props {
		focus: ProjectFocus | null;
		onChangeFocus?: () => void;
		onClearFocus?: () => void;
	}

	let { focus, onChangeFocus, onClearFocus }: Props = $props();

	// Lucide icons matching the project page insight panels
	const focusIcons: Partial<Record<ProjectFocus['focusType'], typeof Target>> = {
		'project-wide': FolderKanban,
		task: ListChecks,
		goal: Target,
		plan: Calendar,
		document: FileText,
		milestone: Flag,
		risk: TriangleAlert
	};

	// Get the icon component for the current focus type
	const FocusIcon = $derived(focus ? focusIcons[focus.focusType] || Search : Search);

	const focusLabelMap: Partial<Record<ProjectFocus['focusType'], string>> = {
		'project-wide': 'Project-wide view',
		task: 'Task focus',
		goal: 'Goal focus',
		plan: 'Plan focus',
		document: 'Document focus',
		milestone: 'Milestone focus',
		risk: 'Risk focus'
	};

	const resolvedLabel = $derived(
		focus?.focusType === 'project-wide'
			? focusLabelMap['project-wide']
			: focus?.focusEntityName || ''
	);
</script>

{#if focus}
	<!-- INKPRINT compact inline focus indicator -->
	<span class="inline-flex items-center gap-2 text-xs">
		<!-- Focus type icon -->
		<span class="text-muted-foreground" aria-hidden="true">
			<FocusIcon class="h-3 w-3 sm:h-3.5 sm:w-3.5" />
		</span>

		<!-- INKPRINT focus label button -->
		<button
			type="button"
			onclick={() => onChangeFocus?.()}
			class="inline-flex items-center gap-0.5 rounded-lg px-3 py-2 text-xs font-medium text-accent transition-all hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			title={resolvedLabel}
		>
			<!-- Narrower max-width on mobile for high density -->
			<span class="max-w-[60px] truncate sm:max-w-[140px] md:max-w-[200px]">
				{resolvedLabel}
			</span>
			<Target class="hidden h-3 w-3 sm:inline-block" />
		</button>

		<!-- INKPRINT clear button -->
		{#if onClearFocus && focus.focusType !== 'project-wide'}
			<button
				type="button"
				class="rounded-lg px-3 py-2 text-[0.65rem] font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onclick={() => onClearFocus?.()}
				aria-label="Clear focus"
			>
				×
			</button>
		{/if}
	</span>
{/if}
