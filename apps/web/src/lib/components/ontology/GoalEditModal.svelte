<!-- apps/web/src/lib/components/ontology/GoalEditModal.svelte -->
<!--
	Goal Edit Modal Component

	Provides full CRUD operations for goals within the BuildOS ontology system:
	- Edit goal details (name, description, priority, target date, state, etc.)
	- Visualize FSM state transitions
	- Delete goals with confirmation

	Documentation:
	- Ontology System Overview: /apps/web/docs/features/ontology/README.md
	- Data Models & Schema: /apps/web/docs/features/ontology/DATA_MODELS.md
	- Implementation Guide: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
	- Modal Design Patterns: /apps/web/docs/technical/components/modals/TECHNICAL_ANALYSIS.md

	Related Files:
	- API Endpoints: /apps/web/src/routes/api/onto/goals/[id]/+server.ts
	- Create Modal: /apps/web/src/lib/components/ontology/GoalCreateModal.svelte
	- FSM Visualizer: /apps/web/src/lib/components/ontology/FSMStateVisualizer.svelte

	Note: This modal uses custom layout instead of FormModal for advanced features
	like sidebar metadata and FSM visualization.
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import { Save, Loader, Trash2, Target } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import FSMStateVisualizer from './FSMStateVisualizer.svelte';
	import LinkedEntities from './linked-entities/LinkedEntities.svelte';
	import type { EntityKind } from './linked-entities/linked-entities.types';
	import TaskEditModal from './TaskEditModal.svelte';
	import PlanEditModal from './PlanEditModal.svelte';
	import DocumentModal from './DocumentModal.svelte';

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
	let isLoading = $state(true);
	let isSaving = $state(false);
	let isDeleting = $state(false);
	let error = $state('');
	let showDeleteConfirm = $state(false);

	// Form fields
	let name = $state('');
	let description = $state('');
	let priority = $state<string>('medium');
	let targetDate = $state('');
	let measurementCriteria = $state('');
	let stateKey = $state('draft');

	// FSM related
	let allowedTransitions = $state<any[]>([]);

	// Modal states for linked entity navigation
	let showTaskModal = $state(false);
	let selectedTaskIdForModal = $state<string | null>(null);
	let showPlanModal = $state(false);
	let selectedPlanIdForModal = $state<string | null>(null);
	let showDocumentModal = $state(false);
	let selectedDocumentIdForModal = $state<string | null>(null);

	// Load goal data when modal opens (client-side only)
	$effect(() => {
		if (browser) {
			loadGoal();
		}
	});

	async function loadGoal() {
		try {
			isLoading = true;
			const response = await fetch(`/api/onto/goals/${goalId}`);
			if (!response.ok) throw new Error('Failed to load goal');

			const data = await response.json();
			goal = data.data?.goal;

			if (goal) {
				name = goal.name || '';
				description = goal.props?.description || '';
				priority = goal.props?.priority || 'medium';
				targetDate = goal.props?.target_date || '';
				measurementCriteria = goal.props?.measurement_criteria || '';
				stateKey = goal.state_key || 'draft';
			}

			// Load FSM transitions if available
			await loadTransitions();
		} catch (err) {
			console.error('Error loading goal:', err);
			error = 'Failed to load goal';
		} finally {
			isLoading = false;
		}
	}

	async function loadTransitions() {
		try {
			const response = await fetch(`/api/onto/fsm/transitions?kind=goal&id=${goalId}`);
			if (response.ok) {
				const data = await response.json();
				allowedTransitions =
					(data.data?.transitions || []).map((transition: any) => ({
						...transition,
						can_run:
							typeof transition?.can_run === 'boolean'
								? (transition.can_run as boolean)
								: true,
						failed_guards: Array.isArray(transition?.failed_guards)
							? transition.failed_guards
							: []
					})) ?? [];
			}
		} catch (err) {
			console.error('Error loading transitions:', err);
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
				description: description.trim() || null,
				priority: priority || null,
				target_date: targetDate || null,
				measurement_criteria: measurementCriteria.trim() || null,
				state_key: stateKey
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
			error = err instanceof Error ? err.message : 'Failed to delete goal';
			isDeleting = false;
			showDeleteConfirm = false;
		}
	}

	async function handleStateChange(event: CustomEvent) {
		const newState = event.detail.newState;
		stateKey = newState;
		await handleSave();
		await loadTransitions();
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

	function closeLinkedEntityModals() {
		showTaskModal = false;
		showPlanModal = false;
		showDocumentModal = false;
		selectedTaskIdForModal = null;
		selectedPlanIdForModal = null;
		selectedDocumentIdForModal = null;
		// Refresh goal data to get updated linked entities
		loadGoal();
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
			class="flex-shrink-0 bg-muted/50 border-b border-border px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div
					class="p-1.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 shrink-0"
				>
					<Target class="w-4 h-4" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						{name || goal?.name || 'Goal'}
					</h2>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
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
			<Button
				variant="ghost"
				size="sm"
				onclick={handleClose}
				class="text-muted-foreground hover:text-foreground shrink-0 !p-1 sm:!p-1.5"
				disabled={isSaving || isDeleting}
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
		<!-- Main content - minimal padding on mobile -->
		<div class="px-3 py-3 sm:px-6 sm:py-6">
			{#if isLoading}
				<div class="flex items-center justify-center py-12">
					<Loader class="w-8 h-8 animate-spin text-muted-foreground" />
				</div>
			{:else if !goal}
				<div class="text-center py-8">
					<p class="text-destructive">Goal not found</p>
				</div>
			{:else}
				<div class="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
					<!-- Main Form (Left 2 columns) -->
					<div class="lg:col-span-2">
						<form
							onsubmit={(e) => {
								e.preventDefault();
								handleSave();
							}}
							class="space-y-6"
						>
							<FormField
								label="Goal Name"
								labelFor="name"
								required={true}
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
								hint="Describe what you want to achieve"
							>
								<Textarea
									id="description"
									bind:value={description}
									enterkeyhint="next"
									placeholder="Describe the goal..."
									rows={3}
									disabled={isSaving}
									size="md"
								/>
							</FormField>

							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<FormField
									label="Priority"
									labelFor="priority"
									required={true}
									hint="Set goal importance level"
								>
									<Select
										id="priority"
										bind:value={priority}
										disabled={isSaving}
										size="md"
										placeholder="Select priority"
									>
										<option value="high">High</option>
										<option value="medium">Medium</option>
										<option value="low">Low</option>
									</Select>
								</FormField>

								<FormField
									label="Target Date"
									labelFor="target-date"
									hint="When do you want to achieve this?"
								>
									<TextInput
										type="date"
										inputmode="numeric"
										enterkeyhint="next"
										id="target-date"
										bind:value={targetDate}
										disabled={isSaving}
									/>
								</FormField>
							</div>

							<FormField
								label="Success Criteria"
								labelFor="measurement-criteria"
								hint="How will you measure success?"
							>
								<Textarea
									id="measurement-criteria"
									bind:value={measurementCriteria}
									enterkeyhint="done"
									placeholder="How will you measure success..."
									rows={3}
									disabled={isSaving}
									size="md"
								/>
							</FormField>

							<!-- FSM State Visualizer -->
							{#if goal.type_key && allowedTransitions.length > 0}
								<div class="pt-4 border-t border-border">
									<FSMStateVisualizer
										entityId={goalId}
										entityKind="goal"
										entityName={name}
										currentState={stateKey}
										initialTransitions={allowedTransitions}
										on:stateChange={handleStateChange}
									/>
								</div>
							{:else}
								<FormField
									label="State"
									labelFor="state"
									required={true}
									hint="Current goal status"
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
										<option value="archived">Archived</option>
									</Select>
								</FormField>
							{/if}

							{#if error}
								<div
									class="p-4 bg-destructive/10 border border-destructive/30 rounded"
								>
									<p class="text-sm text-destructive">{error}</p>
								</div>
							{/if}
						</form>
					</div>

					<!-- Sidebar (Right column) -->
					<div class="space-y-4">
						<!-- Linked Entities -->
						<LinkedEntities
							sourceId={goalId}
							sourceKind="goal"
							{projectId}
							onEntityClick={handleLinkedEntityClick}
							onLinksChanged={loadGoal}
						/>

						<!-- Goal Metadata -->
						<Card variant="elevated">
							<CardHeader variant="default">
								<h3
									class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2"
								>
									<span class="w-1.5 h-1.5 bg-accent rounded-full"></span>
									Goal Information
								</h3>
							</CardHeader>
							<CardBody padding="sm">
								<div class="space-y-2 text-sm">
									<div class="flex justify-between items-center">
										<span class="text-muted-foreground">Type:</span>
										<Badge variant="info" size="sm">
											{goal.type_key || 'goal.outcome.project'}
										</Badge>
									</div>

									<div class="flex justify-between">
										<span class="text-muted-foreground">ID:</span>
										<span class="font-mono text-xs text-muted-foreground"
											>{goal.id.slice(0, 8)}...</span
										>
									</div>

									{#if goal.created_at}
										<div class="flex justify-between">
											<span class="text-muted-foreground">Created:</span>
											<span class="text-foreground">
												{new Date(goal.created_at).toLocaleDateString()}
											</span>
										</div>
									{/if}

									{#if goal.updated_at}
										<div class="flex justify-between">
											<span class="text-muted-foreground">Updated:</span>
											<span class="text-foreground">
												{new Date(goal.updated_at).toLocaleDateString()}
											</span>
										</div>
									{/if}
								</div>
							</CardBody>
						</Card>
					</div>
				</div>
			{/if}
		</div>
	{/snippet}

	<!-- Footer Actions - delete on left, cancel/save on right -->
	{#snippet footer()}
		{#if !isLoading && goal}
			<div
				class="flex flex-row items-center justify-between gap-2 sm:gap-4 p-2 sm:p-4 border-t border-border bg-muted/30 tx tx-grain tx-weak"
			>
				<!-- Delete button on left -->
				<div class="flex items-center gap-1.5 sm:gap-2">
					<Trash2 class="w-3 h-3 sm:w-4 sm:h-4 text-red-500 shrink-0" />
					<Button
						type="button"
						variant="danger"
						size="sm"
						onclick={() => (showDeleteConfirm = true)}
						disabled={isDeleting || isSaving}
						class="text-[10px] sm:text-xs px-2 py-1 sm:px-3 sm:py-1.5"
					>
						<span class="hidden sm:inline">Delete</span>
						<span class="sm:hidden">Del</span>
					</Button>
				</div>

				<!-- Cancel and Save on right -->
				<div class="flex flex-row items-center gap-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onclick={handleClose}
						disabled={isSaving || isDeleting}
						class="text-xs sm:text-sm px-2 sm:px-4"
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
						class="text-xs sm:text-sm px-2 sm:px-4"
					>
						<Save class="w-3 h-3 sm:w-4 sm:h-4" />
						<span class="hidden sm:inline">Save Changes</span>
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
		title="Delete Goal"
		confirmText="Delete Goal"
		confirmVariant="danger"
		loading={isDeleting}
		loadingText="Deleting..."
		icon="danger"
		on:confirm={handleDelete}
		on:cancel={() => (showDeleteConfirm = false)}
	>
		<p class="text-sm text-gray-600 dark:text-gray-300" slot="content">
			This action cannot be undone. The goal and all its data will be permanently deleted.
		</p>
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
