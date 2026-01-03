<!-- apps/web/src/lib/components/ontology/DecisionEditModal.svelte -->
<!--
	Decision Edit Modal Component

	Provides full CRUD operations for decisions within the BuildOS ontology system:
	- Edit decision details (title, description, outcome, rationale, state, date)
	- View linked entities
	- Delete decisions with confirmation

	Documentation:
	- Ontology System Overview: /apps/web/docs/features/ontology/README.md
	- Mobile Command Center: /apps/web/docs/features/mobile-command-center/MOBILE_COMMAND_CENTER_SPEC.md
	- Modal Design Patterns: /apps/web/docs/technical/components/modals/TECHNICAL_ANALYSIS.md

	Related Files:
	- API Endpoints: /apps/web/src/routes/api/onto/decisions/[id]/+server.ts
	- Create Modal: /apps/web/src/lib/components/ontology/DecisionCreateModal.svelte
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import { Save, Loader, Trash2, Scale, X } from 'lucide-svelte';
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
	import LinkedEntities from './linked-entities/LinkedEntities.svelte';
	import TagsDisplay from './TagsDisplay.svelte';
	import type { EntityKind } from './linked-entities/linked-entities.types';
	import TaskEditModal from './TaskEditModal.svelte';
	import PlanEditModal from './PlanEditModal.svelte';
	import GoalEditModal from './GoalEditModal.svelte';
	import RiskEditModal from './RiskEditModal.svelte';
	import { DECISION_STATES } from '$lib/types/onto';

	interface Props {
		decisionId: string;
		projectId: string;
		onClose: () => void;
		onUpdated?: () => void;
		onDeleted?: () => void;
	}

	let { decisionId, projectId, onClose, onUpdated, onDeleted }: Props = $props();

	const STATE_OPTIONS = [
		{
			value: 'pending',
			label: 'Pending',
			color: 'text-muted-foreground',
			description: 'Awaiting decision'
		},
		{
			value: 'made',
			label: 'Made',
			color: 'text-emerald-500',
			description: 'Decision finalized'
		},
		{ value: 'deferred', label: 'Deferred', color: 'text-amber-500', description: 'Postponed' },
		{
			value: 'reversed',
			label: 'Reversed',
			color: 'text-red-500',
			description: 'Decision overturned'
		}
	];

	const TYPE_OPTIONS = [
		{ value: 'decision.default', label: 'Unclassified' },
		{ value: 'decision.technical', label: 'Technical' },
		{ value: 'decision.process', label: 'Process' },
		{ value: 'decision.resource', label: 'Resource' },
		{ value: 'decision.strategic', label: 'Strategic' },
		{ value: 'decision.operational', label: 'Operational' }
	];

	function formatDateTimeLocal(value?: string | null): string {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		const pad = (num: number) => String(num).padStart(2, '0');
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
			date.getHours()
		)}:${pad(date.getMinutes())}`;
	}

	let modalOpen = $state(true);
	let decision = $state<any>(null);
	let isLoading = $state(true);
	let isSaving = $state(false);
	let isDeleting = $state(false);
	let error = $state('');
	let showDeleteConfirm = $state(false);

	// Form fields
	let title = $state('');
	let description = $state('');
	let outcome = $state('');
	let rationale = $state('');
	let stateKey = $state('pending');
	let decisionAt = $state('');
	let typeKey = $state('decision.default');

	// Modal states for linked entity navigation
	let showTaskModal = $state(false);
	let selectedTaskIdForModal = $state<string | null>(null);
	let showPlanModal = $state(false);
	let selectedPlanIdForModal = $state<string | null>(null);
	let showGoalModal = $state(false);
	let selectedGoalIdForModal = $state<string | null>(null);
	let showRiskModal = $state(false);
	let selectedRiskIdForModal = $state<string | null>(null);

	// Computed state badge styling
	const stateBadge = $derived(STATE_OPTIONS.find((o) => o.value === stateKey));

	// Load decision data when modal opens (client-side only)
	$effect(() => {
		if (browser) {
			loadDecision();
		}
	});

	async function loadDecision() {
		try {
			isLoading = true;
			const response = await fetch(`/api/onto/decisions/${decisionId}`);
			if (!response.ok) throw new Error('Failed to load decision');

			const data = await response.json();
			decision = data.data?.decision;

			if (decision) {
				title = decision.title || '';
				description = decision.description || '';
				outcome = decision.outcome || '';
				rationale = decision.rationale || '';
				stateKey = decision.state_key || 'pending';
				decisionAt = formatDateTimeLocal(decision.decision_at);
				typeKey = decision.type_key || 'decision.default';
			}
		} catch (err) {
			console.error('Error loading decision:', err);
			error = 'Failed to load decision';
		} finally {
			isLoading = false;
		}
	}

	async function handleSave() {
		if (!title.trim()) {
			error = 'Decision title is required';
			return;
		}
		if (!typeKey.trim()) {
			error = 'Decision type is required';
			return;
		}

		isSaving = true;
		error = '';

		try {
			const requestBody: Record<string, unknown> = {
				title: title.trim(),
				state_key: stateKey,
				description: description.trim() || null,
				outcome: outcome.trim() || null,
				rationale: rationale.trim() || null,
				type_key: typeKey.trim()
			};

			if (decisionAt) {
				requestBody.decision_at = new Date(decisionAt).toISOString();
			} else {
				requestBody.decision_at = null;
			}

			const response = await fetch(`/api/onto/decisions/${decisionId}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody)
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to update decision');
			}

			if (onUpdated) {
				onUpdated();
			}
			onClose();
		} catch (err) {
			console.error('Error updating decision:', err);
			error = err instanceof Error ? err.message : 'Failed to update decision';
			isSaving = false;
		}
	}

	async function handleDelete() {
		isDeleting = true;
		error = '';

		try {
			const response = await fetch(`/api/onto/decisions/${decisionId}`, {
				method: 'DELETE'
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to delete decision');
			}

			if (onDeleted) {
				onDeleted();
			}
			onClose();
		} catch (err) {
			console.error('Error deleting decision:', err);
			error = err instanceof Error ? err.message : 'Failed to delete decision';
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
			case 'goal':
				selectedGoalIdForModal = id;
				showGoalModal = true;
				break;
			case 'risk':
				selectedRiskIdForModal = id;
				showRiskModal = true;
				break;
			default:
				console.warn(`Unhandled entity kind: ${kind}`);
		}
	}

	function closeLinkedEntityModals() {
		showTaskModal = false;
		showPlanModal = false;
		showGoalModal = false;
		showRiskModal = false;
		selectedTaskIdForModal = null;
		selectedPlanIdForModal = null;
		selectedGoalIdForModal = null;
		selectedRiskIdForModal = null;
		loadDecision();
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
		<div
			class="flex-shrink-0 bg-muted/50 border-b border-border px-2 py-1.5 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div
					class="flex h-9 w-9 items-center justify-center rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0"
				>
					<Scale class="w-5 h-5" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						{title || decision?.title || 'Decision'}
					</h2>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
						{#if decision?.created_at}Created {new Date(
								decision.created_at
							).toLocaleDateString(undefined, {
								month: 'short',
								day: 'numeric'
							})}{/if}{#if decision?.updated_at && decision.updated_at !== decision.created_at}
							· Updated {new Date(decision.updated_at).toLocaleDateString(undefined, {
								month: 'short',
								day: 'numeric'
							})}{/if}
					</p>
				</div>
			</div>
			<div class="flex items-center gap-1.5">
				<button
					type="button"
					onclick={handleClose}
					disabled={isSaving || isDeleting}
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border bg-card text-muted-foreground shadow-ink transition-all pressable hover:border-red-600/50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:hover:border-red-400/50 dark:hover:text-red-400 tx tx-grain tx-weak"
					aria-label="Close modal"
				>
					<X class="w-5 h-5" />
				</button>
			</div>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="px-2 py-2 sm:px-6 sm:py-4">
			{#if isLoading}
				<div class="flex items-center justify-center py-12">
					<Loader class="w-8 h-8 animate-spin text-muted-foreground" />
				</div>
			{:else if !decision}
				<div class="text-center py-8">
					<p class="text-destructive">Decision not found</p>
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
							class="space-y-3 sm:space-y-4"
						>
							<FormField
								label="Decision Title"
								labelFor="title"
								required={true}
								error={!title.trim() && error ? 'Decision title is required' : ''}
							>
								<TextInput
									id="title"
									bind:value={title}
									inputmode="text"
									enterkeyhint="next"
									placeholder="What decision was made?"
									required={true}
									disabled={isSaving}
									error={!title.trim() && error ? true : false}
								/>
							</FormField>

							<FormField
								label="Decision Type"
								labelFor="type_key"
								required={true}
								error={!typeKey.trim() && error ? 'Decision type is required' : ''}
							>
								<Select
									id="type_key"
									bind:value={typeKey}
									disabled={isSaving}
									size="md"
								>
									{#each TYPE_OPTIONS as opt}
										<option value={opt.value}>{opt.label}</option>
									{/each}
								</Select>
							</FormField>

							<FormField
								label="Context"
								labelFor="description"
								hint="Background for this decision"
							>
								<Textarea
									id="description"
									bind:value={description}
									enterkeyhint="next"
									placeholder="What context led to this decision?"
									rows={2}
									disabled={isSaving}
									size="md"
								/>
							</FormField>

							<FormField label="Outcome" labelFor="outcome" hint="What was decided">
								<Textarea
									id="outcome"
									bind:value={outcome}
									enterkeyhint="next"
									placeholder="The actual decision made..."
									rows={2}
									disabled={isSaving}
									size="md"
								/>
							</FormField>

							<FormField
								label="Rationale"
								labelFor="rationale"
								hint="Why this choice was made"
							>
								<Textarea
									id="rationale"
									bind:value={rationale}
									enterkeyhint="next"
									placeholder="The reasoning behind this decision..."
									rows={2}
									disabled={isSaving}
									size="md"
								/>
							</FormField>

							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<FormField label="State" labelFor="state" required={true}>
									<Select
										id="state"
										bind:value={stateKey}
										disabled={isSaving}
										size="md"
									>
										{#each STATE_OPTIONS as opt}
											<option value={opt.value}>{opt.label}</option>
										{/each}
									</Select>
								</FormField>

								<FormField
									label="Decision Date"
									labelFor="decision_at"
									hint="When was this decided?"
								>
									<TextInput
										id="decision_at"
										type="datetime-local"
										bind:value={decisionAt}
										disabled={isSaving}
										size="md"
									/>
								</FormField>
							</div>

							{#if error}
								<div
									class="p-3 sm:p-4 bg-destructive/10 border border-destructive/30 rounded"
								>
									<p class="text-xs sm:text-sm text-destructive">{error}</p>
								</div>
							{/if}
						</form>
					</div>

					<!-- Sidebar (Right column) -->
					<div class="space-y-4">
						<!-- Linked Entities -->
						<LinkedEntities
							sourceId={decisionId}
							sourceKind="decision"
							{projectId}
							onEntityClick={handleLinkedEntityClick}
							onLinksChanged={loadDecision}
						/>

						<!-- Tags Display -->
						{#if decision?.props?.tags?.length}
							<Card variant="elevated">
								<CardBody padding="sm">
									<TagsDisplay props={decision.props} />
								</CardBody>
							</Card>
						{/if}

						<!-- Decision Metadata -->
						<Card variant="elevated">
							<CardHeader variant="default">
								<h3
									class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2"
								>
									<span class="w-1.5 h-1.5 bg-violet-500 rounded-full"></span>
									Decision Info
								</h3>
							</CardHeader>
							<CardBody padding="sm">
								<div class="space-y-2 text-sm">
									<div class="flex justify-between items-center">
										<span class="text-muted-foreground">Status:</span>
										{#if stateBadge}
											<span
												class="text-xs font-medium capitalize {stateBadge.color}"
											>
												{stateBadge.label}
											</span>
										{/if}
									</div>

									{#if decision.decision_at}
										<div class="flex justify-between">
											<span class="text-muted-foreground">Decided:</span>
											<span class="text-foreground">
												{new Date(
													decision.decision_at
												).toLocaleDateString()}
											</span>
										</div>
									{/if}

									<div class="flex justify-between gap-2">
										<span class="text-muted-foreground shrink-0">ID:</span>
										<span
											class="font-mono text-xs text-muted-foreground break-all text-right"
										>
											{decision.id}
										</span>
									</div>

									{#if decision.created_at}
										<div class="flex justify-between">
											<span class="text-muted-foreground">Created:</span>
											<span class="text-foreground">
												{new Date(decision.created_at).toLocaleDateString()}
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

	{#snippet footer()}
		{#if !isLoading && decision}
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
						type="button"
						variant="ghost"
						size="sm"
						onclick={handleClose}
						disabled={isSaving || isDeleting}
						class="text-xs sm:text-sm px-2 sm:px-4 tx tx-grain tx-weak"
					>
						Cancel
					</Button>
					<Button
						type="button"
						variant="primary"
						size="sm"
						onclick={handleSave}
						loading={isSaving}
						disabled={isSaving || isDeleting || !title.trim()}
						class="text-xs sm:text-sm px-2 sm:px-4 tx tx-grain tx-weak"
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
		title="Delete Decision"
		confirmText="Delete Decision"
		confirmVariant="danger"
		loading={isDeleting}
		loadingText="Deleting..."
		icon="danger"
		onconfirm={handleDelete}
		oncancel={() => (showDeleteConfirm = false)}
	>
		{#snippet content()}
			<p class="text-sm text-muted-foreground">
				This action cannot be undone. The decision and all its data will be permanently
				deleted.
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

{#if showGoalModal && selectedGoalIdForModal}
	<GoalEditModal
		goalId={selectedGoalIdForModal}
		{projectId}
		onClose={closeLinkedEntityModals}
		onUpdated={closeLinkedEntityModals}
		onDeleted={closeLinkedEntityModals}
	/>
{/if}

{#if showRiskModal && selectedRiskIdForModal}
	<RiskEditModal
		riskId={selectedRiskIdForModal}
		{projectId}
		onClose={closeLinkedEntityModals}
		onUpdated={closeLinkedEntityModals}
		onDeleted={closeLinkedEntityModals}
	/>
{/if}
