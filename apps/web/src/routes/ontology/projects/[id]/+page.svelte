<!-- apps/web/src/routes/ontology/projects/[id]/+page.svelte -->
<!--
	Ontology Project Detail Page

	Main interface for managing all entities within an ontology project:
	- Tasks (full CRUD operations)
	- Plans (create operation)
	- Goals (create operation)
	- Documents (view and create)
	- Requirements, Milestones, Risks, etc.

	Documentation:
	- 📚 Ontology System Overview: /apps/web/docs/features/ontology/README.md
	- 📊 Data Models & Schema: /apps/web/docs/features/ontology/DATA_MODELS.md
	- 🔧 Implementation Guide: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
	- 🎨 BuildOS Style Guide: /apps/web/docs/technical/components/BUILDOS_STYLE_GUIDE.md
	- 🔍 Navigation Index: /apps/web/docs/NAVIGATION_INDEX.md

	Related Components:
	- Task Management: /apps/web/src/lib/components/ontology/TaskCreateModal.svelte
	- Plan Management: /apps/web/src/lib/components/ontology/PlanCreateModal.svelte
	- Goal Management: /apps/web/src/lib/components/ontology/GoalCreateModal.svelte

	API Integration:
	- Server Data Loading: /apps/web/src/routes/ontology/projects/[id]/+page.server.ts
	- Task API: /apps/web/src/routes/api/onto/tasks/
	- Plan API: /apps/web/src/routes/api/onto/plans/
	- Goal API: /apps/web/src/routes/api/onto/goals/
