<!-- apps/web/src/lib/components/ontology/MilestoneCreateModal.svelte -->
<!--
	Milestone Creation Modal Component

	Creates milestones within the BuildOS ontology system.
	Milestones are always linked to a parent goal.

	Flow:
	1. Select which goal this milestone belongs to (or pre-selected via goalId prop)
	2. Fill in milestone details
	3. Create milestone with edge linking to goal

	Documentation:
	- Ontology System Overview: /apps/web/docs/features/ontology/README.md
	- Data Models & Schema: /apps/web/docs/features/ontology/DATA_MODELS.md
	- Milestones Under Goals Spec: /thoughts/shared/research/2026-01-16_milestones-under-goals-ux-proposal.md
	- Modal Component Guide: /apps/web/docs/technical/components/modals/QUICK_REFERENCE.md

	Related Files:
	- API Endpoint: /apps/web/src/routes/api/onto/milestones/create/+server.ts
	- Base Modal: /apps/web/src/lib/components/ui/Modal.svelte
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import {
		ChevronLeft,
		ChevronRight,
		Flag,
		Save,
		Target,
		Calendar,
		Search,
		CheckCircle2,
		X
	} from '$lib/icons/lucide';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { MILESTONE_STATES } from '$lib/types/onto';
	import { parseDateFromInput } from '$lib/utils/date-utils';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';

	interface Goal {
		id: string;
		name: string;
		state_key: string;
		description?: string | null;
	}

	interface Props {
		projectId: string;
		goals: Goal[];
		goalId?: string | null;
		goalName?: string | null;
		onClose: () => void;
		onCreated?: (milestoneId: string) => void;
	}

	let { projectId, goals, goalId = null, goalName = null, onClose, onCreated }: Props = $props();
	const initialGoalContext = untrack(() => ({
		hasGoalContext: Boolean(goalId),
		goalId,
		goalName
	}));

	// When goalId is provided, skip goal selection
	const hasGoalContext = $derived(Boolean(goalId));

	// Current step: 'goal-selection' or 'form'
	let currentStep = $state<'goal-selection' | 'form'>(
		initialGoalContext.hasGoalContext ? 'form' : 'goal-selection'
	);

	// Selected goal
	let selectedGoalId = $state<string | null>(initialGoalContext.goalId);
	let selectedGoalName = $state<string | null>(initialGoalContext.goalName);

	// Search/filter for goals
	let goalSearchQuery = $state('');

	// Filter goals based on search and exclude terminal states
	const filteredGoals = $derived.by(() => {
		// Only show active goals (not achieved or abandoned)
		const activeGoals = goals.filter(
			(g) => g.state_key !== 'achieved' && g.state_key !== 'abandoned'
		);

		if (!goalSearchQuery.trim()) return activeGoals;

		const query = goalSearchQuery.toLowerCase();
		return activeGoals.filter(
			(g) =>
				g.name.toLowerCase().includes(query) ||
				(g.description && g.description.toLowerCase().includes(query))
		);
	});

	// State options for milestone
	const STATE_OPTIONS = MILESTONE_STATES.map((state) => ({
		value: state,
		label:
			state === 'pending'
				? 'Pending'
				: state === 'in_progress'
					? 'In progress'
					: state === 'completed'
						? 'Completed'
						: state === 'missed'
							? 'Missed'
							: state,
		description:
			state === 'pending'
				? 'Not yet started'
				: state === 'in_progress'
					? 'Work is underway'
					: state === 'completed'
						? 'Successfully completed'
						: 'Deadline was not met'
	}));

	let isSaving = $state(false);
	let error = $state('');
	let slideDirection = $state<1 | -1>(1);

	// Form fields
	let title = $state('');
	let description = $state('');
	let milestoneDetails = $state('');
	let dueAt = $state('');
	let stateKey = $state('pending');

	// Human label for a goal state key (e.g. in_progress -> In progress)
	function formatGoalState(state: string): string {
		const words = state.replace(/_/g, ' ');
		return words.charAt(0).toUpperCase() + words.slice(1);
	}

	function selectGoal(goal: Goal) {
		selectedGoalId = goal.id;
		selectedGoalName = goal.name;
		slideDirection = 1;
		currentStep = 'form';
	}

	function handleBack() {
		slideDirection = -1;
		currentStep = 'goal-selection';
		// Reset form
		title = '';
		description = '';
		milestoneDetails = '';
		dueAt = '';
		stateKey = 'pending';
		error = '';
	}

	async function handleSubmit(e: Event): Promise<void> {
		e.preventDefault();

		if (!selectedGoalId) {
			error = 'Please select a goal first';
			return;
		}

		if (!title.trim()) {
			error = 'Milestone title is required';
			return;
		}

		isSaving = true;
		error = '';

		try {
			let dueDateIso: string | null = null;
			if (dueAt && dueAt.trim()) {
				dueDateIso = parseDateFromInput(dueAt);
				if (!dueDateIso) {
					error = 'Due date must be a valid date';
					isSaving = false;
					return;
				}
			}

			const requestBody: Record<string, unknown> = {
				project_id: projectId,
				title: title.trim(),
				milestone: milestoneDetails.trim() || null,
				due_at: dueDateIso,
				state_key: stateKey || 'pending',
				description: description.trim() || null,
				classification_source: 'create_modal',
				goal_id: selectedGoalId
			};

			const response = await fetch('/api/onto/milestones/create', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody)
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to create milestone');
			}

			// Success! Call the callback
			if (onCreated) {
				onCreated(result.data.milestone.id);
			}
			onClose();
		} catch (err) {
			console.error('Error creating milestone:', err);
			void logOntologyClientError(err, {
				endpoint: '/api/onto/milestones/create',
				method: 'POST',
				projectId,
				entityType: 'milestone',
				operation: 'milestone_create'
			});
			error = err instanceof Error ? err.message : 'Failed to create milestone';
			isSaving = false;
		}
	}

	function handleClose() {
		onClose();
	}
