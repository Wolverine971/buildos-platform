<!-- apps/web/src/lib/components/ontology/GoalCreateModal.svelte -->
<!--
	Goal Creation Modal Component (Auto-Classified)
	Creates goals without type selection; type_key is classified after creation.

	Related Files:
	- API Endpoint: /apps/web/src/routes/api/onto/goals/create/+server.ts
-->
<script lang="ts">
	import { ChevronLeft, ChevronRight, Target, Save, X } from '$lib/icons/lucide';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { GOAL_STATES } from '$lib/types/onto';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';

	// Hardcoded goal types (templates removed)
	interface GoalType {
		id: string;
		name: string;
		type_key: string;
		metadata: {
			category: string;
			description: string;
			measurement_type?: string;
		};
	}

	const GOAL_TYPES: GoalType[] = [
		{
			id: 'outcome',
			name: 'Project outcome',
			type_key: 'goal.outcome.project',
			metadata: {
				category: 'Outcomes',
				description: 'Define the desired end result for your project',
				measurement_type: 'Milestone completion'
			}
		},
		{
			id: 'okr',
			name: 'OKR (objective and key results)',
			type_key: 'goal.outcome.okr',
			metadata: {
				category: 'Strategic',
				description: 'Set measurable objectives with key results',
				measurement_type: 'Percentage progress'
			}
		},
		{
			id: 'milestone',
			name: 'Milestone goal',
			type_key: 'goal.outcome.milestone',
			metadata: {
				category: 'Milestones',
				description: 'Track progress toward a specific milestone',
				measurement_type: 'Binary completion'
			}
		},
		{
			id: 'metric',
			name: 'Metric goal',
			type_key: 'goal.outcome.metric',
			metadata: {
				category: 'Metrics',
				description: 'Track a quantifiable metric over time',
				measurement_type: 'Numeric target'
			}
		}
	];

	interface Props {
		projectId: string;
		onClose: () => void;
		onCreated?: (goalId: string) => void;
	}

	let { projectId, onClose, onCreated }: Props = $props();

	let selectedTemplate = $state<GoalType | null>(null);
	let showTemplateSelection = $state(false);
	let isSaving = $state(false);
	let error = $state('');
	let slideDirection = $state<1 | -1>(1);

	// Form fields
	let name = $state('');
	let description = $state('');
	let goalDetails = $state('');
	let measurementCriteria = $state('');
	let priority = $state('medium');
	let targetDate = $state('');
	let stateKey = $state('draft');

	// Group types by category
	const templateCategories = $derived(
		GOAL_TYPES.reduce((acc: Record<string, GoalType[]>, template) => {
			const category = template.metadata.category || 'General';
			if (!acc[category]) acc[category] = [];
			acc[category].push(template);
			return acc;
		}, {})
	);

	function selectTemplate(template: GoalType) {
		selectedTemplate = template;
		name = '';
		goalDetails = '';
		measurementCriteria = '';
		stateKey = 'draft';
		slideDirection = 1;
		showTemplateSelection = false;
	}

	async function handleSubmit(e: Event): Promise<void> {
		e.preventDefault();

		if (!name.trim()) {
			error = 'Goal name is required';
			return;
		}

		isSaving = true;
		error = '';

		try {
			const requestBody = {
				project_id: projectId,
				name: name.trim(),
				goal: goalDetails.trim() || null,
				description: description.trim() || null,
				state_key: stateKey || 'draft',
				target_date: targetDate || null,
				measurement_criteria: measurementCriteria.trim() || null,
				priority: priority || 'medium',
				classification_source: 'create_modal'
			};

			const response = await fetch('/api/onto/goals/create', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody)
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to create goal');
			}

			if (onCreated) {
				onCreated(result.data.goal.id);
			}
			onClose();
		} catch (err) {
			console.error('Error creating goal:', err);
			void logOntologyClientError(err, {
				endpoint: '/api/onto/goals/create',
				method: 'POST',
				projectId,
				entityType: 'goal',
				operation: 'goal_create'
			});
			error = err instanceof Error ? err.message : 'Failed to create goal';
			isSaving = false;
		}
	}

	function handleBack() {
		slideDirection = -1;
		showTemplateSelection = true;
		selectedTemplate = null;
		name = '';
		description = '';
		goalDetails = '';
		measurementCriteria = '';
		priority = 'medium';
		targetDate = '';
		stateKey = 'draft';
		error = '';
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
			class="flex-shrink-0 bg-muted border-b border-border px-2 py-2 sm:px-4 flex items-center justify-between gap-2 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div class="flex h-9 w-9 items-center justify-center shrink-0">
					<Target class="w-5 h-5 text-muted-foreground" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-medium leading-tight truncate text-foreground"
					>
						{name || 'New goal'}
					</h2>
					<p class="text-2xs sm:text-xs text-muted-foreground mt-0.5">
						Type will be auto-classified
					</p>
				</div>
			</div>
			<button
				type="button"
				onclick={handleClose}
				disabled={isSaving}
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 tx tx-grain tx-weak"
				aria-label="Close modal"
			>
				<X class="w-5 h-5" />
			</button>
		</div>
	{/snippet}

	<div class="px-2 py-2 sm:px-6 sm:py-4">
		<!-- Horizontal Slide Animation Between Views -->
		<div class="relative overflow-hidden" style="min-height: 400px;">
			{#key showTemplateSelection}
				<div
					in:fly={{ x: slideDirection * 100, duration: 300, easing: cubicOut }}
					out:fly={{ x: slideDirection * -100, duration: 300, easing: cubicOut }}
					class="absolute inset-0 overflow-y-auto"
				>
					{#if showTemplateSelection}
						<!-- TEMPLATE SELECTION VIEW -->
						<div class="space-y-3 sm:space-y-4">
							<!-- Header -->
							<div class="flex items-center gap-3 pb-4 border-b border-border">
								<Target class="w-5 h-5 shrink-0 text-muted-foreground" />
								<h3 class="text-lg font-medium text-foreground">
									Choose a goal type
								</h3>
							</div>

							<div class="space-y-4 sm:space-y-6">
								{#each Object.entries(templateCategories) as [category, categoryTemplates] (category)}
									<div>
										<h3 class="text-xs font-medium text-muted-foreground mb-3">
											{category}
										</h3>
										<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
											{#each categoryTemplates as template (template.id)}
												<button
													type="button"
													onclick={() => selectTemplate(template)}
													class="bg-card border border-border p-3 sm:p-4 rounded-lg text-left group hover:border-foreground/20 hover:bg-muted/50 transition-colors duration-200 tx tx-frame tx-weak"
												>
													<div
														class="flex items-start justify-between mb-2"
													>
														<h4 class="font-medium text-foreground">
															{template.name}
														</h4>
														<ChevronRight
															class="w-5 h-5 text-muted-foreground group-hover:text-foreground flex-shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0.5"
														/>
													</div>
													{#if template.metadata?.description}
														<p
															class="text-sm text-muted-foreground line-clamp-2 mb-2"
														>
															{template.metadata.description}
														</p>
													{/if}
													{#if template.metadata?.measurement_type}
														<div
															class="mt-2 inline-flex items-center gap-1 px-2 py-1 bg-muted rounded-lg"
														>
															<Target
																class="w-3 h-3 text-muted-foreground"
															/>
															<span
																class="text-xs text-muted-foreground"
															>
																{template.metadata.measurement_type}
															</span>
														</div>
													{/if}
												</button>
											{/each}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{:else}
						<!-- GOAL DETAILS FORM -->
						<form class="space-y-3 sm:space-y-4" onsubmit={handleSubmit}>
							<!-- Selected Template Badge -->
							{#if selectedTemplate}
								<div
									class="rounded-xl border border-border bg-muted p-3 sm:p-4 tx tx-grain tx-weak"
								>
									<div class="flex items-center justify-between gap-3">
										<div class="flex items-center gap-3 flex-1 min-w-0">
											<Target
												class="w-4 h-4 shrink-0 text-muted-foreground"
											/>
											<div class="flex-1 min-w-0">
												<h4 class="text-sm font-medium text-foreground">
													{selectedTemplate.name}
												</h4>
												{#if selectedTemplate.metadata?.description}
													<p
														class="text-xs text-muted-foreground truncate"
													>
														{selectedTemplate.metadata.description}
													</p>
												{/if}
											</div>
										</div>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onclick={handleBack}
											class="shrink-0"
										>
											Change
										</Button>
									</div>
								</div>
							{/if}

							<!-- Goal Name -->
							<FormField
								label="Name"
								labelFor="name"
								required={true}
								error={!name.trim() && error ? 'Goal name is required' : ''}
							>
								<TextInput
									id="name"
									bind:value={name}
									placeholder="Goal name"
									inputmode="text"
									enterkeyhint="next"
									required={true}
									disabled={isSaving}
									error={!name.trim() && error ? true : false}
									size="md"
								/>
							</FormField>

							<!-- Description -->
							<FormField
								label="Description"
								labelFor="description"
								hint="Describe what you want to achieve"
							>
								<Textarea
									id="description"
									bind:value={description}
									placeholder="e.g. Launch the beta to 50 users"
									enterkeyhint="next"
									rows={3}
									disabled={isSaving}
									size="md"
								/>
							</FormField>

							<FormField
								label="Details"
								labelFor="goal_details"
								hint="Optional extended goal statement"
							>
								<Textarea
									id="goal_details"
									bind:value={goalDetails}
									placeholder="Context or notes"
									enterkeyhint="next"
									rows={3}
									disabled={isSaving}
									size="md"
								/>
							</FormField>

							<!-- Success Criteria -->
							<FormField
								label="Success criteria"
								labelFor="measurement_criteria"
								hint="How will you measure success?"
							>
								<Textarea
									id="measurement_criteria"
									bind:value={measurementCriteria}
									placeholder="e.g. Increase revenue by 20%"
									enterkeyhint="next"
									rows={2}
									disabled={isSaving}
									size="md"
								/>
							</FormField>

							<!-- Priority & State Grid -->
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<FormField label="Priority" labelFor="priority" required={true}>
									<Select
										id="priority"
										bind:value={priority}
										disabled={isSaving}
										size="md"
										placeholder="Select priority"
									>
										<option value="high">High</option>
										<option value="medium">Medium</option>
										<option value="low">Low</option>
									</Select>
								</FormField>

								<FormField label="Initial state" labelFor="state" required={true}>
									<Select
										id="state"
										bind:value={stateKey}
										disabled={isSaving}
										size="md"
										placeholder="Select state"
									>
										{#each GOAL_STATES as state (state)}
											<option value={state}>
												{state.charAt(0).toUpperCase() + state.slice(1)}
											</option>
										{/each}
									</Select>
								</FormField>
							</div>

							<!-- Target Date -->
							<FormField
								label="Target date"
								labelFor="target_date"
								hint="Optional deadline for achieving this goal"
							>
								<TextInput
									id="target_date"
									type="date"
									bind:value={targetDate}
									disabled={isSaving}
									size="md"
								/>
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

	<!-- Footer Actions - buttons on one row, smaller on mobile -->
	{#snippet footer()}
		<div
			class="flex flex-row items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-3 border-t border-border bg-muted/50"
		>
			{#if showTemplateSelection}
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
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={handleBack}
					disabled={isSaving}
					aria-label="Back"
					class="text-xs sm:text-sm px-2 sm:px-4 tx tx-grain tx-weak"
				>
					<ChevronLeft class="w-3 h-3 sm:w-4 sm:h-4" />
					<span class="hidden sm:inline">Back</span>
				</Button>
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
						disabled={isSaving || !name.trim()}
						onclick={handleSubmit}
						loading={isSaving}
						class="text-xs sm:text-sm px-2 sm:px-4 tx tx-grain tx-weak"
					>
						<Save class="w-3 h-3 sm:w-4 sm:h-4" />
						<span class="hidden sm:inline">Create goal</span>
						<span class="sm:hidden">Create</span>
					</Button>
				</div>
			{/if}
		</div>
	{/snippet}
</Modal>
