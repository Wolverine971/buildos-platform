<!-- apps/web/src/lib/components/ontology/PlanEditModal.svelte -->
<!--
	Plan Edit Modal Component (2025 refresh)

	High-fidelity plan workspace inspired by TaskEditModal. Provides:
	- Rich hero header with plan metadata + live timeline metrics
	- Dual-column layout: form + insights
	- FSM state visualizer or manual state selection
	- Linked task snapshot and safe danger zone

	Related Files:
	- API Endpoints: /apps/web/src/routes/api/onto/plans/[id]/+server.ts
	- Create Modal: /apps/web/src/lib/components/ontology/PlanCreateModal.svelte
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import {
		ChevronDown,
		Clock,
		Loader,
		Save,
		Trash2,
		X,
		FileText,
		CalendarRange
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import RichMarkdownEditor from '$lib/components/ui/RichMarkdownEditor.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import LinkedEntities from './linked-entities/LinkedEntities.svelte';
	import TagsDisplay from './TagsDisplay.svelte';
	import EntityActivityLog from './EntityActivityLog.svelte';
	import EntityCommentsSection from './EntityCommentsSection.svelte';
	import ImageAssetsPanel from './ImageAssetsPanel.svelte';
	import { PLAN_STATES, type Plan } from '$lib/types/onto';
	import type { EntityKind, LinkedEntitiesResult } from './linked-entities/linked-entities.types';
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import GoalEditModal from './GoalEditModal.svelte';
	import TaskEditModal from './TaskEditModal.svelte';
	import DocumentModal from './DocumentModal.svelte';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import { normalizeMarkdownInput } from '$lib/utils/markdown-normalization';

	type PlanModalProps = Plan['props'] & {
		description?: string;
		plan?: string;
		start_date?: string;
		end_date?: string;
		tags?: string[];
	};

	type LoadedPlan = Omit<Plan, 'props'> & {
		props: PlanModalProps;
		project?: { name?: string | null } | null;
	};

	// Lazy-loaded AgentChatModal for better initial load performance

	type AgentChatModalLazy =
		| typeof import('$lib/components/agent/AgentChatModal.svelte').default
		| null;
	let AgentChatModalComponent = $state<AgentChatModalLazy>(null);

	async function loadAgentChatModal() {
		if (!AgentChatModalComponent) {
			const mod = await import('$lib/components/agent/AgentChatModal.svelte');
			AgentChatModalComponent = mod.default;
		}
		return AgentChatModalComponent;
	}

	interface Props {
		planId: string;
		projectId: string;
		onClose: () => void;
		onUpdated?: () => void;
		onDeleted?: () => void;
	}

	let { planId, projectId, onClose, onUpdated, onDeleted }: Props = $props();

	let modalOpen = $state(true);
	let plan = $state<LoadedPlan | null>(null);
	let linkedEntities = $state<LinkedEntitiesResult | undefined>(undefined);
	let isLoading = $state(true);
	let isSaving = $state(false);
	let isDeleting = $state(false);
	let error = $state('');
	let showDeleteConfirm = $state(false);
	let hasChanges = $state(false);

	// Form fields
	let name = $state('');
	let description = $state('');
	let planDetails = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let stateKey = $state('draft');
	let typeKey = $state('plan.default');

	// Modal states for linked entity navigation
	let showGoalModal = $state(false);
	let selectedGoalIdForModal = $state<string | null>(null);
	let showTaskModal = $state(false);
	let selectedTaskIdForModal = $state<string | null>(null);
	let showDocumentModal = $state(false);
	let selectedDocumentIdForModal = $state<string | null>(null);
	let showChatModal = $state(false);
	let showActivityLog = $state(false);

	type SurfaceBadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent';

	const PLAN_STATE_META: Record<
		string,
		{ label: string; variant: SurfaceBadgeVariant; note: string }
	> = {
		draft: { label: 'Draft', variant: 'default', note: 'Not yet started.' },
		active: { label: 'Active', variant: 'info', note: 'Currently in execution.' },
		completed: { label: 'Completed', variant: 'success', note: 'Plan fulfilled.' }
	};

	const stateMeta = $derived(
		PLAN_STATE_META[stateKey] ?? {
			label: stateKey,
			variant: 'default' as SurfaceBadgeVariant,
			note: ''
		}
	);
	const detailsFormId = $derived(`plan-edit-${planId}-details`);

	function parsePlanDateInput(value: string | null | undefined): Date | null {
		if (!value) return null;
		const date = new Date(`${value}T00:00:00`);
		return Number.isNaN(date.getTime()) ? null : date;
	}

	function formatPlanDate(value: string | null | undefined, fallback = 'Not set'): string {
		const date = parsePlanDateInput(value);
		if (!date) return fallback;

		return date.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatRecordDate(value: string | null | undefined, fallback = '—'): string {
		if (!value) return fallback;
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return fallback;

		return date.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatPlanTypeLabel(value: string | null | undefined): string {
		if (!value || value === 'plan.default') return 'General plan';

		return value
			.replace(/^plan\./, '')
			.split(/[._]/)
			.filter(Boolean)
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	}

	function normalizePlanDetails(value: string | null | undefined): string {
		return normalizeMarkdownInput(value) ?? '';
	}

	const dateError = $derived.by(() => {
		if (startDate && endDate) {
			const start = new Date(startDate);
			const end = new Date(endDate);
			if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start > end) {
				return 'End date must be after start date';
			}
		}
		return '';
	});

	const planTypeLabel = $derived.by(() => formatPlanTypeLabel(typeKey || plan?.type_key));
	const timelineSummary = $derived.by(() => {
		if (startDate && endDate) {
			return `${formatPlanDate(startDate)} to ${formatPlanDate(endDate)}`;
		}

		if (startDate) return `Starts ${formatPlanDate(startDate)}`;
		if (endDate) return `Ends ${formatPlanDate(endDate)}`;
		return 'No timeline defined yet';
	});
	const timelineMeta = $derived.by(() => {
		if (dateError) {
			return {
				label: 'Date issue',
				variant: 'error' as SurfaceBadgeVariant
			};
		}

		if (stateKey === 'completed') {
			return {
				label: 'Completed',
				variant: 'success' as SurfaceBadgeVariant
			};
		}

		if (startDate || endDate) {
			return {
				label: 'Scheduled',
				variant: 'info' as SurfaceBadgeVariant
			};
		}

		return null;
	});

	// Build focus for chat about this plan
	const entityFocus = $derived.by((): ProjectFocus | null => {
		if (!plan || !projectId) return null;
		return {
			focusType: 'plan',
			focusEntityId: planId,
			focusEntityName: plan.name || 'Untitled Plan',
			projectId: projectId,
			projectName: plan.project?.name || 'Project'
		};
	});

	const formDisabled = $derived(isSaving || isDeleting);

	// Load plan data when modal opens (client-side only)
	$effect(() => {
		if (browser) {
			loadPlan();
		}
	});

	async function loadPlan() {
		try {
			isLoading = true;
			// Use /full endpoint for optimized single-request loading
			const response = await fetch(`/api/onto/plans/${planId}/full`);
			if (!response.ok) throw new Error('Failed to load plan');

			const data = await response.json();
			plan = (data.data?.plan ?? null) as LoadedPlan | null;
			linkedEntities = data.data?.linkedEntities;

			if (plan) {
				name = plan.name || '';
				description = plan.description || plan.props?.description || '';
				planDetails = normalizePlanDetails(plan.plan || plan.props?.plan || '');
				startDate = plan.props?.start_date || '';
				endDate = plan.props?.end_date || '';
				stateKey = plan.state_key || 'draft';
				typeKey = plan.type_key || 'plan.default';
			}
		} catch (err) {
			console.error('Error loading plan:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/plans/${planId}/full`,
				method: 'GET',
				projectId,
				entityType: 'plan',
				entityId: planId,
				operation: 'plan_load'
			});
			error = 'Failed to load plan';
		} finally {
			isLoading = false;
		}
	}

	async function handleSave() {
		if (!name.trim()) {
			error = 'Plan name is required';
			return;
		}

		if (dateError) {
			error = dateError;
			return;
		}

		isSaving = true;
		error = '';

		try {
			const requestBody = {
				name: name.trim(),
				plan: normalizePlanDetails(planDetails).trim() || null,
				description: description.trim() || null,
				start_date: startDate || null,
				end_date: endDate || null,
				state_key: stateKey,
				type_key: typeKey || 'plan.default'
			};

			const response = await fetch(`/api/onto/plans/${planId}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody)
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to update plan');
			}

			if (onUpdated) {
				onUpdated();
			}
			onClose();
		} catch (err) {
			console.error('Error updating plan:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/plans/${planId}`,
				method: 'PATCH',
				projectId,
				entityType: 'plan',
				entityId: planId,
				operation: 'plan_update'
			});
			error = err instanceof Error ? err.message : 'Failed to update plan';
			isSaving = false;
		}
	}

	async function handleDelete() {
		isDeleting = true;
		error = '';

		try {
			const response = await fetch(`/api/onto/plans/${planId}`, {
				method: 'DELETE'
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to delete plan');
			}

			if (onDeleted) {
				onDeleted();
			}
			onClose();
		} catch (err) {
			console.error('Error deleting plan:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/plans/${planId}`,
				method: 'DELETE',
				projectId,
				entityType: 'plan',
				entityId: planId,
				operation: 'plan_delete'
			});
			error = err instanceof Error ? err.message : 'Failed to delete plan';
			isDeleting = false;
			showDeleteConfirm = false;
		}
	}

	function handleClose() {
		modalOpen = false;
		onClose?.();
	}

	// Linked entity click handler
	function handleLinkedEntityClick(kind: EntityKind, id: string) {
		switch (kind) {
			case 'goal':
				selectedGoalIdForModal = id;
				showGoalModal = true;
				break;
			case 'task':
				selectedTaskIdForModal = id;
				showTaskModal = true;
				break;
			case 'document':
				selectedDocumentIdForModal = id;
				showDocumentModal = true;
				break;
			default:
				console.warn(`Unhandled entity kind: ${kind}`);
		}
	}

	function closeLinkedEntityModals() {
		showGoalModal = false;
		showTaskModal = false;
		showDocumentModal = false;
		selectedGoalIdForModal = null;
		selectedTaskIdForModal = null;
		selectedDocumentIdForModal = null;
		// Smart refresh: only reload if links were changed
		if (hasChanges) {
			loadPlan();
			hasChanges = false;
		}
	}

	function handleLinksChanged() {
		hasChanges = true;
	}

	// Chat about this plan handlers
	async function openChatAbout() {
		if (!plan || !projectId) return;
		await loadAgentChatModal();
		showChatModal = true;
	}

	function handleChatClose() {
		showChatModal = false;
	}
