<!-- apps/web/src/lib/components/ontology/RiskEditModal.svelte -->
<!--
	Risk Edit Modal Component

	Provides full CRUD operations for risks within the BuildOS ontology system:
	- Edit risk details (title, description, impact, probability, mitigation, state)
	- Visualize and transition FSM states
	- View linked entities (tasks, plans, goals)
	- Delete risks with confirmation

	Documentation:
	- Ontology System Overview: /apps/web/docs/features/ontology/README.md
	- Data Models & Schema: /apps/web/docs/features/ontology/DATA_MODELS.md
	- Implementation Guide: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
	- Modal Design Patterns: /apps/web/docs/technical/components/modals/TECHNICAL_ANALYSIS.md

	Related Files:
	- API Endpoints: /apps/web/src/routes/api/onto/risks/[id]/+server.ts
	- Create Modal: /apps/web/src/lib/components/ontology/RiskCreateModal.svelte

	Note: This modal uses custom layout instead of FormModal for advanced features
	like sidebar metadata.
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import { Save, Loader, Trash2, AlertTriangle } from 'lucide-svelte';
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
	import type { EntityKind } from './linked-entities/linked-entities.types';
	import type { ComponentType } from 'svelte';
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import TaskEditModal from './TaskEditModal.svelte';
	import PlanEditModal from './PlanEditModal.svelte';
	import GoalEditModal from './GoalEditModal.svelte';
	import DocumentModal from './DocumentModal.svelte';
	import { RISK_STATES } from '$lib/types/onto';

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
		riskId: string;
		projectId: string;
		onClose: () => void;
		onUpdated?: () => void;
		onDeleted?: () => void;
	}

	let { riskId, projectId, onClose, onUpdated, onDeleted }: Props = $props();

	const IMPACT_OPTIONS = [
		{ value: 'low', label: 'Low', color: 'bg-emerald-500/10 text-emerald-600' },
		{ value: 'medium', label: 'Medium', color: 'bg-amber-500/10 text-amber-600' },
		{ value: 'high', label: 'High', color: 'bg-orange-500/10 text-orange-600' },
		{ value: 'critical', label: 'Critical', color: 'bg-red-500/10 text-red-600' }
	];

	const PROBABILITY_OPTIONS = [
		{ value: '0.1', label: 'Rare (10%)' },
		{ value: '0.25', label: 'Unlikely (25%)' },
		{ value: '0.5', label: 'Possible (50%)' },
		{ value: '0.75', label: 'Likely (75%)' },
		{ value: '0.9', label: 'Almost Certain (90%)' }
	];

	const STATE_OPTIONS = RISK_STATES.map((state) => ({
		value: state,
		label: state.replace('_', ' '),
		description:
			state === 'identified'
				? 'Risk has been logged'
				: state === 'mitigated'
					? 'Mitigation applied'
					: state === 'occurred'
						? 'Risk event occurred'
						: 'Closed out'
	}));

	let modalOpen = $state(true);
	let risk = $state<any>(null);
	let isLoading = $state(true);
	let isSaving = $state(false);
	let isDeleting = $state(false);
	let error = $state('');
	let showDeleteConfirm = $state(false);

	// Form fields
	let title = $state('');
	let description = $state('');
	let impact = $state<string>('medium');
	let probability = $state<string>('0.5');
	let mitigationStrategy = $state('');
	let stateKey = $state('identified');
	let owner = $state('');

	// Modal states for linked entity navigation
	let showTaskModal = $state(false);
	let selectedTaskIdForModal = $state<string | null>(null);
	let showPlanModal = $state(false);
	let selectedPlanIdForModal = $state<string | null>(null);
	let showGoalModal = $state(false);
	let selectedGoalIdForModal = $state<string | null>(null);
	let showDocumentModal = $state(false);
	let selectedDocumentIdForModal = $state<string | null>(null);
	let showChatModal = $state(false);

	// Build focus for chat about this risk
	// Note: 'risk' needs to be added to ProjectFocus.focusType in shared-types
	const entityFocus = $derived.by((): ProjectFocus | null => {
		if (!risk || !projectId) return null;
		return {
			focusType: 'risk' as ProjectFocus['focusType'],
			focusEntityId: riskId,
			focusEntityName: risk.title || 'Untitled Risk',
			projectId: projectId,
			projectName: risk.project?.name || 'Project'
		};
	});

	// Computed impact badge styling
	const impactBadge = $derived(IMPACT_OPTIONS.find((o) => o.value === impact));

	// Computed risk score values (moved from template for Svelte 5 compatibility)
	const riskProb = $derived(parseFloat(probability) || 0.5);
	const riskImpactScore = $derived(
		impact === 'critical' ? 4 : impact === 'high' ? 3 : impact === 'medium' ? 2 : 1
	);
	const riskScore = $derived(riskProb * riskImpactScore);

	// Load risk data when modal opens (client-side only)
	$effect(() => {
		if (browser) {
			loadRisk();
		}
	});

	async function loadRisk() {
		try {
			isLoading = true;
			const response = await fetch(`/api/onto/risks/${riskId}`);
			if (!response.ok) throw new Error('Failed to load risk');

			const data = await response.json();
			risk = data.data?.risk;

			if (risk) {
				title = risk.title || '';
				impact = risk.impact || 'medium';
				probability = risk.probability?.toString() || '0.5';
				stateKey = risk.state_key || 'identified';
				description = risk.props?.description || '';
				mitigationStrategy = risk.props?.mitigation_strategy || '';
				owner = risk.props?.owner || '';
			}
		} catch (err) {
			console.error('Error loading risk:', err);
			error = 'Failed to load risk';
		} finally {
			isLoading = false;
		}
	}

	async function handleSave() {
		if (!title.trim()) {
			error = 'Risk title is required';
			return;
		}

		isSaving = true;
		error = '';

		try {
			const requestBody = {
				title: title.trim(),
				impact,
				probability: probability ? parseFloat(probability) : null,
				state_key: stateKey,
				description: description.trim() || null,
				mitigation_strategy: mitigationStrategy.trim() || null,
				owner: owner.trim() || null
			};

			const response = await fetch(`/api/onto/risks/${riskId}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody)
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to update risk');
			}

			// Success! Call the callback and close
			if (onUpdated) {
				onUpdated();
			}
			onClose();
		} catch (err) {
			console.error('Error updating risk:', err);
			error = err instanceof Error ? err.message : 'Failed to update risk';
			isSaving = false;
		}
	}

	async function handleDelete() {
		isDeleting = true;
		error = '';

		try {
			const response = await fetch(`/api/onto/risks/${riskId}`, {
				method: 'DELETE'
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to delete risk');
			}

			// Success! Call the callback and close
			if (onDeleted) {
				onDeleted();
			}
			onClose();
		} catch (err) {
			console.error('Error deleting risk:', err);
			error = err instanceof Error ? err.message : 'Failed to delete risk';
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
		showGoalModal = false;
		showDocumentModal = false;
		selectedTaskIdForModal = null;
		selectedPlanIdForModal = null;
		selectedGoalIdForModal = null;
		selectedDocumentIdForModal = null;
		// Refresh risk data to get updated linked entities
		loadRisk();
	}

	function getTypeLabel(typeKey: string): string {
		if (!typeKey) return 'General Risk';
		const parts = typeKey.split('.');
		const variant = parts[parts.length - 1] ?? typeKey;
		return (
			variant
				.split('_')
				.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
				.join(' ') + ' Risk'
		);
	}

	// Chat about this risk handlers
	async function openChatAbout() {
		if (!risk || !projectId) return;
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
			class="flex-shrink-0 bg-muted/50 border-b border-border px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div
					class="p-1.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0"
				>
					<AlertTriangle class="w-4 h-4" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						{title || risk?.title || 'Risk'}
					</h2>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
						{#if risk?.created_at}Created {new Date(risk.created_at).toLocaleDateString(
								undefined,
								{ month: 'short', day: 'numeric' }
							)}{/if}
					</p>
				</div>
			</div>
			<div class="flex items-center gap-1">
				<!-- Chat about this risk button -->
				<Button
					variant="ghost"
					size="sm"
					onclick={openChatAbout}
					class="text-muted-foreground hover:text-foreground shrink-0 !p-1 sm:!p-1.5"
					disabled={isLoading || isSaving || !risk}
					title="Chat about this risk"
				>
					<img
						src="/brain-bolt.png"
						alt="Chat about this risk"
						class="w-4 h-4 sm:w-5 sm:h-5 rounded object-cover transition-transform hover:scale-110"
					/>
				</Button>
				<!-- Close button -->
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
		</div>
	{/snippet}

	{#snippet children()}
		<!-- Main content -->
		<div class="px-3 py-3 sm:px-6 sm:py-6">
			{#if isLoading}
				<div class="flex items-center justify-center py-12">
					<Loader class="w-8 h-8 animate-spin text-muted-foreground" />
				</div>
			{:else if !risk}
				<div class="text-center py-8">
					<p class="text-destructive">Risk not found</p>
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
								label="Risk Title"
								labelFor="title"
								required={true}
								error={!title.trim() && error ? 'Risk title is required' : ''}
							>
								<TextInput
									id="title"
									bind:value={title}
									inputmode="text"
									enterkeyhint="next"
									placeholder="What could go wrong?"
									required={true}
									disabled={isSaving}
									error={!title.trim() && error ? true : false}
								/>
							</FormField>

							<FormField
								label="Description"
								labelFor="description"
								hint="Explain the risk in detail"
							>
								<Textarea
									id="description"
									bind:value={description}
									enterkeyhint="next"
									placeholder="Describe what could happen and why..."
									rows={3}
									disabled={isSaving}
									size="md"
								/>
							</FormField>

							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<FormField
									label="Impact"
									labelFor="impact"
									required={true}
									hint="Severity if this risk occurs"
								>
									<Select
										id="impact"
										bind:value={impact}
										disabled={isSaving}
										size="md"
										placeholder="Select impact"
									>
										{#each IMPACT_OPTIONS as opt}
											<option value={opt.value}>{opt.label}</option>
										{/each}
									</Select>
								</FormField>

								<FormField
									label="Probability"
									labelFor="probability"
									hint="How likely is this to occur?"
								>
									<Select
										id="probability"
										bind:value={probability}
										disabled={isSaving}
										size="md"
										placeholder="Select likelihood"
									>
										{#each PROBABILITY_OPTIONS as opt}
											<option value={opt.value}>{opt.label}</option>
										{/each}
									</Select>
								</FormField>
							</div>

							<FormField
								label="Mitigation Strategy"
								labelFor="mitigation-strategy"
								hint="How will you prevent or reduce this risk?"
							>
								<Textarea
									id="mitigation-strategy"
									bind:value={mitigationStrategy}
									enterkeyhint="next"
									placeholder="Steps to mitigate or prevent this risk..."
									rows={3}
									disabled={isSaving}
									size="md"
								/>
							</FormField>

							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<FormField
									label="State"
									labelFor="state"
									required={true}
									hint="Current risk status"
								>
									<Select
										id="state"
										bind:value={stateKey}
										disabled={isSaving}
										size="md"
										placeholder="Select state"
									>
										{#each STATE_OPTIONS as opt}
											<option value={opt.value}>{opt.label}</option>
										{/each}
									</Select>
								</FormField>

								<FormField
									label="Owner"
									labelFor="owner"
									hint="Who is responsible for this risk?"
								>
									<TextInput
										id="owner"
										bind:value={owner}
										inputmode="text"
										enterkeyhint="done"
										placeholder="Person responsible..."
										disabled={isSaving}
									/>
								</FormField>
							</div>

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
							sourceId={riskId}
							sourceKind="risk"
							{projectId}
							onEntityClick={handleLinkedEntityClick}
							onLinksChanged={loadRisk}
						/>

						<!-- Risk Metadata -->
						<Card variant="elevated">
							<CardHeader variant="default">
								<h3
									class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2"
								>
									<span class="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
									Risk Information
								</h3>
							</CardHeader>
							<CardBody padding="sm">
								<div class="space-y-2 text-sm">
									<div class="flex justify-between items-center">
										<span class="text-muted-foreground">Type:</span>
										<Badge variant="info" size="sm">
											{getTypeLabel(risk.type_key)}
										</Badge>
									</div>

									<div class="flex justify-between items-center">
										<span class="text-muted-foreground">Impact:</span>
										{#if impactBadge}
											<span
												class="text-xs px-2 py-0.5 rounded-full font-medium {impactBadge.color}"
											>
												{impactBadge.label}
											</span>
										{/if}
									</div>

									<div class="flex justify-between">
										<span class="text-muted-foreground">Probability:</span>
										<span class="text-foreground">
											{probability
												? `${Math.round(parseFloat(probability) * 100)}%`
												: 'Unknown'}
										</span>
									</div>

									<div class="flex justify-between">
										<span class="text-muted-foreground">State:</span>
										<span class="text-foreground capitalize">
											{stateKey.replace(/_/g, ' ')}
										</span>
									</div>

									<div class="flex justify-between">
										<span class="text-muted-foreground">ID:</span>
										<span class="font-mono text-xs text-muted-foreground"
											>{risk.id.slice(0, 8)}...</span
										>
									</div>

									{#if risk.created_at}
										<div class="flex justify-between">
											<span class="text-muted-foreground">Created:</span>
											<span class="text-foreground">
												{new Date(risk.created_at).toLocaleDateString()}
											</span>
										</div>
									{/if}
								</div>
							</CardBody>
						</Card>

						<!-- Risk Score (calculated) -->
						<Card variant="elevated">
							<CardHeader variant="default">
								<h3
									class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2"
								>
									<span class="w-1.5 h-1.5 bg-accent rounded-full"></span>
									Risk Score
								</h3>
							</CardHeader>
							<CardBody padding="sm">
								<div class="text-center py-2">
									<div
										class="text-3xl font-bold {riskScore >= 2
											? 'text-red-500'
											: riskScore >= 1
												? 'text-amber-500'
												: 'text-emerald-500'}"
									>
										{riskScore.toFixed(1)}
									</div>
									<p class="text-xs text-muted-foreground mt-1">
										{riskScore >= 2
											? 'High Priority'
											: riskScore >= 1
												? 'Medium Priority'
												: 'Low Priority'}
									</p>
									<p class="text-[10px] text-muted-foreground mt-2">
										Impact ({riskImpactScore}) × Probability ({Math.round(
											riskProb * 100
										)}%)
									</p>
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
		{#if !isLoading && risk}
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
						disabled={isSaving || isDeleting || !title.trim()}
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
		title="Delete Risk"
		confirmText="Delete Risk"
		confirmVariant="danger"
		loading={isDeleting}
		loadingText="Deleting..."
		icon="danger"
		on:confirm={handleDelete}
		on:cancel={() => (showDeleteConfirm = false)}
	>
		{#snippet content()}
			<p class="text-sm text-muted-foreground">
				This action cannot be undone. The risk and all its data will be permanently deleted.
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
	<svelte:component
		this={AgentChatModalComponent}
		isOpen={showChatModal}
		initialProjectFocus={entityFocus}
		onClose={handleChatClose}
	/>
{/if}
