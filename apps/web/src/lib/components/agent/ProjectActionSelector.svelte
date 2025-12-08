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
	<div class="flex-1 overflow-auto p-4 sm:p-5">
		<!-- INKPRINT action cards grid -->
		<div class="grid gap-4 sm:grid-cols-3">
			{#each actions as action (action.id)}
				{@const Icon = action.Icon}
				<button
					type="button"
					onclick={() => onSelectAction(action.id)}
					class={`group flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-5 text-left shadow-ink ${action.texture} transition-all duration-200 pressable hover:border-accent hover:shadow-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
				>
					<div
						class={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${action.iconBg} shadow-ink transition-transform duration-200 group-hover:scale-105`}
					>
						<Icon class="h-5 w-5" />
					</div>
					<div class="flex-1 space-y-1">
						<h3 class="text-sm font-semibold text-foreground">
							{action.title}
						</h3>
						<p class="text-xs leading-snug text-muted-foreground">
							{action.subtitle}
						</p>
					</div>
					<div
						class="flex items-center justify-between text-xs font-semibold text-accent"
					>
						<span>Start</span>
						<ChevronRight
							class="h-4 w-4 transition-transform group-hover:translate-x-1"
						/>
					</div>
				</button>
			{/each}
		</div>

		<!-- INKPRINT focus selector card with Bloom texture -->
		<div
			class="mt-5 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-ink tx tx-bloom tx-weak"
		>
			<div class="flex items-center gap-2">
				<div
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent"
				>
					<Target class="h-4 w-4" />
				</div>
				<div>
					<p class="text-sm font-semibold text-foreground">Focus on specific work</p>
					<p class="text-[0.65rem] uppercase tracking-[0.1em] text-muted-foreground">
						Pick a task, goal, plan, document, or output inside this project.
					</p>
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<!-- INKPRINT outline buttons -->
				<button
					type="button"
					onclick={() => onOpenFocusSelector?.()}
					class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-accent shadow-ink transition pressable hover:border-accent hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					Open focus selector
				</button>
				<button
					type="button"
					onclick={() => onSelectAction('workspace')}
					class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-ink transition pressable hover:border-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					Switch to workspace
				</button>
			</div>
		</div>
	</div>
</div>
