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
	import { Save, Loader, Trash2 } from 'lucide-svelte';
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

	// Load goal data when modal opens
	$effect(() => {
		loadGoal();
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
</script>

<Modal
	bind:isOpen={modalOpen}
	size="lg"
	onClose={handleClose}
	closeOnEscape={!isSaving && !isDeleting}
	title="Edit Goal: {name || 'Loading...'}"
>
	<div class="p-4 sm:p-6">
		{#if isLoading}
			<div class="flex items-center justify-center py-12">
				<Loader class="w-8 h-8 animate-spin text-gray-400" />
			</div>
		{:else if !goal}
			<div class="text-center py-8">
				<p class="text-red-600 dark:text-red-400">Goal not found</p>
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
								placeholder="How will you measure success..."
								rows={3}
								disabled={isSaving}
								size="md"
							/>
						</FormField>

						<!-- FSM State Visualizer -->
						{#if goal.type_key && allowedTransitions.length > 0}
							<div class="pt-4 border-t border-gray-200 dark:border-gray-700">
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
								class="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
							>
								<p class="text-sm text-red-700 dark:text-red-300">{error}</p>
							</div>
						{/if}
					</form>
				</div>

				<!-- Sidebar (Right column) -->
				<div class="space-y-4">
					<!-- Goal Metadata -->
					<Card variant="elevated">
						<CardHeader variant="default">
							<h3
								class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex items-center gap-2"
							>
								<span class="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
								Goal Information
							</h3>
						</CardHeader>
						<CardBody padding="sm">
							<div class="space-y-2 text-sm">
								<div class="flex justify-between items-center">
									<span class="text-gray-600 dark:text-gray-400">Type:</span>
									<Badge variant="info" size="sm">
										{goal.type_key || 'goal.basic'}
									</Badge>
								</div>

								<div class="flex justify-between">
									<span class="text-gray-600 dark:text-gray-400">ID:</span>
									<span class="font-mono text-xs text-gray-500"
										>{goal.id.slice(0, 8)}...</span
									>
								</div>

								{#if goal.created_at}
									<div class="flex justify-between">
										<span class="text-gray-600 dark:text-gray-400"
											>Created:</span
										>
										<span class="text-gray-900 dark:text-white">
											{new Date(goal.created_at).toLocaleDateString()}
										</span>
									</div>
								{/if}

								{#if goal.updated_at}
									<div class="flex justify-between">
										<span class="text-gray-600 dark:text-gray-400"
											>Updated:</span
										>
										<span class="text-gray-900 dark:text-white">
											{new Date(goal.updated_at).toLocaleDateString()}
										</span>
									</div>
								{/if}
							</div>
						</CardBody>
					</Card>

					<!-- Danger Zone -->
					<div
						class="border-2 border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 rounded-lg p-4"
					>
						<h3
							class="text-xs font-semibold text-red-700 dark:text-red-400 mb-3 uppercase tracking-wide flex items-center gap-2"
						>
							<span class="text-base">⚠️</span>
							Danger Zone
						</h3>

						{#if !showDeleteConfirm}
							<Button
								variant="danger"
								size="sm"
								onclick={() => (showDeleteConfirm = true)}
								disabled={isDeleting}
								class="w-full"
							>
								<Trash2 class="w-4 h-4" />
								Delete Goal
							</Button>
						{:else}
							<div class="space-y-3">
								<p class="text-sm text-red-700 dark:text-red-300">
									Are you sure you want to delete this goal? This action cannot be
									undone.
								</p>
								<div class="flex gap-2">
									<Button
										variant="danger"
										size="sm"
										onclick={handleDelete}
										disabled={isDeleting}
										class="flex-1"
									>
										{#if isDeleting}
											<Loader class="w-4 h-4 animate-spin" />
											Deleting...
										{:else}
											Yes, Delete
										{/if}
									</Button>
									<Button
										variant="ghost"
										size="sm"
										onclick={() => (showDeleteConfirm = false)}
										disabled={isDeleting}
										class="flex-1"
									>
										Cancel
									</Button>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Footer Actions -->
	<svelte:fragment slot="footer">
		{#if !isLoading && goal}
			<div
				class="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/50 dark:to-gray-800/50"
			>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={handleClose}
					disabled={isSaving || isDeleting}
					class="w-full sm:w-auto"
				>
					Cancel
				</Button>
				<Button
					type="button"
					variant="primary"
					size="sm"
					onclick={handleSave}
					disabled={isSaving || isDeleting || !name.trim()}
					class="w-full sm:w-auto"
				>
					{#if isSaving}
						<Loader class="w-4 h-4 animate-spin" />
						Saving...
					{:else}
						<Save class="w-4 h-4" />
						Save Changes
					{/if}
				</Button>
			</div>
		{/if}
	</svelte:fragment>
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
