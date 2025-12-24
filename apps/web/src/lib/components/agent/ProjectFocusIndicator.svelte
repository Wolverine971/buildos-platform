<!-- apps/web/src/lib/components/agent/ProjectFocusIndicator.svelte -->
<!-- INKPRINT Design System: Compact focus indicator badge -->
<script lang="ts">
	import {
		Target,
		ListChecks,
		Calendar,
		FileText,
		Layers,
		Flag,
		TriangleAlert,
		Scale,
		Pin,
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
	const focusIcons: Record<ProjectFocus['focusType'], typeof Target> = {
		'project-wide': FolderKanban,
		task: ListChecks,
		goal: Target,
		plan: Calendar,
		document: FileText,
		output: Layers,
		milestone: Flag,
		risk: TriangleAlert,
		decision: Scale,
		requirement: Pin
	};

	// Get the icon component for the current focus type
	const FocusIcon = $derived(focus ? focusIcons[focus.focusType] || Search : Search);

	const focusLabelMap: Record<ProjectFocus['focusType'], string> = {
		'project-wide': 'Project-wide view',
		task: 'Task focus',
		goal: 'Goal focus',
		plan: 'Plan focus',
		document: 'Document focus',
		output: 'Output focus',
		milestone: 'Milestone focus',
		risk: 'Risk focus',
		decision: 'Decision focus',
		requirement: 'Requirement focus'
	};

	const resolvedLabel = $derived(
		focus?.focusType === 'project-wide'
			? focusLabelMap['project-wide']
			: focus?.focusEntityName || ''
	);
</script>

{#if focus}
	<!-- INKPRINT compact inline focus indicator -->
	<span class="inline-flex items-center gap-0.5 text-xs sm:gap-1">
		<!-- Focus type icon -->
		<span class="text-muted-foreground" aria-hidden="true">
			<FocusIcon class="h-3 w-3 sm:h-3.5 sm:w-3.5" />
		</span>

		<!-- INKPRINT focus label button -->
		<button
			type="button"
			onclick={() => onChangeFocus?.()}
			class="inline-flex items-center gap-0.5 rounded-lg px-1 py-0.5 text-xs font-medium text-accent transition-all hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-1.5"
			title={resolvedLabel}
		>
			<!-- Narrower max-width on mobile for high density -->
			<span class="max-w-[60px] truncate sm:max-w-[140px] md:max-w-[200px]">
				{resolvedLabel}
			</span>
			<!-- Hide Target icon on mobile to save space -->
			{#if focus.focusType !== 'project-wide'}
				<Target class="hidden h-3 w-3 sm:inline-block" />
			{/if}
		</button>

		<!-- INKPRINT clear button -->
		{#if onClearFocus && focus.focusType !== 'project-wide'}
			<button
				type="button"
				class="ml-0 rounded-lg px-0.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:ml-0.5 sm:px-1"
				onclick={() => onClearFocus?.()}
				aria-label="Clear focus"
			>
				×
			</button>
		{/if}
	</span>
{/if}
