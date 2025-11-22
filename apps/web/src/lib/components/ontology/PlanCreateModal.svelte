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
	import {
		ArrowLeft,
		Calendar,
		CheckCircle2,
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
		type_key: 'plan.basic',
		metadata: {
			category: 'Custom',
			description: 'Start with a blank canvas and tailor the plan to your workflow.',
			measurement_type: 'Manual configuration',
			typical_scope: 'Flexible timeline'
		},
		default_props: {}
	};

	const templateSource = $derived(() => {
		const list = Array.isArray(templates) ? [...templates] : [];
		if (!list.some((tpl) => tpl?.id === manualTemplateOption.id)) {
			list.push(manualTemplateOption);
		}
		return list;
	});

	const filteredTemplates = $derived(() => {
		const query = templateSearch.trim().toLowerCase();
		if (!query) return templateSource;
		return templateSource.filter((template) => {
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

	const templateCategories = $derived(() => groupTemplates(filteredTemplates));
	const templateCategoryCount = $derived(
		() => Object.keys(groupTemplates(templateSource)).length
	);

	const dateError = $derived(() => {
		if (startDate && endDate) {
			const start = new Date(startDate);
			const end = new Date(endDate);
			if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start > end) {
				return 'End date must be after the start date';
			}
		}
		return '';
	});

	const durationLabel = $derived(() => {
		const durationDays = computeDurationDays(startDate, endDate);
		return durationDays > 0
			? `${durationDays} day${durationDays === 1 ? '' : 's'}`
			: 'Flexible timeline';
	});

	const startLabel = $derived(() => formatDateOnly(startDate) ?? 'Not scheduled');
	const endLabel = $derived(() => formatDateOnly(endDate) ?? 'Not scheduled');
	const formattedStateLabel = $derived(() => formatStateLabel(stateKey));
	const canSubmit = $derived(
		Boolean(name.trim()) && Boolean(selectedTemplate) && !isSaving && !dateError
	);

	const selectedTemplateTags = $derived(() => {
		const tags = selectedTemplate?.metadata?.tags;
		if (Array.isArray(tags)) {
			return tags.slice(0, 4).map((tag) => String(tag));
		}
		return [];
	});

	$effect(() => {
		loadTemplates();
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
				type_key: selectedTemplate?.type_key || 'plan.basic',
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
	title={showTemplateSelection ? 'Plan Templates' : 'Design Plan Blueprint'}
	{onClose}
	size="xl"
	closeOnEscape={!isSaving}
>
	<div class="px-4 sm:px-6 py-6 space-y-6">
		<div
			class="rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-900/20 dark:via-indigo-900/30 dark:to-purple-900/30 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 dither-gradient"
		>
			<div>
				<p
					class="text-xs font-semibold uppercase tracking-[0.2em] text-blue-500 dark:text-blue-300"
				>
					{showTemplateSelection
						? 'Step 1 • Choose a template'
						: 'Step 2 • Configure plan details'}
				</p>
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
					{showTemplateSelection
						? 'Blueprint how your team executes'
						: 'Finalize your execution blueprint'}
				</h2>
				<p class="text-sm text-gray-700 dark:text-gray-300 max-w-2xl">
					Structure initiatives with high-density planning. Templates give you curated
					best practices, then tune scope, dates, and states before launch.
				</p>
			</div>
			<div class="flex flex-wrap gap-3">
				<div
					class="flex items-center gap-2 rounded-full bg-white/70 dark:bg-gray-900/60 border border-white/60 dark:border-gray-700 px-4 py-2 shadow-sm"
				>
					<Sparkles class="w-4 h-4 text-blue-500" />
					<span class="text-sm font-semibold text-gray-700 dark:text-gray-200">
						{templateSource.length} templates
					</span>
				</div>
				<div
					class="flex items-center gap-2 rounded-full bg-white/70 dark:bg-gray-900/60 border border-white/60 dark:border-gray-700 px-4 py-2 shadow-sm"
				>
					<Layers class="w-4 h-4 text-indigo-500" />
					<span class="text-sm font-semibold text-gray-700 dark:text-gray-200">
						{templateCategoryCount} categories
					</span>
				</div>
			</div>
		</div>

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
								<Loader class="w-8 h-8 animate-spin text-gray-400" />
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
										class="text-center py-20 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl"
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
																			class="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors"
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
												class="text-xs font-semibold uppercase tracking-[0.3em] text-blue-600 dark:text-blue-300"
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
													class="rounded-full bg-blue-50 dark:bg-blue-900/20 p-2"
												>
													<Calendar class="w-4 h-4 text-blue-600" />
												</div>
												<div>
													<p
														class="text-xs uppercase tracking-[0.4em] text-gray-400"
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
													class="rounded-lg bg-gray-50 dark:bg-gray-800/70 p-3 border border-gray-200 dark:border-gray-700"
												>
													<p
														class="text-xs uppercase tracking-[0.3em] text-gray-500"
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
													class="rounded-lg bg-gray-50 dark:bg-gray-800/70 p-3 border border-gray-200 dark:border-gray-700"
												>
													<p
														class="text-xs uppercase tracking-[0.3em] text-gray-500"
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
												class="rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800/40 px-3 py-2 flex items-start gap-2 dither-soft"
											>
												<CheckCircle2
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
														class="text-xs font-semibold text-gray-700 dark:text-gray-300 rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1"
													>
														Scope: {selectedTemplate.metadata
															.typical_scope}
													</span>
												{/if}
												{#each selectedTemplateTags as tag}
													<span
														class="text-xs font-semibold text-gray-700 dark:text-gray-300 rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1"
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
														class="font-mono text-[11px] text-gray-500"
														>{selectedTemplate?.type_key ||
															'plan.basic'}</span
													>
												</p>
											</div>
										</CardBody>
									</Card>
								</div>
							</div>

							{#if error}
								<div
									class="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/20 dark:text-red-200"
								>
									{error}
								</div>
							{/if}

							<div
								class="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3"
							>
								<Button
									variant="ghost"
									type="button"
									onclick={handleBackToTemplates}
								>
									<ArrowLeft class="w-4 h-4 mr-1" />
									Change template
								</Button>
								<Button
									type="submit"
									variant="primary"
									loading={isSaving}
									disabled={!canSubmit}
								>
									Create plan
								</Button>
							</div>
						</form>
					{/if}
				</div>
			{/key}
		</div>
	</div>
</Modal>
