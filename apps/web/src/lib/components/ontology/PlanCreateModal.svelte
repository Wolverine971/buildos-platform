<!-- apps/web/src/lib/components/ontology/PlanCreateModal.svelte -->
<!--
	Plan Creation Modal Component (2025 refresh)

	High-polish creation experience for BuildOS plans with two-phase flow:
	1. Curated template exploration (searchable, categorized)
	2. Plan blueprint configuration with live timeline insights

	Design references:
	- TaskEditModal for layout density + gradient hero
	- .claude/commands/design-update.md guidelines (Apple-style minimalism)

	Related files:
	- API Endpoint: /apps/web/src/routes/api/onto/plans/create/+server.ts
	- Task Edit Inspiration: /apps/web/src/lib/components/ontology/TaskEditModal.svelte
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import {
		ArrowLeft,
		Calendar,
		CircleCheck,
		ChevronRight,
		Clock,
		Layers,
		Loader,
		Search,
		Sparkles,
		Target
	} from 'lucide-svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';

	interface Props {
		projectId: string;
		onClose: () => void;
		onCreated?: (planId: string) => void;
	}

	let { projectId, onClose, onCreated }: Props = $props();

	let templates = $state<any[]>([]);
	let isLoadingTemplates = $state(true);
	let templateError = $state('');
	let templateSearch = $state('');
	let showTemplateSelection = $state(true);
	let slideDirection = $state<1 | -1>(1);
	let selectedTemplate = $state<any>(null);
	let isSaving = $state(false);
	let error = $state('');

	// Form fields
	let name = $state('');
	let description = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let stateKey = $state('draft');

	const stateOptions = [
		{ value: 'draft', label: 'Draft' },
		{ value: 'planning', label: 'Planning' },
		{ value: 'active', label: 'Active' },
		{ value: 'on_hold', label: 'On Hold' },
		{ value: 'completed', label: 'Completed' },
		{ value: 'cancelled', label: 'Cancelled' }
	];

	const manualTemplateOption = {
		id: '__manual_plan__',
		name: 'Design from scratch',
		type_key: 'plan.phase.base',
		metadata: {
			category: 'Custom',
			description: 'Start with a blank canvas and tailor the plan to your workflow.',
			measurement_type: 'Manual configuration',
			typical_scope: 'Flexible timeline'
		},
		default_props: {}
	};

	const templateSource = $derived.by(() => {
		const list = Array.isArray(templates) ? [...templates] : [];
		if (!list.some((tpl) => tpl?.id === manualTemplateOption.id)) {
			list.push(manualTemplateOption);
		}
		return list;
	});

	const filteredTemplates = $derived.by(() => {
		const query = templateSearch.trim().toLowerCase();
		const source = templateSource;
		if (!query) return source;
		return source.filter((template) => {
			const values = [
				template?.name,
				template?.metadata?.description,
				template?.metadata?.category,
				template?.metadata?.measurement_type,
				template?.type_key
			]
				.filter((value): value is string => Boolean(value && typeof value === 'string'))
				.map((value) => value.toLowerCase());
			return values.some((value) => value.includes(query));
		});
	});

	function groupTemplates(list: any[]): Record<string, any[]> {
		return list.reduce((acc: Record<string, any[]>, template) => {
			const category = template?.metadata?.category || 'General';
			if (!acc[category]) acc[category] = [];
			acc[category].push(template);
			return acc;
		}, {});
	}

	const templateCategories = $derived(groupTemplates(filteredTemplates));
	const templateCategoryCount = $derived(Object.keys(groupTemplates(templateSource)).length);

	const dateError = $derived.by(() => {
		if (startDate && endDate) {
			const start = new Date(startDate);
			const end = new Date(endDate);
			if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start > end) {
				return 'End date must be after the start date';
			}
		}
		return '';
	});

	const durationLabel = $derived.by(() => {
		const durationDays = computeDurationDays(startDate, endDate);
		return durationDays > 0
			? `${durationDays} day${durationDays === 1 ? '' : 's'}`
			: 'Flexible timeline';
	});

	const startLabel = $derived(formatDateOnly(startDate) ?? 'Not scheduled');
	const endLabel = $derived(formatDateOnly(endDate) ?? 'Not scheduled');
	const formattedStateLabel = $derived(formatStateLabel(stateKey));
	const canSubmit = $derived(
		Boolean(name.trim()) && Boolean(selectedTemplate) && !isSaving && !dateError
	);

	const selectedTemplateTags = $derived.by(() => {
		const tags = selectedTemplate?.metadata?.tags;
		if (Array.isArray(tags)) {
			return tags.slice(0, 4).map((tag) => String(tag));
		}
		return [];
	});

	// Load templates when modal opens (client-side only)
	$effect(() => {
		if (browser) {
			loadTemplates();
		}
	});

	async function loadTemplates() {
		try {
			isLoadingTemplates = true;
			const response = await fetch('/api/onto/templates?scope=plan');
			if (!response.ok) throw new Error('Failed to load templates');

			const data = await response.json();
			templates = data.data?.templates || [];
			templateError = '';
		} catch (err) {
			console.error('Error loading plan templates:', err);
			templateError = 'Unable to load plan templates';
		} finally {
			isLoadingTemplates = false;
		}
	}

	function applyTemplateDefaults(template: any) {
		name =
			template?.metadata?.name_pattern?.replace('{{project}}', 'Project') ||
			template?.name ||
			name;
		description =
			template?.metadata?.default_description || template?.metadata?.description || '';
		stateKey = template?.fsm?.initial || stateKey;
	}

	function selectTemplate(template: any) {
		selectedTemplate = template;
		slideDirection = 1;
		showTemplateSelection = false;
		applyTemplateDefaults(template);
	}

	function handleBackToTemplates() {
		slideDirection = -1;
		showTemplateSelection = true;
		selectedTemplate = null;
		resetForm();
	}

	function resetForm() {
		name = '';
		description = '';
		startDate = '';
		endDate = '';
		stateKey = 'draft';
		error = '';
	}

	function formatStateLabel(value: string): string {
		return value
			.split('_')
			.filter(Boolean)
			.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
			.join(' ');
	}

	function formatDateOnly(value: string | null | undefined): string | null {
		if (!value) return null;
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return null;
		return parsed.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function computeDurationDays(start: string, end: string): number {
		if (!start || !end) return 0;
		const startDateObj = new Date(start);
		const endDateObj = new Date(end);
		if (Number.isNaN(startDateObj.getTime()) || Number.isNaN(endDateObj.getTime())) return 0;
		const diff = endDateObj.getTime() - startDateObj.getTime();
		return diff > 0 ? Math.round(diff / (1000 * 60 * 60 * 24)) : 0;
	}

	async function handleSubmit(event: Event) {
		event.preventDefault();
		if (!canSubmit || !selectedTemplate) return;

		isSaving = true;
		error = '';

		try {
			const body = {
				project_id: projectId,
				type_key: selectedTemplate?.type_key || 'plan.phase.base',
				name: name.trim(),
				description: description.trim() || null,
				state_key: stateKey || 'draft',
				start_date: startDate || null,
				end_date: endDate || null,
				props: {
					description: description.trim() || null,
					start_date: startDate || null,
					end_date: endDate || null,
					...(selectedTemplate?.default_props || {})
				}
			};

			const response = await fetch('/api/onto/plans/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to create plan');
			}

			if (onCreated) {
				onCreated(result.data?.plan?.id);
			}
			onClose();
		} catch (err) {
			console.error('Error creating plan:', err);
			error = err instanceof Error ? err.message : 'Failed to create plan';
			isSaving = false;
		}
	}