</script>

<Modal
	bind:isOpen={modalOpen}
	size="xl"
	onClose={handleClose}
	closeOnEscape={!isSaving && !isDeleting}
	showCloseButton={false}
	customClasses="wt-plate"
>
	{#snippet header()}
		<!-- Compact Inkprint header -->
		<div
			class="flex-shrink-0 bg-muted border-b border-border px-2 py-1.5 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div
					class="flex h-9 w-9 items-center justify-center rounded bg-accent/10 text-accent shrink-0"
				>
					<Clock class="w-5 h-5" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						{name || plan?.name || 'Plan'}
					</h2>
					<div class="mt-1 flex flex-wrap items-center gap-1.5">
						<Badge variant={stateMeta.variant} size="sm">{stateMeta.label}</Badge>
					</div>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-1">
						{#if plan?.created_at}Created {new Date(plan.created_at).toLocaleDateString(
								undefined,
								{ month: 'short', day: 'numeric' }
							)}{/if}{#if plan?.updated_at && plan.updated_at !== plan.created_at}
							· Updated {new Date(plan.updated_at).toLocaleDateString(undefined, {
								month: 'short',
								day: 'numeric'
							})}{/if}
					</p>
				</div>
			</div>
			<div class="flex items-center gap-1.5">
				<!-- Chat about this plan button -->
				<button
					type="button"
					onclick={openChatAbout}
					disabled={isLoading || isSaving || !plan}
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:border-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
					title="Chat about this plan"
				>
					<img
						src="/brain-bolt.png"
						alt="Chat about this plan"
						class="w-6 h-6 rounded object-cover"
					/>
				</button>
				<!-- Close button -->
				<button
					type="button"
					onclick={handleClose}
					disabled={isSaving || isDeleting}
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:bg-card hover:border-red-500/50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:hover:border-red-400/50 dark:hover:text-red-400"
					aria-label="Close modal"
				>
					<X class="w-5 h-5" />
				</button>
			</div>
		</div>
	{/snippet}

	{#snippet children()}
		<!-- Main content -->
		<div class="px-2 py-2 sm:px-4 sm:py-4">
			{#if isLoading}
				<div class="flex items-center justify-center py-12">
					<Loader class="w-8 h-8 animate-spin text-muted-foreground" />
				</div>
			{:else if !plan}
				<div class="text-center py-8">
					<p class="text-destructive">Plan not found</p>
				</div>
			{:else}
				<div class="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
					<!-- Main Form (Left 2 columns) -->
					<div class="lg:col-span-2">
						<form
							id={detailsFormId}
							onsubmit={(e) => {
								e.preventDefault();
								handleSave();
							}}
							class="space-y-3 sm:space-y-4"
						>
							<Card variant="elevated" class="wt-paper">
								<CardHeader variant="accent" texture="strip">
									<div
										class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
									>
										<div class="min-w-0">
											<div class="flex items-center gap-2">
												<FileText class="h-4 w-4 text-accent" />
												<p
													class="text-xs font-semibold uppercase tracking-[0.18em] text-accent"
												>
													Overview
												</p>
											</div>
											<h3 class="mt-1 text-sm font-semibold text-foreground">
												What this plan covers and its expected outcome
											</h3>
											<p class="mt-1 text-xs text-muted-foreground">
												Lead with the name and context so the plan reads
												clearly before adjusting execution details.
											</p>
										</div>
									</div>
								</CardHeader>
								<CardBody class="space-y-4">
									<FormField
										label="Name"
										labelFor="plan-name"
										required={true}
										uppercase={false}
										showOptional={false}
										error={!name.trim() && error ? 'Required' : ''}
									>
										<TextInput
											id="plan-name"
											bind:value={name}
											inputmode="text"
											enterkeyhint="next"
											placeholder="Plan name..."
											required={true}
											disabled={formDisabled}
											error={!name.trim() && error ? true : false}
										/>
									</FormField>

									<FormField
										label="Description"
										labelFor="plan-description"
										uppercase={false}
										showOptional={false}
									>
										<Textarea
											id="plan-description"
											bind:value={description}
											enterkeyhint="next"
											rows={3}
											placeholder="Objectives and target outcomes..."
											disabled={formDisabled}
											size="md"
										/>
									</FormField>

									<div class="h-[22rem] sm:h-[26rem] lg:h-[30rem]">
										<RichMarkdownEditor
											id="plan-details"
											label="Details"
											bind:value={planDetails}
											placeholder="Execution outline, milestones, runbook..."
											disabled={formDisabled}
											maxLength={50000}
											size="base"
											fillHeight={true}
											helpText="Markdown supported"
											onSave={handleSave}
											voiceNoteSource="plan-edit-modal"
											voiceNoteLinkedEntityType="plan"
											voiceNoteLinkedEntityId={planId}
										/>
									</div>
								</CardBody>
							</Card>

							{#if error}
								<div
									class="rounded-lg border border-destructive/30 bg-destructive/10 p-3 shadow-ink-inner"
								>
									<p class="text-sm text-destructive">{error}</p>
								</div>
							{/if}
						</form>
					</div>

					<!-- Sidebar (Right column) -->
					<div class="space-y-3">
						<Card variant="elevated" class="wt-card">
							<CardHeader variant="muted" texture="strip">
								<div class="flex items-center justify-between gap-3">
									<div>
										<p
											class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
										>
											Controls
										</p>
										<h3 class="mt-1 text-sm font-semibold text-foreground">
											Plan operations
										</h3>
									</div>
								</div>
							</CardHeader>
							<CardBody padding="none">
								<div class="divide-y divide-border/70">
									<section
										class="px-3 py-3 sm:px-4"
										aria-label="Workflow: {stateMeta.label}"
									>
										<div class="flex items-center gap-2">
											<FileText class="h-4 w-4 text-muted-foreground" />
											<p
												class="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
											>
												Workflow
											</p>
										</div>

										<div class="mt-2 space-y-2">
											<div
												class="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2"
											>
												<label
													for="plan-state"
													class="text-xs font-medium text-muted-foreground"
												>
													State
												</label>
												<Select
													id="plan-state"
													bind:value={stateKey}
													disabled={formDisabled}
													size="sm"
												>
													{#each PLAN_STATES as state}
														<option value={state}>
															{state === 'draft'
																? 'Draft'
																: state === 'active'
																	? 'Active'
																	: state === 'completed'
																		? 'Completed'
																		: state}
														</option>
													{/each}
												</Select>
											</div>

											<p class="text-xs text-muted-foreground">
												{stateMeta.note}
											</p>
										</div>
									</section>

									<section
										class={dateError
											? 'px-3 py-3 sm:px-4 tx tx-static tx-weak'
											: 'px-3 py-3 sm:px-4'}
										aria-label="Timeline: {timelineSummary}"
									>
										<div class="flex items-center justify-between gap-2">
											<div class="flex items-center gap-2">
												<CalendarRange
													class="h-4 w-4 text-muted-foreground"
												/>
												<p
													class="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
												>
													Timeline
												</p>
											</div>
											{#if timelineMeta}
												<Badge variant={timelineMeta.variant} size="sm"
													>{timelineMeta.label}</Badge
												>
											{/if}
										</div>

										{#if dateError}
											<div
												class="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2"
											>
												<p class="text-xs font-semibold text-destructive">
													{dateError}
												</p>
											</div>
										{/if}

										<div class="mt-2 grid grid-cols-1 gap-2">
											<div
												class="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2"
											>
												<label
													for="plan-start"
													class="text-xs font-medium text-muted-foreground"
												>
													Start
												</label>
												<TextInput
													id="plan-start"
													bind:value={startDate}
													type="date"
													inputmode="numeric"
													enterkeyhint="next"
													disabled={formDisabled}
													size="sm"
												/>
											</div>

											<div
												class="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2"
											>
												<label
													for="plan-end"
													class="text-xs font-medium text-muted-foreground"
												>
													End
												</label>
												<TextInput
													id="plan-end"
													bind:value={endDate}
													type="date"
													inputmode="numeric"
													enterkeyhint="done"
													disabled={formDisabled}
													size="sm"
												/>
											</div>
										</div>
									</section>

									<section class="px-3 py-3 sm:px-4">
										<div class="flex items-center gap-2">
											<Clock class="h-4 w-4 text-muted-foreground" />
											<p
												class="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
											>
												Record
											</p>
										</div>
										<div class="mt-2 space-y-1.5 text-sm">
											<div class="flex items-center justify-between gap-3">
												<span class="text-muted-foreground">Type</span>
												<span class="text-right text-foreground"
													>{planTypeLabel}</span
												>
											</div>
											<div class="flex items-center justify-between gap-3">
												<span class="text-muted-foreground">Created</span>
												<span class="text-right text-foreground">
													{formatRecordDate(plan.created_at)}
												</span>
											</div>
											<div class="flex items-center justify-between gap-3">
												<span class="text-muted-foreground">Updated</span>
												<span class="text-right text-foreground">
													{formatRecordDate(plan.updated_at)}
												</span>
											</div>
										</div>
									</section>
								</div>
							</CardBody>
						</Card>

						<LinkedEntities
							sourceId={planId}
							sourceKind="plan"
							{projectId}
							initialLinkedEntities={linkedEntities}
							onEntityClick={handleLinkedEntityClick}
							onLinksChanged={handleLinksChanged}
						/>

						<!-- Images -->
						<ImageAssetsPanel
							{projectId}
							entityKind="plan"
							entityId={planId}
							title="Images"
							compact={true}
							onChanged={() => {
								void loadPlan();
								onUpdated?.();
							}}
						/>

						{#if plan?.props?.tags?.length}
							<div
								class="px-3 py-2.5 border border-border rounded-lg bg-card shadow-ink"
							>
								<p
									class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5"
								>
									Tags
								</p>
								<TagsDisplay props={plan.props} size="sm" compact={true} />
							</div>
						{/if}

						<!-- Activity Log (collapsible) -->
						<div
							class="border border-border rounded-lg bg-card shadow-ink overflow-hidden"
						>
							<button
								type="button"
								onclick={() => (showActivityLog = !showActivityLog)}
								class="w-full px-3 py-2 flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:bg-muted/50 transition-colors"
							>
								<span>Activity</span>
								<ChevronDown
									class="w-3.5 h-3.5 transition-transform {showActivityLog
										? 'rotate-180'
										: ''}"
								/>
							</button>
							{#if showActivityLog}
								<div class="border-t border-border">
									<EntityActivityLog
										entityType="plan"
										entityId={planId}
										autoLoad={true}
										embedded={true}
									/>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<div class="mt-4">
					<EntityCommentsSection {projectId} entityType="plan" entityId={planId} />
				</div>
			{/if}
		</div>
	{/snippet}

	<!-- Footer Actions -->
	{#snippet footer()}
		{#if !isLoading && plan}
			<div
				class="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-t border-border bg-muted/50"
			>
				<div class="flex items-center gap-1">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onclick={() => (showDeleteConfirm = true)}
						disabled={isDeleting || isSaving}
						class="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs px-2 h-8 pressable"
					>
						<Trash2 class="w-3.5 h-3.5" />
						<span class="hidden sm:inline ml-1">Delete</span>
					</Button>
				</div>
				<div class="flex items-center gap-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onclick={handleClose}
						disabled={isSaving || isDeleting}
						class="text-xs h-8 pressable"
					>
						Cancel
					</Button>
					<Button
						type="submit"
						form={detailsFormId}
						variant="primary"
						size="sm"
						loading={isSaving}
						disabled={formDisabled || !name.trim()}
						class="text-xs h-8 pressable"
					>
						<Save class="w-3.5 h-3.5" />
						<span class="ml-1">Save</span>
					</Button>
				</div>
			</div>
		{/if}
	{/snippet}
</Modal>

{#if showDeleteConfirm}
	<ConfirmationModal
		isOpen={showDeleteConfirm}
		title="Delete Plan"
		confirmText="Delete Plan"
		confirmVariant="danger"
		loading={isDeleting}
		loadingText="Deleting..."
		icon="danger"
		onconfirm={handleDelete}
		oncancel={() => (showDeleteConfirm = false)}
	>
		{#snippet content()}
			<p class="text-sm text-muted-foreground">
				This will permanently remove the plan and disconnect linked tasks.
			</p>
		{/snippet}
	</ConfirmationModal>
{/if}

<!-- Linked Entity Modals -->
{#if showGoalModal && selectedGoalIdForModal}
	<GoalEditModal
		goalId={selectedGoalIdForModal}
		{projectId}
		onClose={closeLinkedEntityModals}
		onUpdated={closeLinkedEntityModals}
		onDeleted={closeLinkedEntityModals}
	/>
{/if}

{#if showTaskModal && selectedTaskIdForModal}
	<TaskEditModal
		taskId={selectedTaskIdForModal}
		{projectId}
		onClose={closeLinkedEntityModals}
		onUpdated={closeLinkedEntityModals}
		onDeleted={closeLinkedEntityModals}
	/>
{/if}

{#if showDocumentModal && selectedDocumentIdForModal}
	<DocumentModal
		{projectId}
		documentId={selectedDocumentIdForModal}
		bind:isOpen={showDocumentModal}
		onClose={closeLinkedEntityModals}
		onSaved={closeLinkedEntityModals}
		onDeleted={closeLinkedEntityModals}
	/>
{/if}

<!-- Chat About Modal (Lazy Loaded) -->
{#if showChatModal && AgentChatModalComponent && entityFocus}
	<AgentChatModalComponent
		isOpen={showChatModal}
		initialProjectFocus={entityFocus}
		onClose={handleChatClose}
	/>
{/if}
