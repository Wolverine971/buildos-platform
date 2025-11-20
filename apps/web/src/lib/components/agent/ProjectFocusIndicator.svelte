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
	<!-- Ultra-compact inline focus indicator - seamlessly integrated -->
	<span class="inline-flex items-center gap-1 text-xs">
		<!-- Focus type emoji -->
		<span class="text-xs" aria-hidden="true">
			{focusIcons[focus.focusType] || '🔍'}
		</span>

		<!-- Focus label with interactive actions -->
		<button
			type="button"
			onclick={() => onChangeFocus?.()}
			class="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium text-blue-700 transition-all hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/50"
			title={resolvedLabel}
		>
			<span class="max-w-[120px] truncate sm:max-w-[200px]">
				{resolvedLabel}
			</span>
			{#if focus.focusType !== 'project-wide'}
				<Target class="h-3 w-3" />
			{/if}
		</button>

		<!-- Clear button for non-project-wide focus -->
		{#if onClearFocus && focus.focusType !== 'project-wide'}
			<button
				type="button"
				class="ml-0.5 rounded px-1 py-0.5 text-[10px] font-medium text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
				onclick={() => onClearFocus?.()}
				aria-label="Clear focus"
			>
				×
			</button>
		{/if}
	</span>
{/if}
