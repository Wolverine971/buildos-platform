<!-- apps/web/src/lib/components/agent/AgentAutomationWizard.svelte -->
<!-- INKPRINT Design System: Automation wizard with Thread texture -->
<script lang="ts">
	import { Sparkles, ChevronRight, Loader } from 'lucide-svelte';
	import type { AgentToAgentStep, AgentProjectSummary } from './agent-chat.types';

	interface Props {
		step: AgentToAgentStep;
		selectedAgentLabel: string;
		selectedContextLabel: string | null;
		agentProjects: AgentProjectSummary[];
		agentProjectsLoading: boolean;
		agentProjectsError: string | null;
		agentGoal: string;
		agentTurnBudget: number;
		/**
		 * When false (default), the parent has auto-selected the only helper and
		 * the wizard skips the agent step. Set true once a real helper choice exists.
		 */
		hasMultipleHelpers?: boolean;
		onUseActionableInsight: () => void;
		onProjectSelect: (project: AgentProjectSummary) => void;
		onStartChat: () => void;
		onExit: () => void;
		onGoalChange: (value: string) => void;
		onTurnBudgetChange: (value: number) => void;
		/** Jump back to an earlier step. Forward jumps are silently ignored. */
		onJumpToStep?: (target: AgentToAgentStep) => void;
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
		hasMultipleHelpers = false,
		onUseActionableInsight,
		onProjectSelect,
		onStartChat,
		onExit,
		onGoalChange,
		onTurnBudgetChange,
		onJumpToStep
	}: Props = $props();

	const ALL_STEPS: Array<{ key: typeof step; label: string }> = [
		{ key: 'agent', label: 'Helper' },
		{ key: 'project', label: 'Project' },
		{ key: 'goal', label: 'Goal' }
	];
	const steps = $derived(
		hasMultipleHelpers ? ALL_STEPS : ALL_STEPS.filter((s) => s.key !== 'agent')
	);
	const stepIndex = $derived(steps.findIndex((s) => s.key === step));
	const stepTitle = $derived.by(() => {
		if (step === 'agent') return 'Pick a BuildOS helper';
		if (step === 'project') return 'Pick a project to chat in';
		return 'Describe the goal';
	});
	const stepSubtitle = $derived.by(() => {
		if (step === 'agent')
			return 'BuildOS will coordinate with this helper to keep work moving.';
		if (step === 'project') return 'The helper will run inside one project at a time.';
		return 'BuildOS will use this goal to drive every turn of the loop.';
	});

	function jumpToStepIfBack(target: AgentToAgentStep) {
		const targetIndex = steps.findIndex((s) => s.key === target);
		// Only allow backward jumps so users can't skip past an unselected helper/project.
		if (targetIndex < 0 || targetIndex >= stepIndex) return;
		onJumpToStep?.(target);
	}
</script>

