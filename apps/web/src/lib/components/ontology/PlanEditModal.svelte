<!-- apps/web/src/lib/components/ontology/PlanEditModal.svelte -->
<!--
	Plan Edit Modal Component

	Provides full CRUD operations for plans within the BuildOS ontology system:
	- Edit plan details (name, description, dates, state, etc.)
	- Visualize FSM state transitions
	- Delete plans with confirmation

	Documentation:
	- Ontology System Overview: /apps/web/docs/features/ontology/README.md
	- Data Models & Schema: /apps/web/docs/features/ontology/DATA_MODELS.md
	- Implementation Guide: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
	- Modal Design Patterns: /apps/web/docs/technical/components/modals/TECHNICAL_ANALYSIS.md

	Related Files:
	- API Endpoints: /apps/web/src/routes/api/onto/plans/[id]/+server.ts
	- Create Modal: /apps/web/src/lib/components/ontology/PlanCreateModal.svelte
	- FSM Visualizer: /apps/web/src/lib/components/ontology/FSMStateVisualizer.svelte

	Note: This modal uses custom layout instead of FormModal for advanced features
	like sidebar metadata and FSM visualization.
-->
<script lang="ts">
	import { X, Save, Loader, Trash2 } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import { fade } from 'svelte/transition';
	import FSMStateVisualizer from './FSMStateVisualizer.svelte';

	interface Props {
		planId: string;
		projectId: string;
		onClose: () => void;
		onUpdated?: () => void;
		onDeleted?: () => void;
	}

	let { planId, projectId, onClose, onUpdated, onDeleted }: Props = $props();

	let plan = $state<any>(null);
	let isLoading = $state(true);
	let isSaving = $state(false);
	let isDeleting = $state(false);
	let error = $state('');
	let showDeleteConfirm = $state(false);

	// Form fields
	let name = $state('');
	let description = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let stateKey = $state('draft');

	// FSM related
	let allowedTransitions = $state<any[]>([]);

	// Load plan data when modal opens
	$effect(() => {
		loadPlan();
	});

	async function loadPlan() {
		try {
			isLoading = true;
			const response = await fetch(`/api/onto/plans/${planId}`);
			if (!response.ok) throw new Error('Failed to load plan');

			const data = await response.json();
			plan = data.data?.plan;

			if (plan) {
				name = plan.name || '';
				description = plan.props?.description || '';
				startDate = plan.props?.start_date || '';
				endDate = plan.props?.end_date || '';
				stateKey = plan.state_key || 'draft';
			}

			// Load FSM transitions if available
			await loadTransitions();
		} catch (err) {
			console.error('Error loading plan:', err);
			error = 'Failed to load plan';
		} finally {
			isLoading = false;
		}
	}

	async function loadTransitions() {
		try {
			const response = await fetch(
				`/api/onto/fsm/transitions?entity_id=${planId}&entity_kind=plan`
			);
			if (response.ok) {
				const data = await response.json();
				allowedTransitions = data.data?.transitions || [];
			}
		} catch (err) {
			console.error('Error loading transitions:', err);
		}
	}

	async function handleSave() {
		if (!name.trim()) {
			error = 'Plan name is required';
			return;
		}

		isSaving = true;
		error = '';

		try {
			const requestBody = {
				name: name.trim(),
				description: description.trim() || null,
				start_date: startDate || null,
				end_date: endDate || null,
				state_key: stateKey
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

			// Success! Call the callback and close
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

			// Success! Call the callback and close
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

	async function handleStateChange(event: CustomEvent) {
		const newState = event.detail.newState;
		stateKey = newState;
		await handleSave();
		await loadTransitions();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && !isSaving && !isDeleting) {
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Modal Backdrop -->
<button
	class="fixed inset-0 bg-black/50 dark:bg-black/70 z-40 cursor-default"
	onclick={onClose}
	disabled={isSaving || isDeleting}
	aria-label="Close dialog"
	transition:fade={{ duration: 200 }}
></button>

<!-- Modal Content -->
<div
	class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl max-h-[90vh] overflow-hidden z-50"
	transition:fade={{ duration: 200 }}
>
	<Card variant="elevated" class="shadow-2xl">
		<CardHeader variant="gradient" class="p-6">
			<div class="flex items-center justify-between">
				<h2 class="text-2xl font-bold text-white">Edit Plan</h2>
				<button
					onclick={onClose}
					disabled={isSaving || isDeleting}
					class="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
					aria-label="Close"
				>
					<X class="w-5 h-5 text-white" />
				</button>
			</div>
		</CardHeader>

		<CardBody class="max-h-[calc(90vh-120px)] overflow-y-auto p-6">
			{#if isLoading}
				<div class="flex items-center justify-center py-12">
					<Loader class="w-8 h-8 animate-spin text-gray-400" />
				</div>
			{:else if !plan}
				<div class="text-center py-8">
					<p class="text-red-600 dark:text-red-400">Plan not found</p>
				</div>
			{:else}
				<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
					<!-- Main Form (Left 2 columns) -->
					<div class="lg:col-span-2">
						<form
							onsubmit={(e) => {
								e.preventDefault();
								handleSave();
							}}
							class="space-y-6"
						>
							<div>
								<label
									for="name"
									class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
								>
									Plan Name
								</label>
								<input
									type="text"
									id="name"
									bind:value={name}
									placeholder="Enter plan name..."
									required
									disabled={isSaving}
									class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
								/>
							</div>

							<div>
								<label
									for="description"
									class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
								>
									Description
								</label>
								<textarea
									id="description"
									bind:value={description}
									placeholder="Describe the plan..."
									rows={4}
									disabled={isSaving}
									class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed resize-none"
								></textarea>
							</div>

							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div>
									<label
										for="start-date"
										class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
									>
										Start Date
									</label>
									<input
										type="date"
										id="start-date"
										bind:value={startDate}
										disabled={isSaving}
										class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
									/>
								</div>

								<div>
									<label
										for="end-date"
										class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
									>
										End Date
									</label>
									<input
										type="date"
										id="end-date"
										bind:value={endDate}
										disabled={isSaving}
										class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
									/>
								</div>
							</div>

							<!-- FSM State Visualizer -->
							{#if plan.type_key && allowedTransitions.length > 0}
								<div class="pt-4 border-t border-gray-200 dark:border-gray-700">
									<FSMStateVisualizer
										entityId={planId}
										entityKind="plan"
										entityName={name}
										currentState={stateKey}
										initialTransitions={allowedTransitions}
										on:stateChange={handleStateChange}
									/>
								</div>
							{:else}
								<div>
									<label
										for="state"
										class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
									>
										State
									</label>
									<select
										id="state"
										bind:value={stateKey}
										disabled={isSaving}
										class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
									>
										<option value="draft">Draft</option>
										<option value="planning">Planning</option>
										<option value="active">Active</option>
										<option value="paused">Paused</option>
										<option value="complete">Complete</option>
										<option value="archived">Archived</option>
									</select>
								</div>
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
						<!-- Plan Metadata -->
						<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
							<h3
								class="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide"
							>
								Plan Information
							</h3>

							<div class="space-y-2 text-sm">
								<div class="flex justify-between">
									<span class="text-gray-600 dark:text-gray-400">Type:</span>
									<span class="font-mono text-gray-900 dark:text-white"
										>{plan.type_key || 'plan.basic'}</span
									>
								</div>

								<div class="flex justify-between">
									<span class="text-gray-600 dark:text-gray-400">ID:</span>
									<span class="font-mono text-xs text-gray-500 dark:text-gray-500"
										>{plan.id.slice(0, 8)}...</span
									>
								</div>

								{#if plan.created_at}
									<div class="flex justify-between">
										<span class="text-gray-600 dark:text-gray-400"
											>Created:</span
										>
										<span class="text-gray-900 dark:text-white">
											{new Date(plan.created_at).toLocaleDateString()}
										</span>
									</div>
								{/if}

								{#if plan.updated_at}
									<div class="flex justify-between">
										<span class="text-gray-600 dark:text-gray-400"
											>Updated:</span
										>
										<span class="text-gray-900 dark:text-white">
											{new Date(plan.updated_at).toLocaleDateString()}
										</span>
									</div>
								{/if}
							</div>
						</div>

						<!-- Danger Zone -->
						<div class="border border-red-200 dark:border-red-800 rounded-lg p-4">
							<h3
								class="text-sm font-semibold text-red-700 dark:text-red-400 mb-3 uppercase tracking-wide"
							>
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
									Delete Plan
								</Button>
							{:else}
								<div class="space-y-3">
									<p class="text-sm text-red-700 dark:text-red-300">
										Are you sure you want to delete this plan? This action
										cannot be undone.
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

				<!-- Action Buttons -->
				<div
					class="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-gray-200 dark:border-gray-700"
				>
					<Button
						type="button"
						variant="ghost"
						onclick={onClose}
						disabled={isSaving || isDeleting}
					>
						Cancel
					</Button>
					<Button
						type="button"
						variant="primary"
						onclick={handleSave}
						disabled={isSaving || isDeleting || !name.trim()}
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
		</CardBody>
	</Card>
</div>
