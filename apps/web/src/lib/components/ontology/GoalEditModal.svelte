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
	import { Save, Loader, Trash2, Target, X } from 'lucide-svelte';
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
	import LinkedEntities from './linked-entities/LinkedEntities.svelte';
	import TagsDisplay from './TagsDisplay.svelte';
	import EntityActivityLog from './EntityActivityLog.svelte';
	import EntityCommentsSection from './EntityCommentsSection.svelte';
	import { GOAL_STATES } from '$lib/types/onto';
	import type { EntityKind, LinkedEntitiesResult } from './linked-entities/linked-entities.types';
	import type { ComponentType } from 'svelte';
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import TaskEditModal from './TaskEditModal.svelte';
	import PlanEditModal from './PlanEditModal.svelte';
	import DocumentModal from './DocumentModal.svelte';
	import GoalMilestonesSidebarSection from './GoalMilestonesSidebarSection.svelte';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';

	// Lazy-loaded AgentChatModal for better initial load performance
	let AgentChatModalComponent = $state<ComponentType<any> | null>(null);

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

	// Extract milestones from linkedEntities for the dedicated section
	const milestones = $derived(linkedEntities?.milestones ?? []);

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
>
	{#snippet header()}
		<!-- Header: Strip texture (semantic band) + Plate weight (system authority) -->
		<div
			class="flex-shrink-0 bg-muted border-b border-border px-4 py-2.5 flex items-center justify-between gap-2.5 tx tx-strip tx-weak wt-plate"
		>
			<div class="flex items-center gap-2.5 min-w-0 flex-1">
				<div
					class="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent shrink-0 shadow-ink-inner"
				>
					<Target class="w-5 h-5" />
				</div>
				<div class="min-w-0 flex-1">
					<h2 class="text-base font-semibold leading-none truncate text-foreground">
						{name || goal?.name || 'Goal'}
					</h2>
					<p class="text-[10px] text-muted-foreground mt-1 leading-none">
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
				<!-- Chat about this goal -->
				<button
					type="button"
					onclick={openChatAbout}
					disabled={isLoading || isSaving || !goal}
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card border border-border text-muted-foreground shadow-ink transition-all duration-150 pressable hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 tx tx-grain tx-weak"
					title="Chat about this goal"
				>
					<img src="/brain-bolt.png" alt="Chat" class="w-4 h-4 rounded object-cover" />
				</button>
				<!-- Close button -->
				<button
					type="button"
					onclick={handleClose}
					disabled={isSaving || isDeleting}
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card border border-border text-muted-foreground shadow-ink transition-all duration-150 pressable hover:border-red-500/50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 tx tx-grain tx-weak dark:hover:border-red-400/50 dark:hover:text-red-400"
					aria-label="Close"
				>
					<X class="w-4 h-4" />
				</button>
			</div>
		</div>
	{/snippet}

	{#snippet children()}
		<!-- Main content: Maximum information density on 8px grid -->
		<div class="px-4 py-3">
			{#if isLoading}
				<div
					class="flex items-center justify-center py-12 rounded-lg bg-muted/30 tx tx-pulse tx-weak"
				>
					<Loader class="w-8 h-8 animate-spin text-muted-foreground" />
				</div>
			{:else if !goal}
				<div
					class="flex items-center justify-center py-8 rounded-lg border-2 border-dashed border-destructive/30 bg-destructive/5 tx tx-static tx-weak"
				>
					<p class="text-xs font-semibold text-destructive">Goal not found</p>
				</div>
			{:else}
				<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
					<!-- Main Form: Paper weight for standard working state -->
					<div class="lg:col-span-2 wt-paper">
						<form
							onsubmit={(e) => {
								e.preventDefault();
								handleSave();
							}}
							class="space-y-3"
						>
							<FormField
								label="Goal Name"
								labelFor="name"
								required={true}
								uppercase={false}
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

							<FormField label="Description" labelFor="description" uppercase={false}>
								<Textarea
									id="description"
									bind:value={description}
									enterkeyhint="next"
									placeholder="Describe what you want to achieve..."
									rows={2}
									disabled={isSaving}
									size="sm"
								/>
							</FormField>

							<FormField
								label="Goal Details"
								labelFor="goal-details"
								uppercase={false}
							>
								<Textarea
									id="goal-details"
									bind:value={goalDetails}
									enterkeyhint="next"
									placeholder="Add context or structured goal notes..."
									rows={2}
									disabled={isSaving}
									size="sm"
								/>
							</FormField>

							<!-- Priority + State: Compact row (8px gap) -->
							<div class="grid grid-cols-2 gap-2">
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

							<FormField label="Target Date" labelFor="target-date" uppercase={false}>
								<TextInput
									type="date"
									inputmode="numeric"
									enterkeyhint="next"
									id="target-date"
									bind:value={targetDate}
									disabled={isSaving}
								/>
							</FormField>

							<FormField
								label="Success Criteria"
								labelFor="measurement-criteria"
								uppercase={false}
							>
								<Textarea
									id="measurement-criteria"
									bind:value={measurementCriteria}
									enterkeyhint="done"
									placeholder="How will you measure success..."
									rows={2}
									disabled={isSaving}
									size="sm"
								/>
							</FormField>

							{#if error}
								<div
									class="px-3 py-2 bg-destructive/10 border border-destructive/30 rounded-lg shadow-ink-inner tx tx-static tx-weak"
								>
									<p class="text-xs font-medium text-destructive leading-tight">
										{error}
									</p>
								</div>
							{/if}
						</form>
					</div>

					<!-- Sidebar: Card weight (important elevation) -->
					<div class="space-y-3 wt-card">
						<!-- Linked Entities (Thread texture for relationships) -->
						<LinkedEntities
							sourceId={goalId}
							sourceKind="goal"
							{projectId}
							initialLinkedEntities={linkedEntities}
							onEntityClick={handleLinkedEntityClick}
							onLinksChanged={handleLinksChanged}
						/>

						<!-- Milestones (Grain texture for execution) -->
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

						<!-- Tags (Frame + Card) -->
						{#if goal?.props?.tags?.length}
							<Card variant="elevated" texture="frame" weight="card">
								<CardHeader variant="compact">
									<h3
										class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"
									>
										<span class="w-1 h-1 bg-accent rounded-full"></span>
										Tags
									</h3>
								</CardHeader>
								<CardBody padding="sm">
									<TagsDisplay props={goal.props} size="sm" compact={true} />
								</CardBody>
							</Card>
						{/if}

						<!-- Metadata (Frame + Card) -->
						<Card variant="elevated" texture="frame" weight="card">
							<CardHeader variant="compact">
								<h3
									class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"
								>
									<span class="w-1 h-1 bg-accent rounded-full"></span>
									Metadata
								</h3>
							</CardHeader>
							<CardBody padding="sm">
								<dl class="space-y-1">
									<div class="flex justify-between gap-2 items-start">
										<dt class="text-[10px] text-muted-foreground shrink-0">
											ID
										</dt>
										<dd
											class="font-mono text-[9px] text-muted-foreground break-all text-right leading-tight"
										>
											{goal.id}
										</dd>
									</div>

									{#if goal.created_at}
										<div class="flex justify-between gap-2">
											<dt class="text-[10px] text-muted-foreground">
												Created
											</dt>
											<dd class="text-[10px] text-foreground">
												{new Date(goal.created_at).toLocaleDateString(
													undefined,
													{
														month: 'short',
														day: 'numeric',
														year: '2-digit'
													}
												)}
											</dd>
										</div>
									{/if}

									{#if goal.updated_at}
										<div class="flex justify-between gap-2">
											<dt class="text-[10px] text-muted-foreground">
												Updated
											</dt>
											<dd class="text-[10px] text-foreground">
												{new Date(goal.updated_at).toLocaleDateString(
													undefined,
													{
														month: 'short',
														day: 'numeric',
														year: '2-digit'
													}
												)}
											</dd>
										</div>
									{/if}
								</dl>
							</CardBody>
						</Card>

						<!-- Activity Log -->
						<EntityActivityLog
							entityType="goal"
							entityId={goalId}
							autoLoad={!isLoading}
						/>
					</div>
				</div>

				<!-- Comments (Thread texture for collaboration) -->
				<div class="mt-4 pt-4 border-t border-border/80 tx tx-thread tx-weak">
					<EntityCommentsSection {projectId} entityType="goal" entityId={goalId} />
				</div>
			{/if}
		</div>
	{/snippet}

	<!-- Footer: Grain texture (execution) + Plate weight (authority) -->
	{#snippet footer()}
		{#if !isLoading && goal}
			<div
				class="flex items-center justify-between gap-2.5 px-4 py-2.5 border-t border-border bg-muted tx tx-grain tx-weak wt-plate"
			>
				<!-- Delete button on left -->
				<Button
					type="button"
					variant="danger"
					size="sm"
					onclick={() => (showDeleteConfirm = true)}
					disabled={isDeleting || isSaving}
					icon={Trash2}
					iconSize="sm"
				>
					Delete
				</Button>

				<!-- Actions on right -->
				<div class="flex items-center gap-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onclick={handleClose}
						disabled={isSaving || isDeleting}
					>
						Cancel
					</Button>
					<Button
						type="button"
						variant="primary"
						size="sm"
						onclick={handleSave}
						loading={isSaving}
						disabled={isSaving || isDeleting || !name.trim()}
						icon={Save}
						iconSize="sm"
					>
						Save Changes
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
