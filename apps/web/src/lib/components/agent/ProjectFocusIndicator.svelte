<!-- apps/web/src/lib/components/agent/ProjectFocusIndicator.svelte -->
<script lang="ts">
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
	<div
		class="mt-3 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/90 to-indigo-50/70 p-1 text-sm shadow-sm transition-all duration-300 hover:shadow-md dark:border-blue-900/40 dark:from-blue-900/20 dark:to-indigo-900/10 sm:px-4"
	>
		<div class="flex flex-wrap items-center gap-2 sm:gap-3">
			<div
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-lg shadow-sm ring-1 ring-blue-100 dark:bg-blue-950/50 dark:ring-blue-800/40 sm:h-8 sm:w-8 sm:text-xl"
			>
				{focusIcons[focus.focusType] || '🔍'}
			</div>
			<div class="min-w-0 flex-1">
				
				<p
					class="truncate text-sm font-medium text-slate-900 dark:text-white sm:text-base"
					title={resolvedLabel}
				>
					{resolvedLabel}
				</p>
				{#if focus.focusType !== 'project-wide'}
					<p
						class="truncate text-xs text-slate-600 dark:text-slate-300"
						title={focus.projectName}
					>
						In {focus.projectName}
					</p>
				{/if}
			</div>
			<div class="flex shrink-0 items-center gap-1.5 text-xs font-medium sm:gap-2">
				{#if onChangeFocus}
					<button
						type="button"
						class="rounded-full bg-white/90 px-3 py-1.5 text-blue-700 shadow-sm ring-1 ring-blue-100 transition-all duration-200 hover:bg-white hover:shadow dark:bg-blue-900/60 dark:text-blue-200 dark:ring-blue-800/40 dark:hover:bg-blue-900/80"
						onclick={() => onChangeFocus?.()}
					>
						Change
					</button>
				{/if}
				{#if onClearFocus && focus.focusType !== 'project-wide'}
					<button
						type="button"
						class="rounded-full px-3 py-1.5 text-slate-600 transition-all duration-200 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-blue-900/40"
						onclick={() => onClearFocus?.()}
					>
						Clear
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
