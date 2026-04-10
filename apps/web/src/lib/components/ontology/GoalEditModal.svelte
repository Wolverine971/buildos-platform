<!-- apps/web/src/lib/components/ontology/GoalEditModal.svelte -->
<!--
	Goal Edit Modal Component

	Provides full CRUD operations for goals within the BuildOS ontology system:
	- Edit goal details (name, description, priority, target date, state, etc.)
	- Change goal state via dropdown
	- Delete goals with confirmation

	Documentation:
	- Ontology System Overview: /apps/web/docs/features/ontology/README.md
	- Data Models & Schema: /apps/web/docs/features/ontology/DATA_MODELS.md
	- Implementation Guide: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
	- Modal Design Patterns: /apps/web/docs/technical/components/modals/TECHNICAL_ANALYSIS.md

	Related Files:
	- API Endpoints: /apps/web/src/routes/api/onto/goals/[id]/+server.ts
	- Create Modal: /apps/web/src/lib/components/ontology/GoalCreateModal.svelte

	Note: This modal uses custom layout instead of FormModal for advanced features
	like sidebar metadata and FSM visualization.
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import {
		Save,
		Loader,
		Trash2,
		Target,
		X,
		ChevronDown,
		FileText,
		CalendarRange
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import LinkedEntities from './linked-entities/LinkedEntities.svelte';
	import TagsDisplay from './TagsDisplay.svelte';
	import EntityActivityLog from './EntityActivityLog.svelte';
	import EntityCommentsSection from './EntityCommentsSection.svelte';
	import ImageAssetsPanel from './ImageAssetsPanel.svelte';
	import { GOAL_STATES } from '$lib/types/onto';
	import type { EntityKind, LinkedEntitiesResult } from './linked-entities/linked-entities.types';
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import TaskEditModal from './TaskEditModal.svelte';
	import PlanEditModal from './PlanEditModal.svelte';
	import DocumentModal from './DocumentModal.svelte';
	import GoalMilestonesSidebarSection from './GoalMilestonesSidebarSection.svelte';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';

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
		goalId: string;
		projectId: string;
		onClose: () => void;
		onUpdated?: () => void;
		onDeleted?: () => void;
	}

	let { goalId, projectId, onClose, onUpdated, onDeleted }: Props = $props();

	let modalOpen = $state(true);
	let goal = $state<any>(null);
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
	let goalDetails = $state('');
	let priority = $state<string>('medium');
	let targetDate = $state('');
	let measurementCriteria = $state('');
	let stateKey = $state('draft');
	let typeKey = $state('goal.default');

	// Modal states for linked entity navigation
	let showTaskModal = $state(false);
	let selectedTaskIdForModal = $state<string | null>(null);
	let showPlanModal = $state(false);
	let selectedPlanIdForModal = $state<string | null>(null);
	let showDocumentModal = $state(false);
	let selectedDocumentIdForModal = $state<string | null>(null);
	let showChatModal = $state(false);

	// Milestone modal states
	let showMilestoneCreateModal = $state(false);
	let showMilestoneEditModal = $state(false);
	let editingMilestoneId = $state<string | null>(null);
	let showActivityLog = $state(false);

	// Extract milestones from linkedEntities for the dedicated section
	const milestones = $derived(linkedEntities?.milestones ?? []);

	type SurfaceBadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent';

	const GOAL_STATE_META: Record<
		string,
		{ label: string; variant: SurfaceBadgeVariant; note: string }
	> = {
		draft: { label: 'Draft', variant: 'default', note: 'Not yet committed to.' },
		active: { label: 'Active', variant: 'info', note: 'Actively being pursued.' },
		achieved: { label: 'Achieved', variant: 'success', note: 'Goal met.' },
		abandoned: { label: 'Abandoned', variant: 'warning', note: 'No longer pursued.' }
	};

	const PRIORITY_META: Record<
		string,
		{ label: string; variant: SurfaceBadgeVariant; note: string }
	> = {
		high: { label: 'High', variant: 'error', note: 'Needs focus now.' },
		medium: { label: 'Medium', variant: 'info', note: 'Standard priority.' },
		low: { label: 'Low', variant: 'default', note: 'Can wait.' }
	};

	const stateMeta = $derived(
		GOAL_STATE_META[stateKey] ?? {
			label: stateKey,
			variant: 'default' as SurfaceBadgeVariant,
			note: ''
		}
	);
	const priorityMeta = $derived(
		PRIORITY_META[priority] ?? {
			label: priority,
			variant: 'default' as SurfaceBadgeVariant,
			note: ''
		}
	);
	const detailsFormId = $derived(`goal-edit-${goalId}-details`);

	// Build focus for chat about this goal
	const entityFocus = $derived.by((): ProjectFocus | null => {
		if (!goal || !projectId) return null;
		return {
			focusType: 'goal',
			focusEntityId: goalId,
			focusEntityName: goal.name || 'Untitled Goal',
			projectId: projectId,
			projectName: goal.project?.name || 'Project'
		};
	});

	// Load goal data when modal opens (client-side only)
	$effect(() => {
		if (browser) {
			loadGoal();
		}
	});

	function formatDateOnly(value?: string | null): string {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return date.toISOString().slice(0, 10);
	}

	async function loadGoal() {
		try {
			isLoading = true;
			// Use /full endpoint for optimized single-request loading
			const response = await fetch(`/api/onto/goals/${goalId}/full`);
			if (!response.ok) throw new Error('Failed to load goal');

			const data = await response.json();
			goal = data.data?.goal;
			linkedEntities = data.data?.linkedEntities;

			if (goal) {
				name = goal.name || '';
				description = goal.description || goal.props?.description || '';
				goalDetails = goal.goal || goal.props?.goal || '';
				priority = goal.props?.priority || 'medium';
				targetDate = formatDateOnly(goal.target_date || goal.props?.target_date || null);
				measurementCriteria = goal.props?.measurement_criteria || '';
				stateKey = goal.state_key || 'draft';
				typeKey = goal.type_key || 'goal.default';
			}
		} catch (err) {
			console.error('Error loading goal:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/goals/${goalId}/full`,
				method: 'GET',
				projectId,
				entityType: 'goal',
				entityId: goalId,
				operation: 'goal_load'
			});
			error = 'Failed to load goal';
		} finally {
			isLoading = false;
		}
	}

	async function handleSave() {
		if (!name.trim()) {
			error = 'Goal name is required';
			return;
		}

		isSaving = true;
		error = '';

		try {
			const requestBody = {
				name: name.trim(),
				goal: goalDetails.trim() || null,
				description: description.trim() || null,
				priority: priority || null,
				target_date: targetDate || null,
				measurement_criteria: measurementCriteria.trim() || null,
				state_key: stateKey,
				type_key: typeKey || 'goal.default'
			};

			const response = await fetch(`/api/onto/goals/${goalId}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody)
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to update goal');
			}

			// Success! Call the callback and close
			if (onUpdated) {
				onUpdated();
			}
			onClose();
		} catch (err) {
			console.error('Error updating goal:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/goals/${goalId}`,
				method: 'PATCH',
				projectId,
				entityType: 'goal',
				entityId: goalId,
				operation: 'goal_update'
			});
			error = err instanceof Error ? err.message : 'Failed to update goal';
			isSaving = false;
		}
	}

	async function handleDelete() {
		isDeleting = true;
		error = '';

		try {
			const response = await fetch(`/api/onto/goals/${goalId}`, {
				method: 'DELETE'
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to delete goal');
			}

			// Success! Call the callback and close
			if (onDeleted) {
				onDeleted();
			}
			onClose();
		} catch (err) {
			console.error('Error deleting goal:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/goals/${goalId}`,
				method: 'DELETE',
				projectId,
				entityType: 'goal',
				entityId: goalId,
				operation: 'goal_delete'
			});
			error = err instanceof Error ? err.message : 'Failed to delete goal';
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
			case 'task':
				selectedTaskIdForModal = id;
				showTaskModal = true;
				break;
			case 'plan':
				selectedPlanIdForModal = id;
				showPlanModal = true;
				break;
			case 'document':
				selectedDocumentIdForModal = id;
				showDocumentModal = true;
				break;
			default:
				console.warn(`Unhandled entity kind: ${kind}`);
		}
	}

	function closeLinkedEntityModals(wasChanged: boolean = true) {
		showTaskModal = false;
		showPlanModal = false;
		showDocumentModal = false;
		selectedTaskIdForModal = null;
		selectedPlanIdForModal = null;
		selectedDocumentIdForModal = null;
		// Smart refresh: only reload if changes were made
		if (wasChanged) {
			hasChanges = true;
			loadGoal();
		}
	}

	function handleLinksChanged() {
		hasChanges = true;
		// Invalidate cached linked entities so component will refetch
		linkedEntities = undefined;
	}

	// Milestone handlers
	function handleAddMilestone() {
		showMilestoneCreateModal = true;
	}

	function handleEditMilestone(milestoneId: string) {
		editingMilestoneId = milestoneId;
		showMilestoneEditModal = true;
	}

	async function handleToggleMilestoneComplete(milestoneId: string, currentState: string) {
		const newState = currentState === 'completed' ? 'pending' : 'completed';
		try {
			const response = await fetch(`/api/onto/milestones/${milestoneId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ state_key: newState })
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to update milestone');
			}

			// Refresh linked entities to show updated milestone
			hasChanges = true;
			loadGoal();
		} catch (err) {
			console.error('Error toggling milestone complete:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/milestones/${milestoneId}`,
				method: 'PATCH',
				projectId,
				entityType: 'milestone',
				entityId: milestoneId,
				operation: 'milestone_toggle_complete'
			});
		}
	}

	function handleMilestoneCreated() {
		showMilestoneCreateModal = false;
		hasChanges = true;
		loadGoal();
	}

	function handleMilestoneUpdated() {
		showMilestoneEditModal = false;
		editingMilestoneId = null;
		hasChanges = true;
		loadGoal();
	}

	function handleMilestoneDeleted() {
		showMilestoneEditModal = false;
		editingMilestoneId = null;
		hasChanges = true;
		loadGoal();
	}

	// Chat about this goal handlers
	async function openChatAbout() {
		if (!goal || !projectId) return;
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
					<Target class="w-5 h-5" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						{name || goal?.name || 'Goal'}
					</h2>
					<div class="mt-1 flex flex-wrap items-center gap-1.5">
						<Badge variant={stateMeta.variant} size="sm">{stateMeta.label}</Badge>
						<Badge variant={priorityMeta.variant} size="sm">{priorityMeta.label}</Badge>
					</div>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-1">
						{#if goal?.created_at}Created {new Date(goal.created_at).toLocaleDateString(
								undefined,
								{ month: 'short', day: 'numeric' }
							)}{/if}{#if goal?.updated_at && goal.updated_at !== goal.created_at}
							· Updated {new Date(goal.updated_at).toLocaleDateString(undefined, {
								month: 'short',
								day: 'numeric'
							})}{/if}
					</p>
				</div>
			</div>
			<div class="flex items-center gap-1.5">
				<!-- Chat about this goal button -->
				<button
					type="button"
					onclick={openChatAbout}
					disabled={isLoading || isSaving || !goal}
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:border-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
					title="Chat about this goal"
				>
					<img
						src="/brain-bolt.png"
						alt="Chat about this goal"
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
			{:else if !goal}
				<div class="text-center py-8">
					<p class="text-destructive">Goal not found</p>
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
												What this goal is and what "achieved" looks like
											</h3>
											<p class="mt-1 text-xs text-muted-foreground">
												Lead with the name and supporting context so the
												goal reads clearly at a glance.
											</p>
										</div>
										<div class="flex flex-wrap items-center gap-1.5">
											<Badge variant={stateMeta.variant} size="sm"
												>{stateMeta.label}</Badge
											>
											<Badge variant={priorityMeta.variant} size="sm">
												{priorityMeta.label}
											</Badge>
										</div>
									</div>
								</CardHeader>
								<CardBody class="space-y-4">
									<FormField
										label="Goal Name"
										labelFor="name"
										required={true}
										uppercase={false}
										showOptional={false}
										error={!name.trim() && error ? 'Goal name is required' : ''}
									>
										<TextInput
											id="name"
											bind:value={name}
											inputmode="text"
											enterkeyhint="next"
											placeholder="Enter goal name..."
											required={true}
											disabled={isSaving}
											error={!name.trim() && error ? true : false}
										/>
									</FormField>

									<FormField
										label="Description"
										labelFor="description"
										uppercase={false}
										showOptional={false}
									>
										<Textarea
											id="description"
											bind:value={description}
											enterkeyhint="next"
											placeholder="Describe what you want to achieve..."
											rows={3}
											disabled={isSaving}
											size="md"
										/>
									</FormField>

									<FormField
										label="Goal Details"
										labelFor="goal-details"
										uppercase={false}
										showOptional={false}
									>
										<Textarea
											id="goal-details"
											bind:value={goalDetails}
											enterkeyhint="next"
											placeholder="Add context or structured goal notes..."
											rows={2}
											disabled={isSaving}
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
													Tracking
												</p>
											</div>
											<h3 class="mt-1 text-sm font-semibold text-foreground">
												Priority, state, and timeline
											</h3>
										</div>
										<p
											class="text-xs text-muted-foreground sm:max-w-52 sm:text-right"
										>
											Keep the operational controls together so the goal's
											status is obvious at a glance.
										</p>
									</div>
								</CardHeader>
								<CardBody class="space-y-4">
									<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
										<FormField
											label="Priority"
											labelFor="priority"
											required={true}
											uppercase={false}
											showOptional={false}
										>
											<Select
												id="priority"
												bind:value={priority}
												disabled={isSaving}
												size="sm"
												placeholder="Priority"
											>
												<option value="high">High</option>
												<option value="medium">Medium</option>
												<option value="low">Low</option>
											</Select>
										</FormField>

										<FormField
											label="State"
											labelFor="state"
											required={true}
											uppercase={false}
											showOptional={false}
										>
											<Select
												id="state"
												bind:value={stateKey}
												disabled={isSaving}
												size="sm"
												placeholder="State"
											>
												{#each GOAL_STATES as state}
													<option value={state}>
														{state === 'draft'
															? 'Draft'
															: state === 'active'
																? 'Active'
																: state === 'achieved'
																	? 'Achieved'
																	: state === 'abandoned'
																		? 'Abandoned'
																		: state}
													</option>
												{/each}
											</Select>
										</FormField>
									</div>

									<FormField
										label="Target Date"
										labelFor="target-date"
										uppercase={false}
										showOptional={false}
									>
										<TextInput
											type="date"
											inputmode="numeric"
											enterkeyhint="next"
											id="target-date"
											bind:value={targetDate}
											disabled={isSaving}
											size="sm"
										/>
									</FormField>

									<FormField
										label="Success Criteria"
										labelFor="measurement-criteria"
										uppercase={false}
										showOptional={false}
									>
										<Textarea
											id="measurement-criteria"
											bind:value={measurementCriteria}
											enterkeyhint="done"
											placeholder="How will you measure success..."
											rows={2}
											disabled={isSaving}
											size="md"
										/>
									</FormField>
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
											Goal snapshot
										</h3>
									</div>
									<Badge variant={stateMeta.variant} size="sm"
										>{stateMeta.label}</Badge
									>
								</div>
							</CardHeader>
							<CardBody class="space-y-3">
								<div class="grid grid-cols-2 gap-2">
									<div class="rounded-lg border border-border/70 bg-muted/30 p-3">
										<p
											class="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
										>
											Priority
										</p>
										<p class="mt-1 text-sm font-semibold text-foreground">
											{priorityMeta.label}
										</p>
										<p class="mt-1 text-xs text-muted-foreground">
											{priorityMeta.note}
										</p>
									</div>
									<div class="rounded-lg border border-border/70 bg-muted/30 p-3">
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
								</div>

								<div class="rounded-lg border border-border/70 bg-card p-3">
									<div class="space-y-2">
										<p
											class="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
										>
											Timeline
										</p>
										<div class="grid grid-cols-1 gap-1.5 text-xs">
											<div class="flex items-center justify-between gap-2">
												<span class="text-muted-foreground">Target</span>
												<span class="text-right text-foreground">
													{targetDate
														? new Date(
																targetDate + 'T00:00:00'
															).toLocaleDateString(undefined, {
																month: 'short',
																day: 'numeric',
																year: 'numeric'
															})
														: 'No target date'}
												</span>
											</div>
											<div class="flex items-center justify-between gap-2">
												<span class="text-muted-foreground">Created</span>
												<span class="text-right text-foreground">
													{goal.created_at
														? new Date(
																goal.created_at
															).toLocaleDateString(undefined, {
																month: 'short',
																day: 'numeric',
																year: 'numeric'
															})
														: '—'}
												</span>
											</div>
											<div class="flex items-center justify-between gap-2">
												<span class="text-muted-foreground">Updated</span>
												<span class="text-right text-foreground">
													{goal.updated_at
														? new Date(
																goal.updated_at
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

						<!-- Milestones -->
						<GoalMilestonesSidebarSection
							{milestones}
							{goalId}
							goalName={name || goal?.name || 'Goal'}
							goalState={stateKey}
							{projectId}
							canEdit={!isSaving && !isDeleting}
							onAddMilestone={handleAddMilestone}
							onEditMilestone={handleEditMilestone}
							onToggleMilestoneComplete={handleToggleMilestoneComplete}
						/>

						<!-- Linked Entities -->
						<LinkedEntities
							sourceId={goalId}
							sourceKind="goal"
							{projectId}
							initialLinkedEntities={linkedEntities}
							onEntityClick={handleLinkedEntityClick}
							onLinksChanged={handleLinksChanged}
						/>

						<!-- Images -->
						<ImageAssetsPanel
							{projectId}
							entityKind="goal"
							entityId={goalId}
							title="Images"
							compact={true}
							onChanged={() => {
								void loadGoal();
								onUpdated?.();
							}}
						/>

						{#if goal?.props?.tags?.length}
							<div
								class="px-3 py-2.5 border border-border rounded-lg bg-card shadow-ink"
							>
								<p
									class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5"
								>
									Tags
								</p>
								<TagsDisplay props={goal.props} size="sm" compact={true} />
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
										entityType="goal"
										entityId={goalId}
										autoLoad={true}
										embedded={true}
									/>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<div class="mt-4">
					<EntityCommentsSection {projectId} entityType="goal" entityId={goalId} />
				</div>
			{/if}
		</div>
	{/snippet}

	<!-- Footer Actions -->
	{#snippet footer()}
		{#if !isLoading && goal}
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
						disabled={isSaving || isDeleting || !name.trim()}
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
		title="Delete Goal"
		confirmText="Delete Goal"
		confirmVariant="danger"
		loading={isDeleting}
		loadingText="Deleting..."
		icon="danger"
		onconfirm={handleDelete}
		oncancel={() => (showDeleteConfirm = false)}
	>
		{#snippet content()}
			<p class="text-xs text-muted-foreground leading-relaxed">
				This action cannot be undone. The goal and all its data will be permanently deleted.
			</p>
		{/snippet}
	</ConfirmationModal>
{/if}

<!-- Linked Entity Modals -->
{#if showTaskModal && selectedTaskIdForModal}
	<TaskEditModal
		taskId={selectedTaskIdForModal}
		{projectId}
		onClose={closeLinkedEntityModals}
		onUpdated={closeLinkedEntityModals}
		onDeleted={closeLinkedEntityModals}
	/>
{/if}

{#if showPlanModal && selectedPlanIdForModal}
	<PlanEditModal
		planId={selectedPlanIdForModal}
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

<!-- Milestone Create Modal -->
{#if showMilestoneCreateModal}
	{#await import('./MilestoneCreateModal.svelte') then { default: MilestoneCreateModal }}
		<MilestoneCreateModal
			{projectId}
			goals={[
				{
					id: goalId,
					name: name || goal?.name || 'Goal',
					state_key: stateKey,
					description: description
				}
			]}
			{goalId}
			goalName={name || goal?.name || 'Goal'}
			onClose={() => (showMilestoneCreateModal = false)}
			onCreated={handleMilestoneCreated}
		/>
	{/await}
{/if}

<!-- Milestone Edit Modal -->
{#if showMilestoneEditModal && editingMilestoneId}
	{#await import('./MilestoneEditModal.svelte') then { default: MilestoneEditModal }}
		<MilestoneEditModal
			milestoneId={editingMilestoneId}
			{projectId}
			onClose={() => {
				showMilestoneEditModal = false;
				editingMilestoneId = null;
			}}
			onUpdated={handleMilestoneUpdated}
			onDeleted={handleMilestoneDeleted}
		/>
	{/await}
{/if}

<!-- Chat About Modal (Lazy Loaded) -->
{#if showChatModal && AgentChatModalComponent && entityFocus}
	<AgentChatModalComponent
		isOpen={showChatModal}
		initialProjectFocus={entityFocus}
		onClose={handleChatClose}
	/>
{/if}
