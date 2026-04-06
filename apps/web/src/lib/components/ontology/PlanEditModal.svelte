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
	import type { Component } from 'svelte';
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import GoalEditModal from './GoalEditModal.svelte';
	import TaskEditModal from './TaskEditModal.svelte';
	import DocumentModal from './DocumentModal.svelte';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';

	// Lazy-loaded AgentChatModal for better initial load performance

	let AgentChatModalComponent = $state<Component<any> | null>(null);

	async function loadAgentChatModal() {
		if (!AgentChatModalComponent) {
			const mod = await import('$lib/components/agent/AgentChatModal.svelte');
			AgentChatModalComponent = mod.default as Component<any>;
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
	let plan = $state<Plan | null>(null);
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
			plan = data.data?.plan;
			linkedEntities = data.data?.linkedEntities;

			if (plan) {
				name = plan.name || '';
				description = plan.description || plan.props?.description || '';
				planDetails = plan.plan || plan.props?.plan || '';
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
				plan: planDetails.trim() || null,
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
										<Badge variant={stateMeta.variant} size="sm"
											>{stateMeta.label}</Badge
										>
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

									<FormField
										label="Details"
										labelFor="plan-details"
										uppercase={false}
										showOptional={false}
									>
										<Textarea
											id="plan-details"
											bind:value={planDetails}
											enterkeyhint="next"
											rows={2}
											placeholder="Execution outline, milestones, runbook..."
											disabled={formDisabled}
											size="md"
										/>
									</FormField>
								</CardBody>
							</Card>

							<Card variant="default" class="wt-paper">
								<CardHeader variant="transparent" texture="none">
									<div
										class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
									>
										<div>
											<div class="flex items-center gap-2">
												<CalendarRange
													class="h-4 w-4 text-muted-foreground"
												/>
												<p
													class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
												>
													Execution
												</p>
											</div>
											<h3 class="mt-1 text-sm font-semibold text-foreground">
												State and timeline
											</h3>
										</div>
										<p
											class="text-xs text-muted-foreground sm:max-w-52 sm:text-right"
										>
											Keep the schedule and state together so progress is
											obvious at a glance.
										</p>
									</div>
								</CardHeader>
								<CardBody class="space-y-4">
									<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
										<FormField
											label="State"
											labelFor="plan-state"
											uppercase={false}
											showOptional={false}
										>
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
										</FormField>

										<FormField
											label="Start"
											labelFor="plan-start"
											uppercase={false}
											showOptional={false}
										>
											<TextInput
												id="plan-start"
												bind:value={startDate}
												type="date"
												inputmode="numeric"
												enterkeyhint="next"
												disabled={formDisabled}
												size="sm"
											/>
										</FormField>

										<FormField
											label="End"
											labelFor="plan-end"
											error={dateError}
											uppercase={false}
											showOptional={false}
										>
											<TextInput
												id="plan-end"
												bind:value={endDate}
												type="date"
												inputmode="numeric"
												enterkeyhint="done"
												disabled={formDisabled}
												size="sm"
											/>
										</FormField>
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
											At a glance
										</p>
										<h3 class="mt-1 text-sm font-semibold text-foreground">
											Plan snapshot
										</h3>
									</div>
									<Badge variant={stateMeta.variant} size="sm"
										>{stateMeta.label}</Badge
									>
								</div>
							</CardHeader>
							<CardBody class="space-y-3">
								<div
									class="rounded-lg border border-border/70 bg-muted/30 p-3"
								>
									<p
										class="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
									>
										State
									</p>
									<p class="mt-1 text-sm font-semibold text-foreground">
										{stateMeta.label}
									</p>
									<p class="mt-1 text-xs text-muted-foreground">
										{stateMeta.note}
									</p>
								</div>

								<div class="rounded-lg border border-border/70 bg-card p-3">
									<div class="space-y-2">
										<p
											class="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
										>
											Timeline
										</p>
										<div class="grid grid-cols-1 gap-1.5 text-xs">
											<div
												class="flex items-center justify-between gap-2"
											>
												<span class="text-muted-foreground">Start</span>
												<span class="text-right text-foreground">
													{startDate
														? new Date(
																startDate + 'T00:00:00'
															).toLocaleDateString(undefined, {
																month: 'short',
																day: 'numeric',
																year: 'numeric'
															})
														: 'Not set'}
												</span>
											</div>
											<div
												class="flex items-center justify-between gap-2"
											>
												<span class="text-muted-foreground">End</span>
												<span class="text-right text-foreground">
													{endDate
														? new Date(
																endDate + 'T00:00:00'
															).toLocaleDateString(undefined, {
																month: 'short',
																day: 'numeric',
																year: 'numeric'
															})
														: 'Not set'}
												</span>
											</div>
											<div
												class="flex items-center justify-between gap-2"
											>
												<span class="text-muted-foreground">Created</span>
												<span class="text-right text-foreground">
													{plan.created_at
														? new Date(
																plan.created_at
															).toLocaleDateString(undefined, {
																month: 'short',
																day: 'numeric',
																year: 'numeric'
															})
														: '—'}
												</span>
											</div>
											<div
												class="flex items-center justify-between gap-2"
											>
												<span class="text-muted-foreground">Updated</span>
												<span class="text-right text-foreground">
													{plan.updated_at
														? new Date(
																plan.updated_at
															).toLocaleDateString(undefined, {
																month: 'short',
																day: 'numeric',
																year: 'numeric'
															})
														: '—'}
												</span>
											</div>
										</div>
									</div>
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