</script>

<Modal
	isOpen={true}
	{onClose}
	size="xl"
	closeOnEscape={!isSaving}
	showCloseButton={false}
>
	{#snippet header()}
		<!-- Custom gradient header - grey/dark grey -->
		<div
			class="flex-shrink-0 bg-gradient-to-r from-gray-600 via-gray-700 to-gray-800 dark:from-gray-700 dark:via-gray-800 dark:to-gray-900 text-white px-3 py-3 sm:px-6 sm:py-5 flex items-start justify-between gap-2 sm:gap-4 dither-gradient"
		>
			<div class="space-y-1 sm:space-y-2 min-w-0 flex-1">
				<p class="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.3em] sm:tracking-[0.4em] text-white/70">
					{showTemplateSelection ? 'New Plan • Step 1' : 'New Plan • Step 2'}
				</p>
				<h2 class="text-lg sm:text-2xl font-bold leading-tight truncate">
					{showTemplateSelection ? 'Select Template' : (name || 'Configure Blueprint')}
				</h2>
				<div class="flex flex-wrap items-center gap-1.5 sm:gap-3 text-xs sm:text-sm">
					<span class="px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold bg-white/20">
						{templateSource.length} templates
					</span>
					<span class="hidden sm:inline px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold bg-white/20">
						{templateCategoryCount} categories
					</span>
				</div>
			</div>
			<Button
				variant="ghost"
				size="sm"
				onclick={onClose}
				class="text-white/80 hover:text-white shrink-0 !p-1.5 sm:!p-2"
				disabled={isSaving}
			>
				<svg class="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
	<div class="px-3 py-3 sm:px-6 sm:py-6 space-y-4 sm:space-y-6">

		<div class="relative min-h-[420px]">
			{#key showTemplateSelection}
				<div
					in:fly={{ x: slideDirection * 120, duration: 300, easing: cubicOut }}
					out:fly={{ x: slideDirection * -120, duration: 300, easing: cubicOut }}
					class="absolute inset-0 overflow-y-auto pr-1"
				>
					{#if showTemplateSelection}
						{#if isLoadingTemplates}
							<div class="flex items-center justify-center py-24">
								<Loader
									class="w-8 h-8 animate-spin text-gray-400 dark:text-gray-500"
								/>
							</div>
						{:else if templateError}
							<div class="text-center py-16 space-y-4">
								<p class="text-base text-red-600 dark:text-red-400">
									{templateError}
								</p>
								<Button variant="secondary" size="sm" onclick={loadTemplates}>
									Retry
								</Button>
							</div>
						{:else}
							<div class="space-y-5">
								<div
									class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
								>
									<div>
										<h3
											class="text-lg font-semibold text-gray-900 dark:text-white"
										>
											Explore templates
										</h3>
										<p class="text-sm text-gray-600 dark:text-gray-400">
											Filter by problem type, planning horizon, or go custom.
										</p>
									</div>
									<div class="w-full lg:w-72">
										<FormField
											label="Search templates"
											uppercase={false}
											showOptional={false}
										>
											<TextInput
												bind:value={templateSearch}
												placeholder="Search by name, metric, scope..."
												type="search"
												inputmode="search"
												enterkeyhint="search"
												size="sm"
												icon={Search}
											/>
										</FormField>
									</div>
								</div>

								{#if filteredTemplates.length === 0}
									<div
										class="text-center py-20 border border-dashed border-gray-300 dark:border-gray-600 rounded"
									>
										<p class="text-gray-600 dark:text-gray-400">
											No templates match that search.
										</p>
										<p class="text-sm text-gray-500 dark:text-gray-500">
											Try another keyword or start from scratch.
										</p>
									</div>
								{:else}
									<div class="space-y-6">
										{#each Object.entries(templateCategories) as [category, categoryTemplates]}
											<section class="space-y-3">
												<div class="flex items-center justify-between">
													<h4
														class="text-sm font-semibold tracking-[0.2em] uppercase text-gray-600 dark:text-gray-400"
													>
														{category}
													</h4>
													<span
														class="text-xs text-gray-500 dark:text-gray-500"
													>
														{categoryTemplates.length} option{categoryTemplates.length ===
														1
															? ''
															: 's'}
													</span>
												</div>
												<div
													class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"
												>
													{#each categoryTemplates as template}
														<button
															type="button"
															onclick={() => selectTemplate(template)}
															class="group text-left"
														>
															<Card
																variant="interactive"
																class="h-full border-2 border-transparent group-hover:border-blue-400 dark:group-hover:border-blue-500"
															>
																<CardBody class="space-y-3">
																	<div
																		class="flex items-start justify-between gap-3"
																	>
																		<div>
																			<p
																				class="text-sm uppercase tracking-[0.3em] text-gray-400 dark:text-gray-500"
																			>
																				{template.metadata
																					?.category ||
																					'General'}
																			</p>
																			<h5
																				class="text-lg font-semibold text-gray-900 dark:text-white"
																			>
																				{template.name}
																			</h5>
																		</div>
																		<ChevronRight
																			class="w-5 h-5 text-gray-400 group-hover:text-accent-blue transition-colors"
																		/>
																	</div>
																	<p
																		class="text-sm text-gray-600 dark:text-gray-300 line-clamp-3"
																	>
																		{template.metadata
																			?.description ||
																			'Structured yet flexible execution template.'}
																	</p>
																	<div
																		class="flex flex-wrap gap-2 pt-1"
																	>
																		{#if template.metadata?.typical_scope}
																			<Badge
																				size="sm"
																				variant="info"
																			>
																				<Calendar
																					class="w-3 h-3"
																					slot="icon"
																				/>
																				{template.metadata
																					.typical_scope}
																			</Badge>
																		{/if}
																		{#if template.metadata?.measurement_type}
																			<Badge
																				size="sm"
																				variant="success"
																			>
																				<Target
																					class="w-3 h-3"
																					slot="icon"
																				/>
																				{template.metadata
																					.measurement_type}
																			</Badge>
																		{/if}
																	</div>
																</CardBody>
															</Card>
														</button>
													{/each}
												</div>
											</section>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					{:else}
						<form class="space-y-6" onsubmit={handleSubmit}>
							<div class="grid gap-6 lg:grid-cols-3">
								<Card class="lg:col-span-2 shadow-lg">
									<CardHeader
										variant="gradient"
										class="flex items-center justify-between"
									>
										<div>
											<p
												class="text-xs font-semibold uppercase tracking-[0.3em] text-accent-blue"
											>
												Blueprint details
											</p>
											<h3
												class="text-xl font-semibold text-gray-900 dark:text-white"
											>
												Name, context, and timeline
											</h3>
										</div>
										<Badge variant="info" size="sm">Step 2 of 2</Badge>
									</CardHeader>
									<CardBody class="space-y-5">
										<FormField label="Plan name" labelFor="plan-name" required>
											<TextInput
												id="plan-name"
												bind:value={name}
												placeholder="e.g., Foundation Sprint, Q2 GTM Rollout"
												inputmode="text"
												enterkeyhint="next"
												required
											/>
										</FormField>

										<FormField
											label="Plan description"
											labelFor="plan-description"
											showOptional={false}
										>
											<Textarea
												id="plan-description"
												bind:value={description}
												rows={4}
												enterkeyhint="next"
												placeholder="Summarize the scope, success criteria, and how this plan ladders up to goals."
											/>
										</FormField>

										<div class="grid gap-4 sm:grid-cols-2">
											<FormField
												label="Start date"
												labelFor="plan-start"
												showOptional={false}
											>
												<TextInput
													id="plan-start"
													bind:value={startDate}
													type="date"
												/>
											</FormField>
											<FormField
												label="End date"
												labelFor="plan-end"
												error={dateError}
												showOptional={false}
											>
												<TextInput
													id="plan-end"
													bind:value={endDate}
													type="date"
												/>
											</FormField>
										</div>

										<FormField
											label="Initial state"
											labelFor="plan-state"
											showOptional={false}
										>
											<Select id="plan-state" bind:value={stateKey}>
												{#each stateOptions as option}
													<option value={option.value}
														>{option.label}</option
													>
												{/each}
											</Select>
										</FormField>
									</CardBody>
								</Card>

								<div class="space-y-4">
									<Card class="shadow-lg">
										<CardHeader class="flex items-center gap-2">
											<Clock class="w-4 h-4 text-blue-500" />
											<h4
												class="text-sm font-semibold uppercase tracking-[0.3em] text-gray-600 dark:text-gray-300"
											>
												Timeline insight
											</h4>
										</CardHeader>
										<CardBody class="space-y-3">
											<div class="flex items-center gap-3">
												<div
													class="rounded-full bg-blue-50 dark:bg-blue-900/30 p-2"
												>
													<Calendar class="w-4 h-4 text-accent-blue" />
												</div>
												<div>
													<p
														class="text-xs uppercase tracking-[0.4em] text-gray-500 dark:text-gray-400"
													>
														Duration
													</p>
													<p
														class="text-lg font-semibold text-gray-900 dark:text-white"
													>
														{durationLabel}
													</p>
												</div>
											</div>
											<div class="grid grid-cols-2 gap-3 text-sm">
												<div
													class="rounded bg-surface-panel p-3 border border-gray-200 dark:border-gray-600/30"
												>
													<p
														class="text-xs uppercase tracking-[0.3em] text-gray-500 dark:text-gray-400"
													>
														Start
													</p>
													<p
														class="font-semibold text-gray-900 dark:text-white"
													>
														{startLabel}
													</p>
												</div>
												<div
													class="rounded bg-surface-panel p-3 border border-gray-200 dark:border-gray-600/30"
												>
													<p
														class="text-xs uppercase tracking-[0.3em] text-gray-500 dark:text-gray-400"
													>
														End
													</p>
													<p
														class="font-semibold text-gray-900 dark:text-white"
													>
														{endLabel}
													</p>
												</div>
											</div>
											<div
												class="rounded bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800/40 px-3 py-2 flex items-start gap-2 dither-soft"
											>
												<CircleCheck
													class="w-4 h-4 text-green-600 mt-0.5"
												/>
												<p
													class="text-xs text-green-900 dark:text-green-200"
												>
													Keep duration realistic—plans over 45 days often
													perform better when split into phases.
												</p>
											</div>
										</CardBody>
									</Card>

									<Card class="shadow-lg">
										<CardHeader class="flex items-center gap-2">
											<Target class="w-4 h-4 text-purple-500" />
											<h4
												class="text-sm font-semibold uppercase tracking-[0.3em] text-gray-600 dark:text-gray-300"
											>
												Template guidance
											</h4>
										</CardHeader>
										<CardBody class="space-y-3">
											<p
												class="text-base font-semibold text-gray-900 dark:text-white"
											>
												{selectedTemplate?.name || 'Custom plan'}
											</p>
											<p class="text-sm text-gray-600 dark:text-gray-300">
												{selectedTemplate?.metadata?.description ||
													'Use this template as a launchpad. Layer in tasks, owners, and checkpoints after saving.'}
											</p>
											<div class="flex flex-wrap gap-2">
												{#if selectedTemplate?.metadata?.typical_scope}
													<span
														class="text-xs font-semibold text-gray-600 dark:text-gray-300 rounded-full bg-surface-panel px-3 py-1"
													>
														Scope: {selectedTemplate.metadata
															.typical_scope}
													</span>
												{/if}
												{#each selectedTemplateTags as tag}
													<span
														class="text-xs font-semibold text-gray-600 dark:text-gray-300 rounded-full bg-surface-panel px-3 py-1"
													>
														#{tag}
													</span>
												{/each}
											</div>
											<div class="text-xs text-gray-500 dark:text-gray-400">
												<p>
													State preview: <span
														class="font-semibold text-gray-900 dark:text-white"
														>{formattedStateLabel}</span
													>
												</p>
												<p>
													Type key: <span
														class="font-mono text-[11px] text-gray-500 dark:text-gray-400"
														>{selectedTemplate?.type_key ||
															'plan.phase.base'}</span
													>
												</p>
											</div>
										</CardBody>
									</Card>
								</div>
							</div>

							{#if error}
								<div
									class="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/20 dark:text-red-200"
								>
									{error}
								</div>
							{/if}

							<div
								class="flex flex-row items-center justify-between gap-2 sm:gap-3"
							>
								<Button
									variant="ghost"
									type="button"
									onclick={handleBackToTemplates}
									class="text-xs sm:text-sm px-2 sm:px-4"
								>
									<span class="hidden sm:inline">← Back</span>
									<span class="sm:hidden">←</span>
								</Button>
								<Button
									type="submit"
									variant="primary"
									loading={isSaving}
									disabled={!canSubmit}
									class="text-xs sm:text-sm px-2 sm:px-4"
								>
									<span class="hidden sm:inline">Create Plan</span>
									<span class="sm:hidden">Create</span>
								</Button>
							</div>
						</form>
					{/if}
				</div>
			{/key}
		</div>
	</div>
	{/snippet}
</Modal>
