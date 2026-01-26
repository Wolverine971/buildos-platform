<!-- apps/web/src/lib/components/agent/AgentAutomationWizard.svelte -->
<!-- INKPRINT Design System: Automation wizard with Thread texture -->
<script lang="ts">
	import { Sparkles, ChevronRight } from 'lucide-svelte';

	type AgentToAgentStep = 'agent' | 'project' | 'goal' | 'chat';

	interface AgentProjectSummary {
		id: string;
		name: string;
		description: string | null;
	}

	interface Props {
		step: AgentToAgentStep;
		selectedAgentLabel: string;
		selectedContextLabel: string | null;
		agentProjects: AgentProjectSummary[];
		agentProjectsLoading: boolean;
		agentProjectsError: string | null;
		agentGoal: string;
		agentTurnBudget: number;
		onUseActionableInsight: () => void;
		onProjectSelect: (project: AgentProjectSummary) => void;
		onBackAgent: () => void;
		onBackProject: () => void;
		onStartChat: () => void;
		onExit: () => void;
		onGoalChange: (value: string) => void;
		onTurnBudgetChange: (value: number) => void;
	}

	let {
		step,
		selectedAgentLabel,
		selectedContextLabel,
		agentProjects,
		agentProjectsLoading,
		agentProjectsError,
		agentGoal,
		agentTurnBudget,
		onUseActionableInsight,
		onProjectSelect,
		onBackAgent,
		onBackProject,
		onStartChat,
		onExit,
		onGoalChange,
		onTurnBudgetChange
	}: Props = $props();
</script>