<!-- INKPRINT wizard container with muted background -->
<div class="flex h-full min-h-0 flex-col overflow-hidden bg-muted">
	<!-- Screen header band (matches other selection screens) -->
	<div class="border-b border-border bg-card px-3 py-2.5 tx tx-strip tx-weak sm:p-4">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0 flex-1">
				<p
					class="mb-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-accent"
				>
					Automation loop · Step {stepIndex + 1} of {steps.length}
				</p>
				<h2 class="text-base font-semibold text-foreground sm:text-lg">
					{stepTitle}
				</h2>
				<p class="mt-0.5 text-xs text-muted-foreground sm:text-sm">
					{stepSubtitle}
				</p>
			</div>
			<button
				type="button"
				class="shrink-0 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground shadow-ink transition pressable hover:border-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onclick={onExit}
			>
				Exit
			</button>
		</div>

		<!-- Step indicator dots -->
		<ol class="mt-2.5 flex items-center gap-1.5" aria-label="Wizard progress">
			{#each steps as s, i}
				{@const isActive = i === stepIndex}
				{@const isComplete = i < stepIndex}
				<li class="flex items-center gap-1.5">
					{#if isComplete}
						<!-- Completed steps are tappable to jump back. -->
						<button
							type="button"
							onclick={() => jumpToStepIfBack(s.key)}
							class="group inline-flex items-center gap-1.5 rounded px-0.5 py-0.5 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							aria-label={`Go back to ${s.label} step`}
						>
							<span
								class="flex h-1.5 w-1.5 rounded-full bg-accent/60 transition-colors group-hover:bg-accent"
							></span>
							<span
								class="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground transition-colors group-hover:text-accent"
							>
								{s.label}
							</span>
						</button>
					{:else}
						<span
							class={`flex h-1.5 w-1.5 rounded-full transition-colors ${
								isActive ? 'bg-accent ring-2 ring-accent/30' : 'bg-border'
							}`}
							aria-current={isActive ? 'step' : undefined}
						></span>
						<span
							class={`text-[0.65rem] font-semibold uppercase tracking-[0.1em] ${
								isActive ? 'text-accent' : 'text-muted-foreground/50'
							}`}
						>
							{s.label}
						</span>
					{/if}
					{#if i < steps.length - 1}
						<span class="ml-0.5 h-px w-3 bg-border" aria-hidden="true"></span>
					{/if}
				</li>
			{/each}
		</ol>
	</div>

	<!-- Step body -->
	<div class="flex flex-1 min-h-0 flex-col gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4">
		{#if step === 'agent'}
			<!-- INKPRINT agent selection card with Thread texture (collaboration) -->
			<div
				class="flex flex-1 min-h-0 items-start justify-center overflow-y-auto pt-2 sm:pt-4"
			>
				<button
					type="button"
					onclick={onUseActionableInsight}
					class="group flex w-full max-w-md flex-col gap-3 rounded-lg border border-border bg-card p-4 text-left shadow-ink tx tx-thread tx-weak transition-all duration-200 pressable hover:border-accent hover:shadow-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
				>
					<div
						class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent transition-transform duration-200 group-hover:scale-105"
					>
						<Sparkles class="h-5 w-5" />
					</div>
					<div class="flex-1 space-y-1">
						<h3 class="text-sm font-semibold text-foreground">Actionable Insight</h3>
						<p class="text-xs text-muted-foreground leading-snug">
							BuildOS will tap Actionable Insight to craft concise, actionable prompts
							and push the work forward in chat.
						</p>
					</div>
					<div
						class="flex items-center justify-between text-xs font-semibold text-accent"
					>
						<span>Use this helper</span>
						<ChevronRight
							class="h-4 w-4 transition-transform group-hover:translate-x-1"
						/>
					</div>
				</button>
			</div>
		{:else if step === 'project'}
			<!-- INKPRINT project selection grid -->
			<div class="flex flex-1 min-h-0 flex-col overflow-y-auto">
				{#if agentProjectsLoading}
					<div class="flex items-center justify-center py-12 sm:py-16">
						<Loader class="h-5 w-5 animate-spin text-muted-foreground" />
					</div>
				{:else if agentProjectsError}
					<!-- INKPRINT error card with Static texture -->
					<div
						class="rounded-lg border border-red-600/30 bg-red-50 p-4 shadow-ink tx tx-static tx-weak dark:bg-red-950/20"
						role="alert"
					>
						<p class="text-xs font-semibold text-red-700 dark:text-red-300">
							Couldn't load projects
						</p>
						<p class="mt-0.5 text-xs text-red-600 dark:text-red-400">
							{agentProjectsError}
						</p>
					</div>
				{:else if agentProjects.length === 0}
					<!-- INKPRINT empty state -->
					<div
						class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-10 px-4 text-center shadow-ink tx tx-bloom tx-weak"
					>
						<p class="text-sm font-semibold text-foreground">No projects yet</p>
						<p class="mt-1 max-w-xs text-xs text-muted-foreground">
							Create a project first, then come back to run an automation loop inside
							it.
						</p>
					</div>
				{:else}
					<div class="grid gap-2 sm:gap-3 sm:grid-cols-2">
						{#each agentProjects as project (project.id)}
							<button
								type="button"
								class="group h-full rounded-lg border border-border bg-card p-3 text-left shadow-ink tx tx-frame tx-weak transition-all duration-200 pressable hover:border-accent hover:shadow-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								onclick={() => onProjectSelect(project)}
								aria-label={`Select ${project.name} project`}
							>
								<div class="flex items-start justify-between gap-3">
									<h3
										class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground"
										title={project.name}
									>
										{project.name}
									</h3>
									<ChevronRight
										class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
									/>
								</div>
								<p class="mt-1 text-xs text-muted-foreground line-clamp-2">
									{project.description || 'No description provided.'}
								</p>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<!-- INKPRINT goal configuration with Grain texture (active editing) -->
			<div class="flex flex-1 min-h-0 flex-col overflow-y-auto">
				<div class="space-y-3 sm:space-y-4">
					<!-- INKPRINT context badges — tap to jump back and change -->
					<div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
						{#if hasMultipleHelpers}
							<button
								type="button"
								onclick={() => jumpToStepIfBack('agent')}
								class="inline-flex items-center gap-1 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-accent transition pressable hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								aria-label="Change helper"
								title="Tap to change helper"
							>
								<span>Helper: {selectedAgentLabel}</span>
								<span aria-hidden="true" class="text-accent/60">·</span>
								<span aria-hidden="true">Change</span>
							</button>
						{:else}
							<span
								class="inline-flex items-center rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-accent"
							>
								Helper: {selectedAgentLabel}
							</span>
						{/if}
						{#if selectedContextLabel}
							<button
								type="button"
								onclick={() => jumpToStepIfBack('project')}
								class="inline-flex items-center gap-1 rounded-lg border border-emerald-600/30 bg-emerald-50 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-emerald-700 transition pressable hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
								aria-label="Change project"
								title="Tap to change project"
							>
								<span>Project: {selectedContextLabel}</span>
								<span
									aria-hidden="true"
									class="text-emerald-700/60 dark:text-emerald-400/60">·</span
								>
								<span aria-hidden="true">Change</span>
							</button>
						{/if}
					</div>

					<div
						class="rounded-lg border border-border bg-card p-3 shadow-ink tx tx-grain tx-weak sm:p-4"
					>
						<label
							for="agent-goal-input"
							class="block text-sm font-semibold text-foreground"
						>
							What should BuildOS try to achieve?
						</label>
						<p class="mt-0.5 text-xs text-muted-foreground">
							Be specific — this is the only instruction the helper will follow each
							turn.
						</p>
						<textarea
							id="agent-goal-input"
							class="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground shadow-ink-inner focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring"
							rows="3"
							value={agentGoal}
							oninput={(event) =>
								onGoalChange((event.target as HTMLTextAreaElement).value)}
							placeholder="e.g. Draft a launch plan and break it into tasks with owners…"
						></textarea>

						<div class="mt-3 flex items-center gap-2">
							<label
								for="agent-turn-budget"
								class="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground"
							>
								Turn limit
							</label>
							<input
								id="agent-turn-budget"
								type="number"
								min="1"
								max="50"
								class="w-20 rounded-lg border border-border bg-background px-2 py-1 text-xs font-semibold text-foreground shadow-ink-inner focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring"
								value={agentTurnBudget}
								oninput={(e) =>
									onTurnBudgetChange(
										Number((e.target as HTMLInputElement).value)
									)}
								aria-describedby="agent-turn-budget-hint"
							/>
							<span class="text-[0.65rem] text-muted-foreground">turns max</span>
						</div>
						<p
							id="agent-turn-budget-hint"
							class="mt-1.5 text-[0.65rem] leading-snug text-muted-foreground"
						>
							5 is a good starting point — most loops resolve in 3–5 turns. Bump it up
							for more open-ended work.
						</p>
					</div>

					<div class="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
						<button
							type="button"
							class="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-ink transition pressable hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
							onclick={onStartChat}
							disabled={agentGoal.trim().length === 0}
						>
							Start automation
						</button>
						<span class="text-xs text-muted-foreground">
							BuildOS will run each turn until the limit is reached.
						</span>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
