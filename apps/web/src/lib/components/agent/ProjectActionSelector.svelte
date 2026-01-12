<!-- apps/web/src/lib/components/agent/ProjectActionSelector.svelte -->
<!-- INKPRINT Design System: Project action selector with semantic textures -->
<script lang="ts">
	import { BriefcaseBusiness, Search, TrendingUp, Target, ChevronRight } from 'lucide-svelte';

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
		texture: string;
		iconBg: string;
	}> = [
		{
			id: 'workspace',
			title: 'Project Workspace',
			subtitle: 'Work with goals, plans, tasks, or ask anything about this project.',
			Icon: BriefcaseBusiness,
			texture: 'tx tx-frame tx-weak',
			iconBg: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
		},
		{
			id: 'audit',
			title: 'Audit Project',
			subtitle: 'Stress-test for gaps, risks, and ownership across the project.',
			Icon: Search,
			texture: 'tx tx-static tx-weak',
			iconBg: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
		},
		{
			id: 'forecast',
			title: 'Forecast Project',
			subtitle: 'Explore timelines, what-ifs, and scenario planning.',
			Icon: TrendingUp,
			texture: 'tx tx-grain tx-weak',
			iconBg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
		}
	];
</script>

<!-- INKPRINT container with muted background -->
<div class="flex h-full flex-col bg-muted">
	<div class="flex-1 overflow-auto px-3 py-3 sm:p-5">
		<!-- Mobile: compact stacked list | Desktop: grid -->
		<div class="flex flex-col gap-2 sm:grid sm:grid-cols-3 sm:gap-4">
			{#each actions as action (action.id)}
				{@const Icon = action.Icon}
				<button
					type="button"
					onclick={() => onSelectAction(action.id)}
					class={`group flex flex-col rounded-lg border border-border bg-card p-2.5 text-left shadow-ink ${action.texture} transition-all duration-200 hover:border-accent hover:shadow-ink-strong active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-full sm:rounded-xl sm:p-4 sm:hover:-translate-y-0.5`}
				>
					<!-- Mobile: Icon + Title + Chevron in one row -->
					<div class="flex items-center gap-2 sm:gap-3">
						<div
							class={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${action.iconBg} sm:h-10 sm:w-10 sm:rounded-lg`}
						>
							<Icon class="h-3.5 w-3.5 sm:h-5 sm:w-5" />
						</div>
						<h3 class="flex-1 text-sm font-semibold text-foreground">
							{action.title}
						</h3>
						<ChevronRight
							class="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent sm:hidden"
						/>
					</div>
					<!-- Description underneath -->
					<p
						class="mt-1.5 text-xs leading-snug text-muted-foreground pl-9 sm:pl-0 sm:mt-2"
					>
						{action.subtitle}
					</p>
					<!-- Desktop footer -->
					<div
						class="hidden items-center justify-between pt-3 mt-auto text-xs font-semibold text-accent sm:flex"
					>
						<span>Start</span>
						<ChevronRight
							class="h-4 w-4 transition-transform group-hover:translate-x-1"
						/>
					</div>
				</button>
			{/each}
		</div>

		<!-- INKPRINT focus selector card with Bloom texture - compact on mobile -->
		<div
			class="mt-3 flex flex-col gap-2 rounded-lg border border-border bg-card p-2.5 shadow-ink tx tx-bloom tx-weak sm:mt-5 sm:gap-3 sm:p-4"
		>
			<div class="flex items-center gap-2">
				<div
					class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent sm:h-8 sm:w-8 sm:rounded-lg"
				>
					<Target class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
				</div>
				<div class="min-w-0 flex-1">
					<p class="text-sm font-semibold text-foreground">Focus on specific work</p>
					<p
						class="text-[0.6rem] uppercase tracking-wider text-muted-foreground sm:text-[0.65rem] sm:tracking-[0.1em]"
					>
						Pick a task, goal, plan, or document.
					</p>
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-1.5 pl-9 sm:gap-2 sm:pl-0">
				<!-- INKPRINT outline buttons - compact on mobile -->
				<button
					type="button"
					onclick={() => onOpenFocusSelector?.()}
					class="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-semibold text-accent shadow-ink transition hover:border-accent hover:bg-accent/5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-1.5 sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-xs"
				>
					Open focus selector
				</button>
				<button
					type="button"
					onclick={() => onSelectAction('workspace')}
					class="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-semibold text-muted-foreground shadow-ink transition hover:border-accent hover:text-foreground active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-1.5 sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-xs"
				>
					Switch to workspace
				</button>
			</div>
		</div>
	</div>
</div>
