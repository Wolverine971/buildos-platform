<!-- apps/web/src/lib/components/agent/ProjectActionSelector.svelte -->
<script lang="ts">
	import {
		BriefcaseBusiness,
		Search,
		TrendingUp,
		Target,
		ChevronRight,
		ArrowRight
	} from 'lucide-svelte';

	type ProjectAction = 'workspace' | 'audit' | 'forecast';

	interface Props {
		projectId: string;
		projectName: string;
		onSelectAction: (action: ProjectAction) => void;
		onBack?: () => void;
		onOpenFocusSelector?: () => void;
	}

	let { projectId, projectName, onSelectAction, onBack, onOpenFocusSelector }: Props = $props();

	const actions: Array<{
		id: ProjectAction;
		title: string;
		subtitle: string;
		Icon: typeof BriefcaseBusiness;
		className: string;
	}> = [
		{
			id: 'workspace',
			title: 'Project Workspace',
			subtitle: 'Work with goals, plans, tasks, or ask anything about this project.',
			Icon: BriefcaseBusiness,
			className:
				'from-blue-50/70 via-slate-50/60 to-white/70 border-blue-200/70 hover:border-blue-300 dark:from-blue-950/20 dark:via-slate-900/40 dark:to-slate-900/20'
		},
		{
			id: 'audit',
			title: 'Audit Project',
			subtitle: 'Stress-test for gaps, risks, and ownership across the project.',
			Icon: Search,
			className:
				'from-amber-50/70 via-orange-50/50 to-white/70 border-amber-200/70 hover:border-amber-300 dark:from-amber-950/20 dark:via-amber-900/20 dark:to-slate-900/20'
		},
		{
			id: 'forecast',
			title: 'Forecast Project',
			subtitle: 'Explore timelines, what-ifs, and scenario planning.',
			Icon: TrendingUp,
			className:
				'from-emerald-50/70 via-teal-50/50 to-white/70 border-emerald-200/70 hover:border-emerald-300 dark:from-emerald-950/20 dark:via-teal-900/20 dark:to-slate-900/20'
		}
	];
</script>

<div class="flex h-full flex-col bg-slate-50/60 dark:bg-slate-900/40">
	<div class="flex-1 overflow-auto p-4 sm:p-5">
		<div class="grid gap-3 sm:grid-cols-3">
			{#each actions as action (action.id)}
				{@const Icon = action.Icon}
				<button
					type="button"
					onclick={() => onSelectAction(action.id)}
					class={`group flex h-full flex-col items-start gap-3 rounded-xl border bg-gradient-to-br p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:border-slate-800 ${action.className}`}
				>
					<div
						class="flex h-12 w-12 items-center justify-center rounded-lg bg-white/70 shadow-sm transition-transform duration-200 group-hover:scale-105 dark:bg-slate-900/60"
					>
						<Icon class="h-6 w-6 text-slate-800 dark:text-slate-200" />
					</div>
					<div class="space-y-1">
						<p class="text-sm font-semibold text-slate-900 dark:text-white">
							{action.title}
						</p>
						<p class="text-xs leading-snug text-slate-600 dark:text-slate-400">
							{action.subtitle}
						</p>
					</div>
					<span
						class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400"
					>
						Start

						<ArrowRight
							class="h-3 w-3 text-gray-400 dark:text-gray-500 transition-transform duration-200 group-hover:translate-x-0.5"
						/>
					</span>
				</button>
			{/each}
		</div>

		<div
			class="mt-5 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
		>
			<div class="flex items-center gap-2">
				<div
					class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
				>
					<Target class="h-4 w-4" />
				</div>
				<div>
					<p class="text-sm font-semibold text-slate-900 dark:text-white">
						Focus on specific work
					</p>
					<p class="text-[11px] text-slate-600 dark:text-slate-400">
						Pick a task, goal, plan, document, or output inside this project.
					</p>
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<button
					type="button"
					onclick={() => onOpenFocusSelector?.()}
					class="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-slate-700 dark:text-blue-300 dark:hover:bg-slate-800"
				>
					Open focus selector
				</button>
				<button
					type="button"
					onclick={() => onSelectAction('workspace')}
					class="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
				>
					Switch to workspace
				</button>
			</div>
		</div>
	</div>
</div>