-->
<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import TabNav, { type Tab } from '$lib/components/ui/TabNav.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import OutputCreateModal from '$lib/components/ontology/OutputCreateModal.svelte';
	import TaskCreateModal from '$lib/components/ontology/TaskCreateModal.svelte';
	import TaskEditModal from '$lib/components/ontology/TaskEditModal.svelte';
	import PlanCreateModal from '$lib/components/ontology/PlanCreateModal.svelte';
	import GoalCreateModal from '$lib/components/ontology/GoalCreateModal.svelte';
	import FSMStateVisualizer from '$lib/components/ontology/FSMStateVisualizer.svelte';
	import { Plus, FileEdit, Edit2, ChevronRight, Calendar, Target, FileText } from 'lucide-svelte';

	let { data } = $props();

	const project = $derived(data.project);
	const tasks = $derived(data.tasks || []);
	const outputs = $derived(data.outputs || []);
	const documents = $derived(data.documents || []);
	const plans = $derived(data.plans || []);
	const goals = $derived(data.goals || []);
	const requirements = $derived(data.requirements || []);
	const milestones = $derived(data.milestones || []);
	const risks = $derived(data.risks || []);
	const allowedTransitions = $derived(data.allowed_transitions || []);
	const initialTransitionDetails = $derived(
		allowedTransitions.map((transition: any) => ({
			event: transition.event,
			to: transition.to,
			guards: transition.guards ?? [],
			actions: transition.actions ?? []
		}))
	);

	let activeTab = $state('tasks');
	let showOutputCreateModal = $state(false);
	let showTaskCreateModal = $state(false);
	let showPlanCreateModal = $state(false);
	let showGoalCreateModal = $state(false);
	let editingTaskId = $state<string | null>(null);

	const tabs = $derived<Tab[]>([
		{ id: 'tasks', label: 'Tasks', count: tasks.length },
		{ id: 'outputs', label: 'Outputs', count: outputs.length },
		{ id: 'documents', label: 'Documents', count: documents.length },
		{ id: 'plans', label: 'Plans', count: plans.length },
		{ id: 'goals', label: 'Goals', count: goals.length },
		{
			id: 'other',
			label: 'Other',
			count: requirements.length + milestones.length + risks.length
		}
	]);

	function handleTabChange(tabId: string) {
		activeTab = tabId;
	}

	async function handleStateChange() {
		await invalidateAll();
	}

	function editOutput(outputId: string) {
		goto(`/ontology/projects/${project.id}/outputs/${outputId}/edit`);
	}

	async function handleOutputCreated(outputId: string) {
		// Reload data to show new output
		await invalidateAll();
		// Navigate to edit the new output
		goto(`/ontology/projects/${project.id}/outputs/${outputId}/edit`);
	}

	async function handleTaskCreated(taskId: string) {
		// Reload data to show new task
		await invalidateAll();
		// Optionally open the edit modal for the new task
		editingTaskId = taskId;
	}

	async function handleTaskUpdated() {
		// Reload data to show updated task
		await invalidateAll();
	}

	async function handleTaskDeleted() {
		// Reload data to remove deleted task
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>{project.name} | Ontology</title>
</svelte:head>

<div class="max-w-7xl mx-auto">
	<!-- Header -->
	<div
		class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5 mb-6"
	>
		<!-- Back button and transitions -->
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
			<Button variant="ghost" size="sm" onclick={() => goto('/ontology')}>
				<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 19l-7-7m0 0l7-7m-7 7h18"
					/>
				</svg>
				<span class="font-medium">Back to Projects</span>
			</Button>
		</div>

		<!-- Project title and metadata -->
		<div class="mb-5">
			<h1 class="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
				{project.name}
			</h1>
			<div class="flex flex-wrap items-center gap-3 mb-4">
				<span class="text-sm font-mono text-gray-500 dark:text-gray-400">
					{project.type_key}
				</span>
				<span
					class="px-3 py-1 rounded-full text-xs font-semibold capitalize {project.state_key ===
					'draft'
						? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
						: project.state_key === 'todo' || project.state_key === 'planning'
							? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
							: project.state_key === 'active' || project.state_key === 'in_progress'
								? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
								: project.state_key === 'completed' || project.state_key === 'done'
									? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
									: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}"
				>
					{project.state_key}
				</span>
				{#if project.facet_context}
					<span
						class="px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 capitalize"
					>
						{project.facet_context}
					</span>
				{/if}
				{#if project.facet_scale}
					<span
						class="px-2.5 py-1 rounded-md text-xs font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 capitalize"
					>
						{project.facet_scale}
					</span>
				{/if}
				{#if project.facet_stage}
					<span
						class="px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 capitalize"
					>
						{project.facet_stage}
					</span>
				{/if}
			</div>
			{#if project.description}
				<p class="text-gray-600 dark:text-gray-400 leading-relaxed">
					{project.description}
				</p>
			{/if}
		</div>

		<FSMStateVisualizer
			entityId={project.id}
			entityKind="project"
			entityName={project.name}
			currentState={project.state_key}
			initialTransitions={initialTransitionDetails}
			on:stateChange={handleStateChange}
		/>
	</div>

	<!-- Tabs -->
	<Card variant="elevated" padding="none">
		<TabNav
			{tabs}
			{activeTab}
			on:change={(e) => handleTabChange(e.detail)}
			ariaLabel="Project sections"
		/>
	</Card>

	<!-- Content -->
	<Card variant="elevated" padding="none" class="rounded-t-none border-t-0">
		<CardBody padding="md" class="min-h-96">
			{#if activeTab === 'tasks'}
				<div class="space-y-4">
					<!-- Create button -->
					<div class="flex justify-between items-center">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Tasks</h3>
						<Button
							variant="primary"
							size="sm"
							onclick={() => (showTaskCreateModal = true)}
						>
							<Plus class="w-4 h-4" />
							Create Task
						</Button>
					</div>

					<!-- Tasks list -->
					{#if tasks.length === 0}
						<div
							class="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg"
						>
							<Edit2 class="w-12 h-12 text-gray-400 mx-auto mb-4" />
							<p class="text-gray-600 dark:text-gray-400 mb-4">
								No tasks yet. Create your first task to get started.
							</p>
							<Button
								variant="primary"
								size="md"
								onclick={() => (showTaskCreateModal = true)}
							>
								<Plus class="w-4 h-4" />
								Create Task
							</Button>
						</div>
					{:else}
						<div class="space-y-3">
							{#each tasks as task}
								<button
									onclick={() => (editingTaskId = task.id)}
									class="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all text-left group"
								>
									<div class="flex-1 min-w-0 flex items-start gap-3">
										<Edit2
											class="w-5 h-5 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex-shrink-0 mt-0.5"
										/>
										<div class="flex-1 min-w-0">
											<h3
												class="font-semibold text-gray-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-300 mb-1"
											>
												{task.title}
											</h3>
											<div
												class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
											>
												{#if task.props?.description}
													<span class="line-clamp-1"
														>{task.props.description}</span
													>
												{/if}
												{#if task.plan_id}
													<span class="text-gray-400">•</span>
													<span
														>Plan: {plans.find(
															(p) => p.id === task.plan_id
														)?.name || 'Unknown'}</span
													>
												{/if}
											</div>
										</div>
									</div>
									<div class="flex items-center gap-2 flex-shrink-0">
										<span
											class="px-3 py-1 rounded-full text-xs font-semibold capitalize {task.state_key ===
											'todo'
												? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
												: task.state_key === 'in_progress'
													? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
													: task.state_key === 'done'
														? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
														: task.state_key === 'blocked'
															? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
															: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}"
										>
											{task.state_key}
										</span>
										{#if task.priority}
											<span
												class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs font-semibold text-gray-700 dark:text-gray-300"
											>
												P{task.priority}
											</span>
										{/if}
										<ChevronRight
											class="w-5 h-5 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400"
										/>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{:else if activeTab === 'outputs'}
				<div class="space-y-4">
					<!-- Create button -->
					<div class="flex justify-between items-center">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
							Text Documents
						</h3>
						<Button
							variant="primary"
							size="sm"
							onclick={() => (showOutputCreateModal = true)}
						>
							<Plus class="w-4 h-4" />
							Create Document
						</Button>
					</div>

					<!-- Outputs list -->
					{#if outputs.length === 0}
						<div
							class="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg"
						>
							<FileEdit class="w-12 h-12 text-gray-400 mx-auto mb-4" />
							<p class="text-gray-600 dark:text-gray-400 mb-4">
								No documents yet. Create your first document to get started.
							</p>
							<Button
								variant="primary"
								size="md"
								onclick={() => (showOutputCreateModal = true)}
							>
								<Plus class="w-4 h-4" />
								Create Document
							</Button>
						</div>
					{:else}
						<div class="space-y-3">
							{#each outputs as output}
								<button
									onclick={() => editOutput(output.id)}
									class="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all text-left group"
								>
									<div class="flex-1 min-w-0 flex items-start gap-3">
										<FileEdit
											class="w-5 h-5 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex-shrink-0 mt-0.5"
										/>
										<div class="flex-1 min-w-0">
											<h3
												class="font-semibold text-gray-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-300 mb-1"
											>
												{output.name}
											</h3>
											<div
												class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
											>
												<span>{output.type_key}</span>
												{#if output.props?.word_count}
													<span class="text-gray-400">•</span>
													<span>{output.props.word_count} words</span>
												{/if}
											</div>
										</div>
									</div>
									<span
										class="px-3 py-1 rounded-full text-xs font-semibold capitalize self-start sm:self-center {output.state_key ===
										'draft'
											? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
											: output.state_key === 'review'
												? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
												: output.state_key === 'approved'
													? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
													: output.state_key === 'published'
														? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
														: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}"
									>
										{output.state_key}
									</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{:else if activeTab === 'documents'}
				<div class="space-y-4">
					<!-- Header -->
					<div class="flex justify-between items-center">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
							Documents
						</h3>
					</div>

					{#if documents.length === 0}
						<div
							class="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg"
						>
							<FileText class="w-12 h-12 text-gray-400 mx-auto mb-4" />
							<p class="text-gray-600 dark:text-gray-400">
								No documents yet. Documents track project documentation and
								artifacts.
							</p>
						</div>
					{:else}
						<div class="space-y-3">
							{#each documents as doc}
								<div
									class="flex items-start gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
								>
									<FileText class="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
									<div class="flex-1 min-w-0">
										<h3
											class="font-semibold text-gray-900 dark:text-white mb-1"
										>
											{doc.title}
										</h3>
										<p class="text-sm text-gray-600 dark:text-gray-400">
											Type: {doc.type_key}
										</p>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else if activeTab === 'plans'}
				<div class="space-y-4">
					<!-- Create button -->
					<div class="flex justify-between items-center">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Plans</h3>
						<Button
							variant="primary"
							size="sm"
							onclick={() => (showPlanCreateModal = true)}
						>
							<Plus class="w-4 h-4" />
							Create Plan
						</Button>
					</div>

					<!-- Plans list -->
					{#if plans.length === 0}
						<div
							class="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg"
						>
							<Calendar class="w-12 h-12 text-gray-400 mx-auto mb-4" />
							<p class="text-gray-600 dark:text-gray-400 mb-4">
								No plans yet. Create your first plan to organize tasks.
							</p>
							<Button
								variant="primary"
								size="md"
								onclick={() => (showPlanCreateModal = true)}
							>
								<Plus class="w-4 h-4" />
								Create Plan
							</Button>
						</div>
					{:else}
						<div class="space-y-3">
							{#each plans as plan}
								<div
									class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
								>
									<div class="flex-1 min-w-0 flex items-start gap-3">
										<Calendar
											class="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5"
										/>
										<div class="flex-1">
											<h3
												class="font-semibold text-gray-900 dark:text-white mb-1"
											>
												{plan.name}
											</h3>
											<div
												class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
											>
												<span>{plan.type_key}</span>
												{#if plan.props?.start_date || plan.props?.end_date}
													<span class="text-gray-400">•</span>
													<span>
														{plan.props.start_date
															? new Date(
																	plan.props.start_date
																).toLocaleDateString()
															: ''}
														{plan.props.start_date &&
														plan.props.end_date
															? ' - '
															: ''}
														{plan.props.end_date
															? new Date(
																	plan.props.end_date
																).toLocaleDateString()
															: ''}
													</span>
												{/if}
											</div>
										</div>
									</div>
									<span
										class="px-3 py-1 rounded-full text-xs font-semibold capitalize self-start sm:self-center {plan.state_key ===
										'draft'
											? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
											: plan.state_key === 'planning'
												? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
												: plan.state_key === 'active'
													? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
													: plan.state_key === 'completed'
														? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
														: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}"
									>
										{plan.state_key}
									</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else if activeTab === 'goals'}
				<div class="space-y-4">
					<!-- Create button -->
					<div class="flex justify-between items-center">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Goals</h3>
						<Button
							variant="primary"
							size="sm"
							onclick={() => (showGoalCreateModal = true)}
						>
							<Plus class="w-4 h-4" />
							Create Goal
						</Button>
					</div>

					<!-- Goals list -->
					{#if goals.length === 0}
						<div
							class="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg"
						>
							<Target class="w-12 h-12 text-gray-400 mx-auto mb-4" />
							<p class="text-gray-600 dark:text-gray-400 mb-4">
								No goals yet. Define what you want to achieve.
							</p>
							<Button
								variant="primary"
								size="md"
								onclick={() => (showGoalCreateModal = true)}
							>
								<Plus class="w-4 h-4" />
								Create Goal
							</Button>
						</div>
					{:else}
						<div class="space-y-3">
							{#each goals as goal}
								<div
									class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
								>
									<div class="flex-1 min-w-0 flex items-start gap-3">
										<Target
											class="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5"
										/>
										<div class="flex-1">
											<h3
												class="font-semibold text-gray-900 dark:text-white mb-1"
											>
												{goal.name}
											</h3>
											{#if goal.props?.measurement_criteria}
												<p
													class="text-sm text-gray-600 dark:text-gray-400 line-clamp-1"
												>
													{goal.props.measurement_criteria}
												</p>
											{/if}
											<div class="flex items-center gap-2 mt-1">
												{#if goal.type_key}
													<span
														class="text-xs text-gray-500 dark:text-gray-500"
													>
														{goal.type_key}
													</span>
												{/if}
												{#if goal.props?.priority}
													<span
														class="text-xs px-2 py-0.5 rounded {goal
															.props.priority === 'high'
															? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
															: goal.props.priority === 'medium'
																? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
																: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}"
													>
														{goal.props.priority} priority
													</span>
												{/if}
											</div>
										</div>
									</div>
									{#if goal.state_key}
										<span
											class="px-3 py-1 rounded-full text-xs font-semibold capitalize self-start {goal.state_key ===
											'draft'
												? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
												: goal.state_key === 'active'
													? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
													: goal.state_key === 'on_track'
														? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
														: goal.state_key === 'at_risk'
															? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
															: goal.state_key === 'achieved'
																? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
																: goal.state_key === 'missed'
																	? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
																	: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}"
										>
											{goal.state_key}
										</span>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else if activeTab === 'other'}
				<div class="space-y-8">
					{#if requirements.length > 0}
						<div class="space-y-3">
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
								Requirements ({requirements.length})
							</h3>
							{#each requirements as req}
								<div
									class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-gray-700 dark:text-gray-300"
								>
									{req.text}
								</div>
							{/each}
						</div>
					{/if}

					{#if milestones.length > 0}
						<div class="space-y-3">
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
								Milestones ({milestones.length})
							</h3>
							{#each milestones as milestone}
								<div
									class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-gray-700 dark:text-gray-300"
								>
									{milestone.title} - {new Date(
										milestone.due_at
									).toLocaleDateString()}
								</div>
							{/each}
						</div>
					{/if}

					{#if risks.length > 0}
						<div class="space-y-3">
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
								Risks ({risks.length})
							</h3>
							{#each risks as risk}
								<div
									class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-gray-700 dark:text-gray-300"
								>
									{risk.title} ({risk.impact})
								</div>
							{/each}
						</div>
					{/if}

					{#if requirements.length === 0 && milestones.length === 0 && risks.length === 0}
						<p class="text-center py-12 text-gray-500 dark:text-gray-400">
							No other entities yet
						</p>
					{/if}
				</div>
			{/if}
		</CardBody>
	</Card>
</div>

<!-- Output Create Modal -->
{#if showOutputCreateModal}
	<OutputCreateModal
		projectId={project.id}
		onClose={() => (showOutputCreateModal = false)}
		onCreated={handleOutputCreated}
	/>
{/if}

<!-- Task Create Modal -->
{#if showTaskCreateModal}
	<TaskCreateModal
		projectId={project.id}
		{plans}
		onClose={() => (showTaskCreateModal = false)}
		onCreated={handleTaskCreated}
	/>
{/if}

<!-- Task Edit Modal -->
{#if editingTaskId}
	<TaskEditModal
		taskId={editingTaskId}
		projectId={project.id}
		{plans}
		onClose={() => (editingTaskId = null)}
		onUpdated={handleTaskUpdated}
		onDeleted={handleTaskDeleted}
	/>
{/if}

<!-- Plan Create Modal -->
{#if showPlanCreateModal}
	<PlanCreateModal
		projectId={project.id}
		onClose={() => (showPlanCreateModal = false)}
		onCreated={async () => {
			await invalidateAll();
			showPlanCreateModal = false;
		}}
	/>
{/if}

<!-- Goal Create Modal -->
{#if showGoalCreateModal}
	<GoalCreateModal
		projectId={project.id}
		onClose={() => (showGoalCreateModal = false)}
		onCreated={async () => {
			await invalidateAll();
			showGoalCreateModal = false;
		}}
	/>
{/if}
