<!-- apps/web/src/lib/components/ontology/GoalCreateModal.svelte -->
<!--
	Goal Creation Modal Component

	Creates goals within the BuildOS ontology system using a two-step flow:
	1. Template selection
	2. Goal details entry with measurement criteria

	Documentation:
	- Ontology System Overview: /apps/web/docs/features/ontology/README.md
	- Data Models & Schema: /apps/web/docs/features/ontology/DATA_MODELS.md
	- Implementation Guide: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
	- Modal Component Guide: /apps/web/docs/technical/components/modals/QUICK_REFERENCE.md

	Related Files:
	- API Endpoint: /apps/web/src/routes/api/onto/goals/create/+server.ts
	- Base Modal: /apps/web/src/lib/components/ui/Modal.svelte
	- Plan Creation: /apps/web/src/lib/components/ontology/PlanCreateModal.svelte
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import { ChevronRight, Loader, Target, Save, Sparkles } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	interface Props {
		projectId: string;
		onClose: () => void;
		onCreated?: (goalId: string) => void;
	}

	let { projectId, onClose, onCreated }: Props = $props();

	let selectedTemplate = $state<any>(null);
	let templates = $state<any[]>([]);
	let isLoadingTemplates = $state(true);
	let templateError = $state('');
	let showTemplateSelection = $state(true);
	let isSaving = $state(false);
	let error = $state('');
	let slideDirection = $state<1 | -1>(1); // 1 = slide left, -1 = slide right

	// Form fields
	let name = $state('');
	let description = $state('');
	let measurementCriteria = $state('');
	let priority = $state('medium');
	let targetDate = $state('');
	let stateKey = $state('draft');

	// Template categories for better organization
	const templateCategories = $derived(
		templates.reduce((acc: Record<string, any[]>, template) => {
			const category = template.metadata?.category || 'General';
			if (!acc[category]) acc[category] = [];
			acc[category].push(template);
			return acc;
		}, {})
	);

	// Load templates when modal opens (client-side only)
	$effect(() => {
		if (browser) {
			loadTemplates();
		}
	});

	async function loadTemplates() {
		try {
			isLoadingTemplates = true;
			const response = await fetch('/api/onto/templates?scope=goal');
			if (!response.ok) throw new Error('Failed to load templates');

			const data = await response.json();
			templates = data.data?.templates || [];
			templateError = '';
		} catch (err) {
			console.error('Error loading templates:', err);
			templateError = 'Failed to load goal templates';
		} finally {
			isLoadingTemplates = false;
		}
	}

	function selectTemplate(template: any) {
		selectedTemplate = template;
		// Pre-populate form fields with template defaults
		name = template.metadata?.name_pattern?.replace('{{project}}', 'Project') || '';
		measurementCriteria = template.default_props?.measurement_criteria || '';
		stateKey = template.fsm?.initial || 'draft';
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
				type_key: selectedTemplate?.type_key || 'goal.outcome.project',
				name: name.trim(),
				description: description.trim() || null,
				state_key: stateKey || 'draft',
				props: {
					description: description.trim() || null,
					target_date: targetDate || null,
					measurement_criteria: measurementCriteria.trim() || null,
					priority: priority || 'medium',
					...(selectedTemplate?.default_props || {})
				}
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

			// Success! Call the callback
			if (onCreated) {
				onCreated(result.data.goal.id);
			}
			onClose();
		} catch (err) {
			console.error('Error creating goal:', err);
			error = err instanceof Error ? err.message : 'Failed to create goal';
			isSaving = false;
		}
	}

	function handleBack() {
		slideDirection = -1;
		showTemplateSelection = true;
		selectedTemplate = null;
		// Reset form
		name = '';
		description = '';
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
		<!-- Inkprint header with strip texture -->
		<div
			class="flex-shrink-0 bg-muted/50 border-b border-border px-3 py-3 sm:px-6 sm:py-5 flex items-start justify-between gap-2 sm:gap-4 tx tx-strip tx-weak"
		>
			<div class="space-y-1 sm:space-y-2 min-w-0 flex-1">
				<p
					class="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.3em] sm:tracking-[0.4em] text-muted-foreground"
				>
					{showTemplateSelection ? 'New Goal' : 'Goal Details'}
				</p>
				<h2 class="text-lg sm:text-2xl font-bold leading-tight truncate text-foreground">
					{showTemplateSelection ? 'Select a Template' : name || 'Define your goal'}
				</h2>
				{#if !showTemplateSelection && selectedTemplate}
					<div class="flex flex-wrap items-center gap-1.5 sm:gap-3 text-xs sm:text-sm">
						<span
							class="px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold bg-accent/20 text-accent-foreground"
							>{selectedTemplate.name}</span
						>
					</div>
				{/if}
			</div>
			<Button
				variant="ghost"
				size="sm"
				onclick={handleClose}
				class="text-muted-foreground hover:text-foreground shrink-0 !p-1.5 sm:!p-2"
				disabled={isSaving}
			>
				<svg
					class="w-4 h-4 sm:w-5 sm:h-5"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					></path>
				</svg>
			</Button>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="px-3 py-3 sm:px-6 sm:py-6">
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
							<div class="space-y-6">
								<!-- Header -->
								<div class="flex items-center gap-3 pb-4 border-b border-border">
									<div class="p-2 rounded bg-muted tx tx-bloom tx-weak">
										<Target class="w-5 h-5 text-accent" />
									</div>
									<div>
										<h3 class="text-lg font-semibold text-foreground">
											Choose a Goal Template
										</h3>
										<p class="text-sm text-muted-foreground">
											Select a goal type to define success criteria and
											tracking
										</p>
									</div>
								</div>

								{#if isLoadingTemplates}
									<div class="flex items-center justify-center py-16">
										<Loader
											class="w-8 h-8 animate-spin text-muted-foreground"
										/>
									</div>
								{:else if templateError}
									<div class="text-center py-12">
										<p class="text-destructive mb-4">
											{templateError}
										</p>
										<Button variant="secondary" onclick={loadTemplates}
											>Try Again</Button
										>
									</div>
								{:else}
									<div class="space-y-6">
										{#each Object.entries(templateCategories) as [category, categoryTemplates]}
											<div>
												<h3
													class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2"
												>
													<span class="w-1.5 h-1.5 bg-accent rounded-full"
													></span>
													{category}
												</h3>
												<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
													{#each categoryTemplates as template}
														<button
															type="button"
															onclick={() => selectTemplate(template)}
															class="bg-card border border-border p-4 rounded-lg text-left group hover:border-accent shadow-ink transition-all duration-200"
														>
															<div
																class="flex items-start justify-between mb-2"
															>
																<h4
																	class="font-semibold text-foreground group-hover:text-accent transition-colors"
																>
																	{template.name}
																</h4>
																<ChevronRight
																	class="w-5 h-5 text-muted-foreground group-hover:text-accent flex-shrink-0 transition-transform group-hover:translate-x-0.5"
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
																	class="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-muted rounded"
																>
																	<Target
																		class="w-3 h-3 text-accent"
																	/>
																	<span
																		class="text-xs font-medium text-foreground"
																	>
																		{template.metadata
																			.measurement_type}
																	</span>
																</div>
															{/if}
														</button>
													{/each}
												</div>
											</div>
										{/each}

										{#if templates.length === 0}
											<div
												class="text-center py-12 border-2 border-dashed border-border rounded-lg"
											>
												<Target
													class="w-12 h-12 text-muted-foreground mx-auto mb-3"
												/>
												<p class="text-sm text-muted-foreground">
													No goal templates available
												</p>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						{:else}
							<!-- GOAL DETAILS FORM -->
							<form class="space-y-6" onsubmit={handleSubmit}>
								<!-- Selected Template Badge -->
								{#if selectedTemplate}
									<div
										class="rounded-lg border border-border bg-muted/30 p-4 tx tx-grain tx-weak"
									>
										<div class="flex items-center justify-between gap-3">
											<div class="flex items-center gap-3 flex-1 min-w-0">
												<div class="p-2 rounded bg-card shadow-ink">
													<Target class="w-4 h-4 text-accent" />
												</div>
												<div class="flex-1 min-w-0">
													<h4
														class="text-sm font-semibold text-foreground"
													>
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
									label="Goal Name"
									labelFor="name"
									required={true}
									error={!name.trim() && error ? 'Goal name is required' : ''}
								>
									<TextInput
										id="name"
										bind:value={name}
										placeholder="Enter goal name..."
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
										placeholder="Describe what you want to achieve..."
										enterkeyhint="next"
										rows={3}
										disabled={isSaving}
										size="md"
									/>
								</FormField>

								<!-- Success Criteria -->
								<FormField
									label="Success Criteria"
									labelFor="measurement_criteria"
									hint="How will you measure success?"
								>
									<Textarea
										id="measurement_criteria"
										bind:value={measurementCriteria}
										placeholder="e.g., 'Complete 5 tasks per week', 'Increase revenue by 20%'"
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
											<option value="high">High Priority</option>
											<option value="medium">Medium Priority</option>
											<option value="low">Low Priority</option>
										</Select>
									</FormField>

									<FormField
										label="Initial State"
										labelFor="state"
										required={true}
									>
										<Select
											id="state"
											bind:value={stateKey}
											disabled={isSaving}
											size="md"
											placeholder="Select state"
										>
											<option value="draft">Draft</option>
											<option value="active">Active</option>
											<option value="on_track">On Track</option>
											<option value="at_risk">At Risk</option>
											<option value="achieved">Achieved</option>
											<option value="missed">Missed</option>
										</Select>
									</FormField>
								</div>

								<!-- Target Date -->
								<FormField
									label="Target Date"
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
										class="p-4 bg-destructive/10 border border-destructive/30 rounded-lg"
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
	{/snippet}

	<!-- Footer Actions - buttons on one row, smaller on mobile -->
	{#snippet footer()}
		<div
			class="flex flex-row items-center justify-between gap-2 sm:gap-4 p-2 sm:p-6 border-t border-border bg-muted/30"
		>
			{#if showTemplateSelection}
				<div class="flex-1"></div>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={handleClose}
					class="text-xs sm:text-sm px-2 sm:px-4"
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
					class="text-xs sm:text-sm px-2 sm:px-4"
				>
					<span class="hidden sm:inline">← Back</span>
					<span class="sm:hidden">←</span>
				</Button>
				<div class="flex flex-row items-center gap-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onclick={handleClose}
						disabled={isSaving}
						class="text-xs sm:text-sm px-2 sm:px-4"
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
						class="text-xs sm:text-sm px-2 sm:px-4"
					>
						<Save class="w-3 h-3 sm:w-4 sm:h-4" />
						<span class="hidden sm:inline">Create Goal</span>
						<span class="sm:hidden">Create</span>
					</Button>
				</div>
			{/if}
		</div>
	{/snippet}
</Modal>
