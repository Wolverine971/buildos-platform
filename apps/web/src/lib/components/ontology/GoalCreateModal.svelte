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

	// Load templates when modal opens
	$effect(() => {
		loadTemplates();
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
				type_key: selectedTemplate?.type_key || 'goal.basic',
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
	title={showTemplateSelection ? 'Create New Goal' : 'Goal Details'}
	onClose={handleClose}
	size="xl"
	closeOnEscape={!isSaving}
>
	<div class="px-4 sm:px-6 py-6">
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
							<div
								class="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-gray-700"
							>
								<div
									class="p-2 rounded-lg bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/50 dark:to-pink-950/50"
								>
									<Target class="w-5 h-5 text-purple-600 dark:text-purple-400" />
								</div>
								<div>
									<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
										Choose a Goal Template
									</h3>
									<p class="text-sm text-gray-600 dark:text-gray-400">
										Select a goal type to define success criteria and tracking
									</p>
								</div>
							</div>

							{#if isLoadingTemplates}
								<div class="flex items-center justify-center py-16">
									<Loader class="w-8 h-8 animate-spin text-gray-400" />
								</div>
							{:else if templateError}
								<div class="text-center py-12">
									<p class="text-red-600 dark:text-red-400 mb-4">
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
												class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3 flex items-center gap-2"
											>
												<span class="w-1.5 h-1.5 bg-purple-500 rounded-full"
												></span>
												{category}
											</h3>
											<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
												{#each categoryTemplates as template}
													<button
														type="button"
														onclick={() => selectTemplate(template)}
														class="p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-purple-500 dark:hover:border-purple-400 hover:bg-gradient-to-br hover:from-purple-50 hover:to-pink-50 dark:hover:from-purple-950/20 dark:hover:to-pink-950/20 transition-all duration-300 text-left group shadow-sm hover:shadow-md"
													>
														<div
															class="flex items-start justify-between mb-2"
														>
															<h4
																class="font-semibold text-gray-900 dark:text-white group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors"
															>
																{template.name}
															</h4>
															<ChevronRight
																class="w-5 h-5 text-gray-400 group-hover:text-purple-600 dark:group-hover:text-purple-400 flex-shrink-0 transition-transform group-hover:translate-x-0.5"
															/>
														</div>
														{#if template.metadata?.description}
															<p
																class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2"
															>
																{template.metadata.description}
															</p>
														{/if}
														{#if template.metadata?.measurement_type}
															<div
																class="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 dark:bg-purple-900/30 rounded-full"
															>
																<Target
																	class="w-3 h-3 text-purple-600 dark:text-purple-400"
																/>
																<span
																	class="text-xs font-medium text-purple-700 dark:text-purple-300"
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
											class="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl"
										>
											<Target class="w-12 h-12 text-gray-400 mx-auto mb-3" />
											<p class="text-sm text-gray-500 dark:text-gray-400">
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
									class="rounded-xl border border-purple-200 dark:border-purple-800 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 p-4"
								>
									<div class="flex items-center justify-between gap-3">
										<div class="flex items-center gap-3 flex-1 min-w-0">
											<div
												class="p-2 rounded-lg bg-white/80 dark:bg-gray-800/80 shadow-sm"
											>
												<Target
													class="w-4 h-4 text-purple-600 dark:text-purple-400"
												/>
											</div>
											<div class="flex-1 min-w-0">
												<h4
													class="text-sm font-semibold text-purple-900 dark:text-purple-100"
												>
													{selectedTemplate.name}
												</h4>
												{#if selectedTemplate.metadata?.description}
													<p
														class="text-xs text-purple-700 dark:text-purple-300 truncate"
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

								<FormField label="Initial State" labelFor="state" required={true}>
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
									class="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
								>
									<p class="text-sm text-red-700 dark:text-red-300">
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
	<svelte:fragment slot="footer">
		<div
			class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/50 dark:to-gray-800/50"
		>
			{#if showTemplateSelection}
				<div class="flex-1"></div>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={handleClose}
					class="w-full sm:w-auto"
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
					class="w-full sm:w-auto"
				>
					← Back to Templates
				</Button>
				<div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onclick={handleClose}
						disabled={isSaving}
						class="w-full sm:w-auto"
					>
						Cancel
					</Button>
					<Button
						type="submit"
						variant="primary"
						size="sm"
						disabled={isSaving || !name.trim()}
						onclick={handleSubmit}
						class="w-full sm:w-auto"
					>
						{#if isSaving}
							<Loader class="w-4 h-4 animate-spin" />
							Creating...
						{:else}
							<Save class="w-4 h-4" />
							Create Goal
						{/if}
					</Button>
				</div>
			{/if}
		</div>
	</svelte:fragment>
</Modal>
