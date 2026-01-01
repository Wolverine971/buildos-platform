<!-- apps/web/src/lib/components/ontology/PlanCreateModal.svelte -->
<!--
	Plan Creation Modal Component (Template-Free)
	Creates plans without template selection - uses type_key directly

	Related files:
	- API Endpoint: /apps/web/src/routes/api/onto/plans/create/+server.ts
-->
<script lang="ts">
	import { Calendar, CircleCheck, ChevronRight, Clock, Search, Target } from 'lucide-svelte';
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
	import { PLAN_STATES } from '$lib/types/onto';

	// Hardcoded plan types (templates removed)
	interface PlanType {
		id: string;
		name: string;
		type_key: string;
		metadata: {
			category: string;
			description: string;
			measurement_type?: string;
			typical_scope?: string;
		};
	}

	const PLAN_TYPES: PlanType[] = [
		{
			id: 'sprint',
			name: 'Sprint',
			type_key: 'plan.timebox.sprint',
			metadata: {
				category: 'Timebox',
				description: 'Time-boxed iteration for focused execution',
				measurement_type: 'Velocity tracking',
				typical_scope: '1-4 weeks'
			}
		},
		{
			id: 'phase',
			name: 'Project Phase',
			type_key: 'plan.phase.project',
			metadata: {
				category: 'Phase',
				description: 'Major phase of a larger project',
				measurement_type: 'Milestone completion',
				typical_scope: '1-3 months'
			}
		},
		{
			id: 'quarter',
			name: 'Quarterly Plan',
			type_key: 'plan.roadmap.strategy',
			metadata: {
				category: 'Roadmap',
				description: 'Quarter-level planning and OKR tracking',
				measurement_type: 'OKR progress',
				typical_scope: '3 months'
			}
		},
		{
			id: 'custom',
			name: 'Custom Plan',
			type_key: 'plan.process.base',
			metadata: {
				category: 'Process',
				description: 'Flexible plan structure for any workflow',
				measurement_type: 'Manual tracking',
				typical_scope: 'Flexible'
			}
		}
	];

	interface Props {
		projectId: string;
		onClose: () => void;
		onCreated?: (planId: string) => void;
	}

	let { projectId, onClose, onCreated }: Props = $props();

	let templateSearch = $state('');
	let showTemplateSelection = $state(true);
	let slideDirection = $state<1 | -1>(1);
	let selectedTemplate = $state<PlanType | null>(null);
	let isSaving = $state(false);
	let error = $state('');

	// Form fields
	let name = $state('');
	let description = $state('');
	let planDetails = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let stateKey = $state('draft');

	const stateOptions = PLAN_STATES.map((state) => ({
		value: state,
		label: formatStateLabel(state)
	}));

	const filteredTemplates = $derived.by(() => {
		const query = templateSearch.trim().toLowerCase();
		if (!query) return PLAN_TYPES;
		return PLAN_TYPES.filter((template) => {
			const values = [
				template.name,
				template.metadata.description,
				template.metadata.category,
				template.metadata.measurement_type,
				template.type_key
			]
				.filter((value): value is string => Boolean(value && typeof value === 'string'))
				.map((value) => value.toLowerCase());
			return values.some((value) => value.includes(query));
		});
	});

	function groupTemplates(list: PlanType[]): Record<string, PlanType[]> {
		return list.reduce((acc: Record<string, PlanType[]>, template) => {
			const category = template.metadata.category || 'General';
			if (!acc[category]) acc[category] = [];
			acc[category].push(template);
			return acc;
		}, {});
	}

	const templateCategories = $derived(groupTemplates(filteredTemplates));

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

	function applyTemplateDefaults(template: PlanType) {
		name = template.name || name;
		description = template.metadata.description || '';
		planDetails = '';
		stateKey = 'draft';
	}

	function selectTemplate(template: PlanType) {
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
		planDetails = '';
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
				type_key: selectedTemplate.type_key,
				name: name.trim(),
				plan: planDetails.trim() || null,
				description: description.trim() || null,
				state_key: stateKey || 'draft',
				start_date: startDate || null,
				end_date: endDate || null,
				props: {
					plan: planDetails.trim() || null,
					description: description.trim() || null,
					start_date: startDate || null,
					end_date: endDate || null
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

<Modal isOpen={true} {onClose} size="xl" closeOnEscape={!isSaving} showCloseButton={false}>
	{#snippet header()}
		<!-- Compact Inkprint header -->
		<div
			class="flex-shrink-0 bg-muted/50 border-b border-border px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div class="p-1.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
					<Clock class="w-4 h-4" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						{showTemplateSelection ? 'New Plan' : name || 'New Plan'}
					</h2>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
						{showTemplateSelection ? 'Select a template' : 'Configure your plan'}
					</p>
				</div>
			</div>
			<Button
				variant="ghost"
				size="sm"
				onclick={onClose}
				class="text-muted-foreground hover:text-foreground shrink-0 !p-1 sm:!p-1.5"
				disabled={isSaving}
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
							<div class="space-y-5">
								<div
									class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
								>
									<div>
										<h3 class="text-lg font-semibold text-foreground">
											Explore templates
										</h3>
										<p class="text-sm text-muted-foreground">
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
										class="text-center py-20 border border-dashed border-border rounded-lg"
									>
										<p class="text-muted-foreground">
											No templates match that search.
										</p>
										<p class="text-sm text-muted-foreground">
											Try another keyword or start from scratch.
										</p>
									</div>
								{:else}
									<div class="space-y-6">
										{#each Object.entries(templateCategories) as [category, categoryTemplates]}
											<section class="space-y-3">
												<div class="flex items-center justify-between">
													<h4
														class="text-sm font-semibold tracking-[0.2em] uppercase text-muted-foreground"
													>
														{category}
													</h4>
													<span class="text-xs text-muted-foreground">
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
																class="h-full border border-border group-hover:border-accent shadow-ink"
															>
																<CardBody class="space-y-3">
																	<div
																		class="flex items-start justify-between gap-3"
																	>
																		<div>
																			<p
																				class="text-sm uppercase tracking-[0.3em] text-muted-foreground"
																			>
																				{template.metadata
																					?.category ||
																					'General'}
																			</p>
																			<h5
																				class="text-lg font-semibold text-foreground"
																			>
																				{template.name}
																			</h5>
																		</div>
																		<ChevronRight
																			class="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors"
																		/>
																	</div>
																	<p
																		class="text-sm text-muted-foreground line-clamp-3"
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
						{:else}
							<form class="space-y-6" onsubmit={handleSubmit}>
								<div class="grid gap-6 lg:grid-cols-3">
									<Card class="lg:col-span-2 shadow-ink">
										<CardHeader
											class="flex items-center justify-between border-b border-border bg-muted/30 tx tx-frame tx-weak"
										>
											<div>
												<p
													class="text-xs font-semibold uppercase tracking-[0.3em] text-accent"
												>
													Blueprint details
												</p>
												<h3 class="text-xl font-semibold text-foreground">
													Name, context, and timeline
												</h3>
											</div>
											<Badge variant="info" size="sm">Step 2 of 2</Badge>
										</CardHeader>
										<CardBody class="space-y-5">
											<FormField
												label="Plan name"
												labelFor="plan-name"
												required
											>
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

											<FormField
												label="Plan details"
												labelFor="plan-details"
												hint="Optional execution notes or outline"
												showOptional={true}
											>
												<Textarea
													id="plan-details"
													bind:value={planDetails}
													rows={4}
													enterkeyhint="next"
													placeholder="Capture the execution outline, milestones, or runbook details..."
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
										<Card class="shadow-ink">
											<CardHeader
												class="flex items-center gap-2 border-b border-border"
											>
												<Clock class="w-4 h-4 text-accent" />
												<h4
													class="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground"
												>
													Timeline insight
												</h4>
											</CardHeader>
											<CardBody class="space-y-3">
												<div class="flex items-center gap-3">
													<div class="rounded-full bg-muted p-2">
														<Calendar class="w-4 h-4 text-accent" />
													</div>
													<div>
														<p
															class="text-xs uppercase tracking-[0.4em] text-muted-foreground"
														>
															Duration
														</p>
														<p
															class="text-lg font-semibold text-foreground"
														>
															{durationLabel}
														</p>
													</div>
												</div>
												<div class="grid grid-cols-2 gap-3 text-sm">
													<div
														class="rounded bg-muted/50 p-3 border border-border"
													>
														<p
															class="text-xs uppercase tracking-[0.3em] text-muted-foreground"
														>
															Start
														</p>
														<p class="font-semibold text-foreground">
															{startLabel}
														</p>
													</div>
													<div
														class="rounded bg-muted/50 p-3 border border-border"
													>
														<p
															class="text-xs uppercase tracking-[0.3em] text-muted-foreground"
														>
															End
														</p>
														<p class="font-semibold text-foreground">
															{endLabel}
														</p>
													</div>
												</div>
											</CardBody>
										</Card>

										<Card class="shadow-ink">
											<CardHeader
												class="flex items-center gap-2 border-b border-border"
											>
												<Target class="w-4 h-4 text-accent" />
												<h4
													class="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground"
												>
													Template guidance
												</h4>
											</CardHeader>
											<CardBody class="space-y-3">
												<p class="text-base font-semibold text-foreground">
													{selectedTemplate?.name || 'Custom plan'}
												</p>
												<p class="text-sm text-muted-foreground">
													{selectedTemplate?.metadata?.description ||
														'A flexible plan structure for your workflow.'}
												</p>
												<div class="flex flex-wrap gap-2">
													{#if selectedTemplate?.metadata?.typical_scope}
														<span
															class="text-xs font-semibold text-foreground rounded-full bg-muted px-3 py-1"
														>
															Scope: {selectedTemplate.metadata
																.typical_scope}
														</span>
													{/if}
												</div>
												<div class="text-xs text-muted-foreground">
													<p>
														State preview: <span
															class="font-semibold text-foreground"
															>{formattedStateLabel}</span
														>
													</p>
													<p>
														Type key: <span
															class="font-mono text-[11px] text-muted-foreground"
															>{selectedTemplate?.type_key ||
																'plan.process.base'}</span
														>
													</p>
												</div>
											</CardBody>
										</Card>
									</div>
								</div>

								{#if error}
									<div
										class="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
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
