<!-- apps/web/src/lib/components/agent/ProjectFocusIndicator.svelte -->
<!-- INKPRINT Design System: Compact focus indicator badge -->
<script lang="ts">
	import { Target } from 'lucide-svelte';
	import type { ProjectFocus } from '@buildos/shared-types';

	interface Props {
		focus: ProjectFocus | null;
		onChangeFocus?: () => void;
		onClearFocus?: () => void;
	}

	let { focus, onChangeFocus, onClearFocus }: Props = $props();

	const focusIcons: Record<ProjectFocus['focusType'], string> = {
		'project-wide': '📘',
		task: '📝',
		goal: '🎯',
		plan: '📋',
		document: '📄',
		output: '📦',
		milestone: '🏁'
	};

	const focusLabelMap: Record<ProjectFocus['focusType'], string> = {
		'project-wide': 'Project-wide view',
		task: 'Task focus',
		goal: 'Goal focus',
		plan: 'Plan focus',
		document: 'Document focus',
		output: 'Output focus',
		milestone: 'Milestone focus'
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
		<!-- Focus type emoji -->
		<span class="text-[11px] sm:text-xs" aria-hidden="true">
			{focusIcons[focus.focusType] || '🔍'}
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
