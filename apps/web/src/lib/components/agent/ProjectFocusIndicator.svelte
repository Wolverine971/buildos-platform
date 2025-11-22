<!-- apps/web/src/lib/components/agent/ProjectFocusIndicator.svelte -->
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
	<!-- Ultra-compact inline focus indicator - mobile optimized -->
	<span class="inline-flex items-center gap-0.5 text-xs sm:gap-1">
		<!-- Focus type emoji: Smaller on mobile -->
		<span class="text-[11px] sm:text-xs" aria-hidden="true">
			{focusIcons[focus.focusType] || '🔍'}
		</span>

		<!-- Focus label with interactive actions: More compact on mobile -->
		<button
			type="button"
			onclick={() => onChangeFocus?.()}
			class="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs font-medium text-blue-700 transition-all hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/50 sm:px-1.5"
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

		<!-- Clear button: More compact on mobile -->
		{#if onClearFocus && focus.focusType !== 'project-wide'}
			<button
				type="button"
				class="ml-0 rounded px-0.5 py-0.5 text-[10px] font-medium text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 sm:ml-0.5 sm:px-1"
				onclick={() => onClearFocus?.()}
				aria-label="Clear focus"
			>
				×
			</button>
		{/if}
	</span>
{/if}