<!-- INKPRINT wizard container with muted background -->
<div class="flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-muted p-4 sm:gap-4 sm:p-6">
	<div class="flex items-start justify-between gap-3 sm:gap-4">
		<div class="min-w-0 flex-1">
			<!-- INKPRINT micro-label -->
			<p class="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-accent">
				AUTOMATION LOOP
			</p>
			<h3 class="text-lg font-semibold text-foreground">
				{#if step === 'agent'}
					Choose a BuildOS helper
				{:else if step === 'project'}
					Choose a project
				{:else}
					Set the automation goal
				{/if}
			</h3>
			<p class="mt-1 text-sm text-muted-foreground">
				BuildOS will coordinate with Actionable Insight to keep work moving.
			</p>
		</div>
		<button
			type="button"
			class="shrink-0 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground shadow-ink transition pressable hover:border-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onclick={onExit}
		>
			Exit
		</button>
	</div>

	{#if step === 'agent'}
		<!-- INKPRINT agent selection card with Thread texture -->
		<div class="flex-1 flex flex-col justify-center px-4">
			<button
				type="button"
				onclick={onUseActionableInsight}
				class="group flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-left shadow-ink tx tx-thread tx-weak transition-all duration-200 pressable hover:border-accent hover:shadow-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
			>
				<div
					class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent transition-transform duration-200 group-hover:scale-105"
				>
					<Sparkles class="h-5 w-5" />
				</div>
				<div class="flex-1 space-y-1">
					<h3 class="text-sm font-semibold text-foreground">Actionable Insight</h3>
					<p class="text-xs text-muted-foreground leading-snug">
						BuildOS will tap Actionable Insight to craft concise, actionable prompts and
						push the work forward in chat.
					</p>
				</div>
				<div class="flex items-center justify-between text-xs font-semibold text-accent">
					<span>Use this helper</span>
					<ChevronRight class="h-4 w-4 transition-transform group-hover:translate-x-1" />
				</div>
			</button>
		</div>
	{:else if step === 'project'}
		<!-- INKPRINT project selection grid -->
		<div class="flex flex-1 flex-col gap-3 overflow-hidden">
			<h4 class="text-base font-semibold text-foreground">Select the project to work in</h4>
			<div class="flex-1 min-h-0 overflow-y-auto">
				{#if agentProjectsLoading}
					<div class="rounded-lg border border-border bg-card p-4 shadow-ink">
						<p class="text-sm text-muted-foreground">Loading projects...</p>
					</div>
				{:else if agentProjectsError}
					<!-- INKPRINT error card with Static texture -->
					<div
						class="rounded-lg border border-red-600/30 bg-red-50 p-4 shadow-ink tx tx-static tx-weak dark:bg-red-950/20"
					>
						<p class="text-sm text-red-700 dark:text-red-400">
							{agentProjectsError}
						</p>
					</div>
				{:else}
					<div class="grid gap-3 sm:gap-4 sm:grid-cols-2">
						{#each agentProjects as project}
							<button
								type="button"
								class="group h-full rounded-lg border border-border bg-card p-3 text-left shadow-ink transition-all duration-200 pressable hover:border-accent hover:shadow-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								onclick={() => onProjectSelect(project)}
								aria-label={`Select ${project.name} project`}
							>
								<div class="space-y-2">
									<div class="flex items-center justify-between gap-3">
										<h5 class="text-sm font-semibold text-foreground">
											{project.name}
										</h5>
										<span
											class="text-xs font-semibold text-accent transition-colors"
										>
											Select
										</span>
									</div>
									<p class="text-xs text-muted-foreground line-clamp-2">
										{project.description || 'No description provided.'}
									</p>
								</div>
							</button>
						{/each}
					</div>
					{#if agentProjects.length === 0 && !agentProjectsLoading}
						<!-- INKPRINT empty state -->
						<div
							class="rounded-lg border-2 border-dashed border-border bg-card p-4 shadow-ink"
						>
							<p class="text-sm text-center text-muted-foreground">
								No projects found. Create one first.
							</p>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	{:else}
		<!-- INKPRINT goal configuration -->
		<div class="flex flex-1 flex-col gap-3 overflow-hidden">
			<h4 class="text-base font-semibold text-foreground">
				What should BuildOS handle automatically?
			</h4>
			<div class="flex-1 min-h-0 overflow-y-auto">
				<div
					class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-grain tx-weak"
				>
					<div class="space-y-2 sm:space-y-3">
						<!-- INKPRINT context badges -->
						<div
							class="flex flex-wrap items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground sm:gap-2"
						>
							<span
								class="rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-accent"
							>
								Helper: {selectedAgentLabel}
							</span>
							{#if selectedContextLabel}
								<span
									class="rounded-lg border border-emerald-600/30 bg-emerald-50 px-2.5 py-1.5 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
								>
									Project: {selectedContextLabel}
								</span>
							{/if}
						</div>
						<div class="space-y-2">
							<label
								for="agent-goal-input"
								class="block text-sm font-medium text-foreground"
							>
								Goal for BuildOS automation
							</label>
							<textarea
								id="agent-goal-input"
								class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground shadow-ink-inner focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring"
								rows="3"
								value={agentGoal}
								oninput={(event) =>
									onGoalChange((event.target as HTMLTextAreaElement).value)}
								placeholder="Describe what BuildOS should try to achieve..."
							></textarea>
							<div class="flex flex-col sm:flex-row sm:items-center gap-2">
								<!-- INKPRINT primary button -->
								<button
									type="button"
									class="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-ink transition pressable hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
									onclick={onStartChat}
									disabled={agentGoal.trim().length === 0}
								>
									Start automation
								</button>
								<span class="text-xs text-muted-foreground">
									BuildOS will coordinate turns automatically.
								</span>
							</div>
							<label class="flex items-center gap-2 text-xs text-muted-foreground">
								<span class="font-semibold uppercase tracking-[0.1em]"
									>Turn limit</span
								>
								<input
									type="number"
									min="1"
									max="50"
									class="w-20 rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground shadow-ink-inner focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring"
									value={agentTurnBudget}
									oninput={(e) =>
										onTurnBudgetChange(
											Number((e.target as HTMLInputElement).value)
										)}
								/>
							</label>
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
