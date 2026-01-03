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
	import { Clock, Loader, Save, Trash2, X } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import LinkedEntities from './linked-entities/LinkedEntities.svelte';
	import TagsDisplay from './TagsDisplay.svelte';
	import { PLAN_STATES, type Plan } from '$lib/types/onto';
	import { PLAN_TYPE_KEYS } from '$lib/types/onto-taxonomy';
	import type { EntityKind, LinkedEntitiesResult } from './linked-entities/linked-entities.types';
	import type { Component } from 'svelte';
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import GoalEditModal from './GoalEditModal.svelte';
	import TaskEditModal from './TaskEditModal.svelte';
	import DocumentModal from './DocumentModal.svelte';
	import { getPlanStateBadgeClass } from '$lib/utils/ontology-badge-styles';

	// Lazy-loaded AgentChatModal for better initial load performance
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

	const stateOptions = PLAN_STATES.map((state) => ({
		value: state,
		label: state.replace('_', ' ')
	}));

	// Modal states for linked entity navigation
	let showGoalModal = $state(false);
	let selectedGoalIdForModal = $state<string | null>(null);
	let showTaskModal = $state(false);
	let selectedTaskIdForModal = $state<string | null>(null);
	let showDocumentModal = $state(false);
	let selectedDocumentIdForModal = $state<string | null>(null);
	let showChatModal = $state(false);

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

	const stateBadgeClasses = $derived(
		`px-3 py-1 rounded-full text-xs font-semibold capitalize ${getPlanStateBadgeClass(stateKey)}`
	);
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

	const startLabel = $derived(formatDateOnly(startDate) ?? 'Not scheduled');
	const endLabel = $derived(formatDateOnly(endDate) ?? 'Not scheduled');
	const durationLabel = $derived.by(() => {
		const days = computeDurationDays(startDate, endDate);
		return days > 0 ? `${days} day${days === 1 ? '' : 's'}` : 'Flexible timeline';
	});
	const lastUpdatedLabel = $derived(formatRelativeTime(plan?.updated_at || plan?.created_at));
	const planTypeLabel = $derived(plan?.type_key || 'plan.process.base');
	const planIdLabel = $derived(plan?.id || planId);
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
			error = err instanceof Error ? err.message : 'Failed to delete plan';
			isDeleting = false;
			showDeleteConfirm = false;
		}
	}

	function handleClose() {
		modalOpen = false;
		onClose?.();
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

	function formatRelativeTime(value: string | null | undefined): string | null {
		if (!value) return null;
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return null;
		const diffMs = Date.now() - date.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Yesterday';
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString();
	}

	function computeDurationDays(start: string, end: string): number {
		if (!start || !end) return 0;
		const startDateObj = new Date(start);
		const endDateObj = new Date(end);
		if (Number.isNaN(startDateObj.getTime()) || Number.isNaN(endDateObj.getTime())) return 0;
		const diff = endDateObj.getTime() - startDateObj.getTime();
		return diff > 0 ? Math.round(diff / (1000 * 60 * 60 * 24)) : 0;
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
>
	{#snippet header()}
		<!-- Compact Inkprint header -->
		<div
			class="flex-shrink-0 bg-muted/50 border-b border-border px-2 py-1.5 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div
					class="flex h-9 w-9 items-center justify-center rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0"
				>
					<Clock class="w-5 h-5" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						{name || plan?.name || 'Plan'}
					</h2>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
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
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:border-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 tx tx-grain tx-weak"
					title="Chat about this plan"
				>
					<img
						src="/brain-bolt.png"
						alt="Chat about this plan"
						class="w-5 h-5 rounded object-cover"
					/>
				</button>
				<!-- Close button -->
				<button
					type="button"
					onclick={handleClose}
					disabled={isSaving || isDeleting}
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:bg-card hover:border-red-500/50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 tx tx-grain tx-weak dark:hover:border-red-400/50 dark:hover:text-red-400"
					aria-label="Close modal"
				>
					<X class="w-5 h-5" />
				</button>
			</div>
		</div>
	{/snippet}

	{#snippet children()}
		<!-- Main content - minimal padding on mobile -->
		<div class="px-2 py-2 sm:px-6 sm:py-4">
			{#if isLoading}
				<div class="flex items-center justify-center py-16">
					<Loader class="w-8 h-8 animate-spin text-muted-foreground" />
				</div>
			{:else if !plan}
				<div class="text-center py-16">
					<p class="text-destructive">Plan not found</p>
				</div>
			{:else}
				<div class="grid gap-6 lg:grid-cols-3">
					<section class="space-y-6 lg:col-span-2">
						<Card class="shadow-ink">
							<CardHeader
								variant="default"
								class="flex items-center justify-between tx tx-frame tx-weak"
							>
								<div>
									<p
										class="text-xs font-semibold uppercase tracking-[0.3em] text-accent"
									>
										Plan details
									</p>
								</div>
							</CardHeader>
							<CardBody class="space-y-5">
								<form
									onsubmit={(event) => {
										event.preventDefault();
										handleSave();
									}}
									class="space-y-3 sm:space-y-4"
								>
									<FormField label="Plan name" labelFor="plan-name" required>
										<TextInput
											id="plan-name"
											bind:value={name}
											inputmode="text"
											enterkeyhint="next"
											placeholder="e.g., Foundation sprint, GTM launch"
											required
											disabled={formDisabled}
										/>
									</FormField>

									<FormField
										label="Description"
										labelFor="plan-description"
										showOptional={false}
									>
										<Textarea
											id="plan-description"
											bind:value={description}
											enterkeyhint="next"
											rows={4}
											placeholder="Summarize objectives, target outcomes, and cross-team dependencies."
											disabled={formDisabled}
										/>
									</FormField>

									<FormField
										label="Plan details"
										labelFor="plan-details"
										hint="Optional execution outline or runbook"
										showOptional={true}
									>
										<Textarea
											id="plan-details"
											bind:value={planDetails}
											enterkeyhint="next"
											rows={4}
											placeholder="Capture the execution outline, milestones, or runbook details..."
											disabled={formDisabled}
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
												inputmode="numeric"
												enterkeyhint="next"
												disabled={formDisabled}
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
												inputmode="numeric"
												enterkeyhint="done"
												disabled={formDisabled}
											/>
										</FormField>
									</div>

									<div class="grid gap-4 sm:grid-cols-2">
										<!-- Plan State -->
										<FormField
											label="State"
											labelFor="plan-state"
											showOptional={false}
										>
											<Select
												id="plan-state"
												bind:value={stateKey}
												disabled={formDisabled}
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

										<!-- Plan Type -->
										<FormField
											label="Type"
											labelFor="plan-type"
											hint="Plan classification"
										>
											<Select
												id="plan-type"
												bind:value={typeKey}
												disabled={formDisabled}
											>
												{#each PLAN_TYPE_KEYS as typeOption}
													<option
														value={typeOption.value}
														title={typeOption.description}
													>
														{typeOption.label}
													</option>
												{/each}
											</Select>
										</FormField>
									</div>

									{#if error}
										<div
											class="rounded border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
										>
											{error}
										</div>
									{/if}
								</form>
							</CardBody>
						</Card>
					</section>

					<div class="space-y-4">
						<Card class="shadow-ink">
							<CardHeader class="flex items-center gap-2">
								<Clock class="w-4 h-4 text-accent" />
								<h4
									class="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground"
								>
									Timeline insight
								</h4>
							</CardHeader>
							<CardBody class="space-y-3">
								<div class="grid grid-cols-2 gap-3 text-sm">
									<div class="rounded bg-muted/30 p-3 border border-border">
										<p
											class="text-xs uppercase tracking-[0.3em] text-muted-foreground"
										>
											Start
										</p>
										<p class="font-semibold text-foreground">
											{startLabel}
										</p>
									</div>
									<div class="rounded bg-muted/30 p-3 border border-border">
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

						<!-- Linked Entities -->
						<LinkedEntities
							sourceId={planId}
							sourceKind="plan"
							{projectId}
							initialLinkedEntities={linkedEntities}
							onEntityClick={handleLinkedEntityClick}
							onLinksChanged={handleLinksChanged}
						/>

						<!-- Tags (from classification) -->
						{#if plan?.props?.tags?.length}
							<Card class="shadow-ink">
								<CardHeader class="flex items-center gap-2">
									<h4
										class="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground"
									>
										Tags
									</h4>
								</CardHeader>
								<CardBody>
									<TagsDisplay props={plan.props} size="sm" compact={true} />
								</CardBody>
							</Card>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/snippet}

	<!-- Footer Actions - delete on left, cancel/save on right -->
	{#snippet footer()}
		{#if !isLoading && plan}
			<div
				class="flex flex-row items-center justify-between gap-2 sm:gap-4 px-2 py-2 sm:px-4 sm:py-3 border-t border-border bg-muted/30 tx tx-grain tx-weak"
			>
				<!-- Delete button on left -->
				<div class="flex items-center gap-1.5 sm:gap-2">
					<Button
						type="button"
						variant="danger"
						size="sm"
						onclick={() => (showDeleteConfirm = true)}
						disabled={isDeleting || isSaving}
						class="text-[10px] sm:text-xs px-2 py-1 sm:px-3 sm:py-1.5 tx tx-grain tx-weak"
						icon={Trash2}
					>
						<span class="hidden sm:inline">Delete</span>
						<span class="sm:hidden">Del</span>
					</Button>
				</div>

				<!-- Cancel and Save on right -->
				<div class="flex flex-row items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						onclick={handleClose}
						disabled={isSaving || isDeleting}
						class="text-xs sm:text-sm px-2 sm:px-4 tx tx-grain tx-weak"
					>
						Cancel
					</Button>
					<Button
						variant="primary"
						size="sm"
						onclick={handleSave}
						loading={isSaving}
						disabled={formDisabled || !name.trim()}
						class="text-xs sm:text-sm px-2 sm:px-4 tx tx-grain tx-weak"
					>
						<Save class="w-3 h-3 sm:w-4 sm:h-4" />
						<span class="hidden sm:inline">Save changes</span>
						<span class="sm:hidden">Save</span>
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