</script>

<Modal
	isOpen={true}
	onClose={handleClose}
	size="xl"
	closeOnEscape={!isSaving}
	showCloseButton={false}
>
	{#snippet header()}
		<!-- Compact Inkprint header -->
		<div
			class="flex-shrink-0 bg-muted border-b border-border px-3 py-2 sm:px-4 flex items-center justify-between gap-2 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div
					class="flex h-9 w-9 items-center justify-center shrink-0 text-muted-foreground"
				>
					<Flag class="w-5 h-5" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-medium leading-tight truncate text-foreground"
					>
						{title || 'New milestone'}
					</h2>
					{#if selectedGoalName}
						<p class="text-2xs sm:text-xs text-muted-foreground truncate">
							For goal: <span class="text-foreground/80">{selectedGoalName}</span>
						</p>
					{:else}
						<p class="text-2xs sm:text-xs text-muted-foreground">
							Select a goal to add this milestone to
						</p>
					{/if}
				</div>
			</div>
			<button
				type="button"
				onclick={handleClose}
				disabled={isSaving}
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
				aria-label="Close modal"
			>
				<X class="w-5 h-5" />
			</button>
		</div>
	{/snippet}

	<div class="px-2 py-2 sm:px-6 sm:py-4">
		<!-- Horizontal Slide Animation Between Views -->
		<div class="relative overflow-hidden" style="min-height: 380px;">
			{#key currentStep}
				<div
					in:fly={{ x: slideDirection * 100, duration: 300, easing: cubicOut }}
					out:fly={{ x: slideDirection * -100, duration: 300, easing: cubicOut }}
					class="absolute inset-0 overflow-y-auto"
				>
					{#if currentStep === 'goal-selection'}
						<!-- GOAL SELECTION VIEW -->
						<div class="space-y-3 sm:space-y-4">
							<!-- Header -->
							<div class="flex items-center gap-3 pb-4 border-b border-border">
								<Target class="w-5 h-5 shrink-0 text-muted-foreground" />
								<div>
									<h3 class="text-lg font-medium text-foreground">
										Select a goal
									</h3>
									<p class="text-sm text-muted-foreground">
										Milestones mark meaningful progress toward a goal
									</p>
								</div>
							</div>

							<!-- Search -->
							{#if goals.length > 5}
								<div class="relative">
									<Search
										class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
									/>
									<input
										type="text"
										bind:value={goalSearchQuery}
										placeholder="Search goals"
										class="w-full pl-10 pr-3 py-2.5 rounded-lg border border-border bg-background text-foreground
											focus:outline-none focus:ring-2 focus:ring-ring focus:border-accent"
									/>
								</div>
							{/if}

							<!-- Goals List -->
							<div class="space-y-2">
								{#if filteredGoals.length === 0}
									<div
										class="p-6 text-center bg-muted rounded-lg tx tx-bloom tx-weak"
									>
										{#if goals.length === 0}
											<Target
												class="w-8 h-8 mx-auto mb-2 text-muted-foreground"
											/>
											<p class="text-sm text-muted-foreground">
												No goals available
											</p>
											<p class="text-xs text-muted-foreground/70 mt-1">
												Create a goal first to add milestones
											</p>
										{:else if goalSearchQuery}
											<Search
												class="w-8 h-8 mx-auto mb-2 text-muted-foreground"
											/>
											<p class="text-sm text-muted-foreground">
												No goals match "{goalSearchQuery}"
											</p>
										{:else}
											<CheckCircle2
												class="w-8 h-8 mx-auto mb-2 text-muted-foreground"
											/>
											<p class="text-sm text-muted-foreground">
												All goals are completed or abandoned
											</p>
											<p class="text-xs text-muted-foreground/70 mt-1">
												Create a new active goal to add milestones
											</p>
										{/if}
									</div>
								{:else}
									{#each filteredGoals as goal (goal.id)}
										<button
											type="button"
											onclick={() => selectGoal(goal)}
											class="w-full bg-card border border-border p-3 sm:p-4 rounded-lg text-left group hover:border-foreground/20 hover:bg-muted/50 transition-colors tx tx-frame tx-weak"
										>
											<div class="flex items-center justify-between gap-3">
												<div class="flex items-center gap-3 min-w-0 flex-1">
													<Target
														class="w-4 h-4 shrink-0 text-muted-foreground"
													/>
													<div class="min-w-0 flex-1">
														<h4
															class="font-medium text-foreground truncate"
														>
															{goal.name}
														</h4>
														{#if goal.description}
															<p
																class="text-xs text-muted-foreground line-clamp-1 mt-1"
															>
																{goal.description}
															</p>
														{/if}
													</div>
												</div>
												<div class="flex items-center gap-2 shrink-0">
													<span class="text-xs text-muted-foreground">
														{formatGoalState(goal.state_key)}
													</span>
													<ChevronRight
														class="w-5 h-5 text-muted-foreground group-hover:text-foreground"
													/>
												</div>
											</div>
										</button>
									{/each}
								{/if}
							</div>
						</div>
					{:else}
						<!-- MILESTONE DETAILS FORM -->
						<form class="space-y-3 sm:space-y-4" onsubmit={handleSubmit}>
							<!-- Selected Goal Badge -->
							{#if selectedGoalName}
								<div
									class="rounded-lg border border-border bg-muted p-3 sm:p-4 tx tx-grain tx-weak"
								>
									<div class="flex items-center justify-between gap-3">
										<div class="flex items-center gap-3 flex-1 min-w-0">
											<Target
												class="w-4 h-4 shrink-0 text-muted-foreground"
											/>
											<div class="flex-1 min-w-0">
												<p class="text-xs text-muted-foreground">Goal</p>
												<h4
													class="text-sm font-medium text-foreground truncate"
												>
													{selectedGoalName}
												</h4>
											</div>
										</div>
										{#if !hasGoalContext}
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onclick={handleBack}
												class="shrink-0"
											>
												Change
											</Button>
										{/if}
									</div>
								</div>
							{/if}

							<!-- Milestone Title -->
							<FormField
								label="Title"
								labelFor="title"
								required={true}
								error={!title.trim() && error ? 'Milestone title is required' : ''}
							>
								<TextInput
									id="title"
									bind:value={title}
									placeholder="What needs to be achieved?"
									inputmode="text"
									enterkeyhint="next"
									required={true}
									disabled={isSaving}
									error={!title.trim() && error ? true : false}
									size="md"
								/>
							</FormField>

							<!-- Due Date -->
							<FormField
								label="Due date"
								labelFor="due_at"
								required={false}
								error={error && error.toLowerCase().includes('date') ? error : ''}
							>
								<div class="relative">
									<Calendar
										class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
									/>
									<input
										type="date"
										id="due_at"
										bind:value={dueAt}
										class="w-full pl-10 pr-3 py-2.5 rounded-lg border bg-background text-foreground
											{!dueAt && error ? 'border-destructive' : 'border-border'}
											focus:outline-none focus:ring-2 focus:ring-ring focus:border-accent
											disabled:opacity-50 disabled:cursor-not-allowed"
										disabled={isSaving}
									/>
								</div>
							</FormField>

							<!-- Description -->
							<FormField
								label="Description"
								labelFor="description"
								hint="Describe what this milestone represents"
							>
								<Textarea
									id="description"
									bind:value={description}
									placeholder="What does achieving this milestone mean for the goal?"
									enterkeyhint="next"
									rows={3}
									disabled={isSaving}
									size="md"
								/>
							</FormField>

							<FormField label="Details" labelFor="milestone_details">
								<Textarea
									id="milestone_details"
									bind:value={milestoneDetails}
									placeholder="Extra context or success criteria"
									enterkeyhint="next"
									rows={3}
									disabled={isSaving}
									size="md"
								/>
							</FormField>

							<!-- Initial State -->
							<FormField label="Initial state" labelFor="state" required={true}>
								<Select
									id="state"
									bind:value={stateKey}
									disabled={isSaving}
									size="md"
									placeholder="Select state"
								>
									{#each STATE_OPTIONS as opt (opt.value)}
										<option value={opt.value}
											>{opt.label} - {opt.description}</option
										>
									{/each}
								</Select>
							</FormField>

							{#if error}
								<div
									class="p-4 bg-destructive/10 border border-destructive/30 rounded-lg tx tx-static tx-weak"
								>
									<p class="text-sm text-destructive">
										{error}
									</p>
								</div>
							{/if}
						</form>
					{/if}
				</div>
			{/key}
		</div>
	</div>

	<!-- Footer Actions -->
	{#snippet footer()}
		<div
			class="flex flex-row items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-3 border-t border-border bg-muted/50"
		>
			{#if currentStep === 'goal-selection'}
				<div class="flex-1"></div>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={handleClose}
					class="text-xs sm:text-sm px-2 sm:px-4 tx tx-grain tx-weak"
				>
					Cancel
				</Button>
			{:else}
				{#if !hasGoalContext}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onclick={handleBack}
						disabled={isSaving}
						class="text-xs sm:text-sm px-2 sm:px-4 tx tx-grain tx-weak"
					>
						<ChevronLeft class="w-4 h-4" />
						<span class="hidden sm:inline">Back</span>
					</Button>
				{:else}
					<div></div>
				{/if}
				<div class="flex flex-row items-center gap-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onclick={handleClose}
						disabled={isSaving}
						class="text-xs sm:text-sm px-2 sm:px-4 tx tx-grain tx-weak"
					>
						Cancel
					</Button>
					<Button
						type="submit"
						variant="primary"
						size="sm"
						disabled={isSaving || !title.trim() || !selectedGoalId}
						onclick={handleSubmit}
						loading={isSaving}
						class="text-xs sm:text-sm px-2 sm:px-4 tx tx-grain tx-weak"
					>
						<Save class="w-3 h-3 sm:w-4 sm:h-4" />
						<span class="hidden sm:inline">Create milestone</span>
						<span class="sm:hidden">Create</span>
					</Button>
				</div>
			{/if}
		</div>
	{/snippet}
</Modal>
