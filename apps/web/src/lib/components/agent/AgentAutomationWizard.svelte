<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';

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

<div
	class="flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-slate-50/70 p-3 sm:gap-4 sm:p-4 dark:bg-slate-900/40"
>
	<div class="flex items-start justify-between gap-3 sm:gap-4">
		<div class="min-w-0 flex-1">
			<p
				class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
			>
				Automation loop
			</p>
			<h3 class="text-lg font-semibold text-slate-900 dark:text-white">
				{#if step === 'agent'}
					Choose a BuildOS helper
				{:else if step === 'project'}
					Choose a project
				{:else}
					Set the automation goal
				{/if}
			</h3>
			<p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
				BuildOS will coordinate with Actionable Insight to keep work moving.
			</p>
		</div>
		<button
			type="button"
			class="text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white shrink-0"
			onclick={onExit}
		>
			Exit
		</button>
	</div>

	{#if step === 'agent'}
		<Card variant="elevated" class="flex-1 flex flex-col justify-center">
			<CardBody padding="md">
				<div class="space-y-2 sm:space-y-3">
					<h4 class="text-base font-semibold text-slate-900 dark:text-white">
						Actionable Insight
					</h4>
					<p class="max-w-2xl text-sm text-slate-600 dark:text-slate-400">
						BuildOS will tap Actionable Insight to craft concise, actionable prompts and
						push the work forward in chat.
					</p>
					<div class="flex flex-wrap items-center gap-2 sm:gap-3">
						<Button variant="primary" size="sm" onclick={onUseActionableInsight}>
							Use Actionable Insight
						</Button>
						<span
							class="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
						>
							Single option available
						</span>
					</div>
				</div>
			</CardBody>
		</Card>
	{:else if step === 'project'}
		<div class="flex flex-1 flex-col gap-3 overflow-hidden">
			<div class="flex items-center justify-between">
				<h4 class="text-base font-semibold text-slate-900 dark:text-white">
					Select the project to work in
				</h4>
				<Button variant="ghost" size="sm" onclick={onBackAgent}>Back</Button>
			</div>
			<div class="flex-1 min-h-0 overflow-y-auto">
				{#if agentProjectsLoading}
					<Card variant="elevated">
						<CardBody padding="md">
							<p class="text-sm text-slate-600 dark:text-slate-300">
								Loading projects...
							</p>
						</CardBody>
					</Card>
				{:else if agentProjectsError}
					<Card
						variant="elevated"
						class="border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20"
					>
						<CardBody padding="sm">
							<p class="text-sm text-rose-700 dark:text-rose-300">
								{agentProjectsError}
							</p>
						</CardBody>
					</Card>
				{:else}
					<div class="grid gap-2 sm:gap-3 sm:grid-cols-2">
						{#each agentProjects as project}
							<Card variant="interactive" class="group h-full">
								<button
									type="button"
									class="w-full text-left focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 rounded-xl"
									onclick={() => onProjectSelect(project)}
									aria-label={`Select ${project.name} project`}
								>
									<CardBody padding="sm">
										<div class="space-y-1 sm:space-y-1.5">
											<div class="flex items-center justify-between gap-3">
												<h5
													class="text-sm font-semibold text-slate-900 dark:text-white"
												>
													{project.name}
												</h5>
												<span
													class="text-xs font-semibold uppercase tracking-wide text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors"
												>
													Select
												</span>
											</div>
											<p
												class="text-xs text-slate-600 dark:text-slate-400 line-clamp-2"
											>
												{project.description || 'No description provided.'}
											</p>
										</div>
									</CardBody>
								</button>
							</Card>
						{/each}
					</div>
					{#if agentProjects.length === 0 && !agentProjectsLoading}
						<Card variant="outline" class="border-dashed">
							<CardBody padding="sm">
								<p class="text-sm text-center text-slate-500 dark:text-slate-400">
									No projects found. Create one first.
								</p>
							</CardBody>
						</Card>
					{/if}
				{/if}
			</div>
		</div>
	{:else}
		<div class="flex flex-1 flex-col gap-3 overflow-hidden">
			<div class="flex items-center justify-between">
				<h4 class="text-base font-semibold text-slate-900 dark:text-white">
					What should BuildOS handle automatically?
				</h4>
				<Button variant="ghost" size="sm" onclick={onBackProject}>Back</Button>
			</div>
			<div class="flex-1 min-h-0 overflow-y-auto">
				<Card variant="elevated">
					<CardBody padding="md">
						<div class="space-y-2 sm:space-y-3">
							<div
								class="flex flex-wrap items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 sm:gap-2"
							>
								<span
									class="rounded-full bg-indigo-100 px-2.5 py-1 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200"
								>
									Helper: {selectedAgentLabel}
								</span>
								{#if selectedContextLabel}
									<span
										class="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
									>
										Project: {selectedContextLabel}
									</span>
								{/if}
							</div>
							<div class="space-y-2">
								<label
									for="agent-goal-input"
									class="block text-sm font-medium text-slate-800 dark:text-slate-200"
								>
									Goal for BuildOS automation
								</label>
								<textarea
									id="agent-goal-input"
									class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-purple-600 dark:focus:ring-purple-600"
									rows="3"
									value={agentGoal}
									oninput={(event) =>
										onGoalChange((event.target as HTMLTextAreaElement).value)}
									placeholder="Describe what BuildOS should try to achieve..."
								></textarea>
								<div class="flex flex-col sm:flex-row sm:items-center gap-2">
									<Button
										variant="primary"
										size="sm"
										onclick={onStartChat}
										disabled={agentGoal.trim().length === 0}
									>
										Start automation
									</Button>
									<span class="text-xs text-slate-500 dark:text-slate-400">
										BuildOS will coordinate turns automatically.
									</span>
								</div>
								<label
									class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400"
								>
									<span class="font-semibold">Turn limit</span>
									<input
										type="number"
										min="1"
										max="50"
										class="w-20 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-700"
										value={agentTurnBudget}
										oninput={(e) =>
											onTurnBudgetChange(
												Number((e.target as HTMLInputElement).value)
											)}
									/>
								</label>
							</div>
						</div>
					</CardBody>
				</Card>
			</div>
		</div>
	{/if}
</div>
