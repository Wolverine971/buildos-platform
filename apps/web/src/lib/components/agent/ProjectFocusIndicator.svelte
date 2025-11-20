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
	<!-- ✅ Compact inline focus indicator matching header style -->
	<div
		class="inline-flex items-center gap-1.5 rounded-full border border-blue-200/50 bg-gradient-to-r from-blue-50/80 to-indigo-50/60 px-2.5 py-1 text-xs shadow-sm dark:border-blue-800/40 dark:from-blue-900/20 dark:to-indigo-900/15"
	>
		<!-- ✅ Compact icon -->
		<span class="text-sm" aria-hidden="true">
			{focusIcons[focus.focusType] || '🔍'}
		</span>

		<!-- ✅ Focus label -->
		<span
			class="truncate font-medium text-slate-900 dark:text-white max-w-[200px]"
			title={resolvedLabel}
		>
			{resolvedLabel}
		</span>

		<!-- ✅ Divider -->
		{#if onChangeFocus || (onClearFocus && focus.focusType !== 'project-wide')}
			<span class="h-3 w-px bg-blue-200 dark:bg-blue-700" aria-hidden="true"></span>
		{/if}

		<!-- ✅ Compact action buttons -->
		<div class="flex shrink-0 items-center gap-1">
			{#if onChangeFocus}
				<button
					type="button"
					class="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium text-blue-700 transition-colors hover:bg-white/70 dark:text-blue-300 dark:hover:bg-blue-900/40"
					onclick={() => onChangeFocus?.()}
					aria-label="Change project focus"
				>
					<Target class="h-3 w-3" />
					<span>Focus</span>
				</button>
			{/if}
			{#if onClearFocus && focus.focusType !== 'project-wide'}
				<button
					type="button"
					class="rounded-full px-2 py-0.5 text-[11px] font-medium text-slate-600 transition-colors hover:bg-white/70 dark:text-slate-400 dark:hover:bg-blue-900/40"
					onclick={() => onClearFocus?.()}
					aria-label="Clear focus and return to project-wide view"
				>
					Clear
				</button>
			{/if}
		</div>
	</div>
{/if}
