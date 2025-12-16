<!-- apps/web/src/lib/components/ontology/MilestoneEditModal.svelte -->
<!--
	Milestone Edit Modal Component

	Provides full CRUD operations for milestones within the BuildOS ontology system:
	- Edit milestone details (title, description, due date, state)
	- View linked entities (tasks, plans, goals)
	- Delete milestones with confirmation

	Documentation:
	- Ontology System Overview: /apps/web/docs/features/ontology/README.md
	- Data Models & Schema: /apps/web/docs/features/ontology/DATA_MODELS.md
	- Implementation Guide: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
	- Modal Design Patterns: /apps/web/docs/technical/components/modals/TECHNICAL_ANALYSIS.md

	Related Files:
	- API Endpoints: /apps/web/src/routes/api/onto/milestones/[id]/+server.ts
	- Create Modal: /apps/web/src/lib/components/ontology/MilestoneCreateModal.svelte
	- Risk Edit Modal: /apps/web/src/lib/components/ontology/RiskEditModal.svelte

	Note: This modal uses custom layout instead of FormModal for advanced features
	like sidebar metadata and linked entities.
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import { Save, Loader, Trash2, Flag, Calendar, Clock } from 'lucide-svelte';
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
	import RiskEditModal from './RiskEditModal.svelte';

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
		milestoneId: string;
		projectId: string;
		onClose: () => void;
		onUpdated?: () => void;
		onDeleted?: () => void;
	}

	let { milestoneId, projectId, onClose, onUpdated, onDeleted }: Props = $props();

	const STATE_OPTIONS = [
		{
			value: 'pending',
			label: 'Pending',
			description: 'Not yet started',
			color: 'bg-slate-500/10 text-slate-600'
		},
		{
			value: 'in_progress',
			label: 'In Progress',
			description: 'Work underway',
			color: 'bg-blue-500/10 text-blue-600'
		},
		{
			value: 'achieved',
			label: 'Achieved',
			description: 'Successfully completed',
			color: 'bg-emerald-500/10 text-emerald-600'
		},
		{
			value: 'missed',
			label: 'Missed',
			description: 'Deadline not met',
			color: 'bg-red-500/10 text-red-600'
		},
		{
			value: 'deferred',
			label: 'Deferred',
			description: 'Postponed',
			color: 'bg-amber-500/10 text-amber-600'
		}
	];

	let modalOpen = $state(true);
	let milestone = $state<any>(null);
	let isLoading = $state(true);
	let isSaving = $state(false);
	let isDeleting = $state(false);
	let error = $state('');
	let showDeleteConfirm = $state(false);

	// Form fields
	let title = $state('');
	let description = $state('');
	let dueAt = $state('');
	let stateKey = $state('pending');

	// Modal states for linked entity navigation
	let showTaskModal = $state(false);
	let selectedTaskIdForModal = $state<string | null>(null);
	let showPlanModal = $state(false);
	let selectedPlanIdForModal = $state<string | null>(null);
	let showGoalModal = $state(false);
	let selectedGoalIdForModal = $state<string | null>(null);
	let showDocumentModal = $state(false);
	let selectedDocumentIdForModal = $state<string | null>(null);
	let showRiskModal = $state(false);
	let selectedRiskIdForModal = $state<string | null>(null);
	let showChatModal = $state(false);

	// Build focus for chat about this milestone
	const entityFocus = $derived.by((): ProjectFocus | null => {
		if (!milestone || !projectId) return null;
		return {
			focusType: 'milestone',
			focusEntityId: milestoneId,
			focusEntityName: milestone.title || 'Untitled Milestone',
			projectId: projectId,
			projectName: milestone.project?.name || 'Project'
		};
	});

	// Computed state badge styling
	const stateBadge = $derived(STATE_OPTIONS.find((o) => o.value === stateKey));

	// Computed due date info
	const dueDate = $derived(dueAt ? new Date(dueAt) : null);
	const daysUntilDue = $derived(() => {
		if (!dueDate) return null;
		const now = new Date();
		now.setHours(0, 0, 0, 0);
		const due = new Date(dueDate);
		due.setHours(0, 0, 0, 0);
		return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
	});
	const dueDateStatus = $derived(() => {
		const days = daysUntilDue();
		if (days === null) return 'unknown';
		if (stateKey === 'achieved') return 'achieved';
		if (stateKey === 'missed') return 'missed';
		if (days < 0) return 'overdue';
		if (days === 0) return 'today';
		if (days <= 7) return 'soon';
		return 'upcoming';
	});

	// Load milestone data when modal opens (client-side only)
	$effect(() => {
		if (browser) {
			loadMilestone();
		}
	});

	async function loadMilestone() {
		try {
			isLoading = true;
			const response = await fetch(`/api/onto/milestones/${milestoneId}`);
			if (!response.ok) throw new Error('Failed to load milestone');

			const data = await response.json();
			milestone = data.data?.milestone;

			if (milestone) {
				title = milestone.title || '';
				// Extract date portion for input
				if (milestone.due_at) {
					const dateObj = new Date(milestone.due_at);
					dueAt = dateObj.toISOString().split('T')[0];
				}
				stateKey = milestone.props?.state_key || 'pending';
				description = milestone.props?.description || '';
			}
		} catch (err) {
			console.error('Error loading milestone:', err);
			error = 'Failed to load milestone';
		} finally {
			isLoading = false;
		}
	}

	async function handleSave() {
		if (!title.trim()) {
			error = 'Milestone title is required';
			return;
		}

		if (!dueAt) {
			error = 'Due date is required';
			return;
		}

		isSaving = true;
		error = '';

		try {
			// Convert local date to ISO timestamp (end of day)
			const dueDateObj = new Date(dueAt + 'T23:59:59');

			const requestBody = {
				title: title.trim(),
				due_at: dueDateObj.toISOString(),
				state_key: stateKey,
				description: description.trim() || null
			};

			const response = await fetch(`/api/onto/milestones/${milestoneId}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody)
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to update milestone');
			}

			// Success! Call the callback and close
			if (onUpdated) {
				onUpdated();
			}
			onClose();
		} catch (err) {
			console.error('Error updating milestone:', err);
			error = err instanceof Error ? err.message : 'Failed to update milestone';
			isSaving = false;
		}
	}

	async function handleDelete() {
		isDeleting = true;
		error = '';

		try {
			const response = await fetch(`/api/onto/milestones/${milestoneId}`, {
				method: 'DELETE'
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to delete milestone');
			}

			// Success! Call the callback and close
			if (onDeleted) {
				onDeleted();
			}
			onClose();
		} catch (err) {
			console.error('Error deleting milestone:', err);
			error = err instanceof Error ? err.message : 'Failed to delete milestone';
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
		showDocumentModal = false;
		showRiskModal = false;
		selectedTaskIdForModal = null;
		selectedPlanIdForModal = null;
		selectedGoalIdForModal = null;
		selectedDocumentIdForModal = null;
		selectedRiskIdForModal = null;
		// Refresh milestone data to get updated linked entities
		loadMilestone();
	}

	function getTypeLabel(typeKey: string): string {
		if (!typeKey) return 'General';
		const parts = typeKey.split('.');
		const variant = parts[parts.length - 1] ?? typeKey;
		return variant
			.split('_')
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(' ');
	}

	function formatDueDate(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	// Chat about this milestone handlers
	async function openChatAbout() {
		if (!milestone || !projectId) return;
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
					<Flag class="w-4 h-4" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						{title || milestone?.title || 'Milestone'}
					</h2>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
						{#if milestone?.due_at}Due {formatDueDate(milestone.due_at)}{/if}
					</p>
				</div>
			</div>
			<div class="flex items-center gap-1">
				<!-- Chat about this milestone button -->
				<Button
					variant="ghost"
					size="sm"
					onclick={openChatAbout}
					class="text-muted-foreground hover:text-foreground shrink-0 !p-1 sm:!p-1.5"
					disabled={isLoading || isSaving || !milestone}
					title="Chat about this milestone"
				>
					<img
						src="/brain-bolt.png"
						alt="Chat about this milestone"
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
			{:else if !milestone}
				<div class="text-center py-8">
					<p class="text-destructive">Milestone not found</p>
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
								label="Milestone Title"
								labelFor="title"
								required={true}
								error={!title.trim() && error ? 'Milestone title is required' : ''}
							>
								<TextInput
									id="title"
									bind:value={title}
									inputmode="text"
									enterkeyhint="next"
									placeholder="What needs to be achieved?"
									required={true}
									disabled={isSaving}
									error={!title.trim() && error ? true : false}
								/>
							</FormField>

							<FormField
								label="Due Date"
								labelFor="due_at"
								required={true}
								error={!dueAt && error ? 'Due date is required' : ''}
							>
								<div class="relative">
									<Calendar
										class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
									/>
									<input
										type="date"
										id="due_at"
										bind:value={dueAt}
										class="w-full pl-10 pr-3 py-2.5 rounded-lg border bg-background text-foreground
											{!dueAt && error ? 'border-destructive' : 'border-border'}
											focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500
											disabled:opacity-50 disabled:cursor-not-allowed"
										disabled={isSaving}
										required
									/>
								</div>
							</FormField>

							<FormField
								label="Description"
								labelFor="description"
								hint="Describe what this milestone represents"
							>
								<Textarea
									id="description"
									bind:value={description}
									enterkeyhint="next"
									placeholder="What does achieving this milestone mean for the project?"
									rows={3}
									disabled={isSaving}
									size="md"
								/>
							</FormField>

							<FormField
								label="State"
								labelFor="state"
								required={true}
								hint="Current milestone status"
							>
								<Select
									id="state"
									bind:value={stateKey}
									disabled={isSaving}
									size="md"
									placeholder="Select state"
								>
									{#each STATE_OPTIONS as opt}
										<option value={opt.value}
											>{opt.label} - {opt.description}</option
										>
									{/each}
								</Select>
							</FormField>

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
							sourceId={milestoneId}
							sourceKind="milestone"
							{projectId}
							onEntityClick={handleLinkedEntityClick}
							onLinksChanged={loadMilestone}
						/>

						<!-- Due Date Card -->
						<Card variant="elevated">
							<CardHeader variant="default">
								<h3
									class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2"
								>
									<span class="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
									Due Date
								</h3>
							</CardHeader>
							<CardBody padding="sm">
								<div class="text-center py-2">
									{#if dueDate}
										{@const days = daysUntilDue()}
										{@const status = dueDateStatus()}
										<div class="flex items-center justify-center gap-2 mb-2">
											<Clock
												class="w-5 h-5 {status === 'overdue' ||
												status === 'missed'
													? 'text-red-500'
													: status === 'today'
														? 'text-amber-500'
														: status === 'achieved'
															? 'text-emerald-500'
															: 'text-muted-foreground'}"
											/>
											<span
												class="text-2xl font-bold {status === 'overdue' ||
												status === 'missed'
													? 'text-red-500'
													: status === 'today'
														? 'text-amber-500'
														: status === 'achieved'
															? 'text-emerald-500'
															: 'text-foreground'}"
											>
												{#if status === 'achieved'}
													Done
												{:else if status === 'missed'}
													Missed
												{:else if days === 0}
													Today
												{:else if days === 1}
													Tomorrow
												{:else if days === -1}
													Yesterday
												{:else if days !== null && days < 0}
													{Math.abs(days)} days ago
												{:else if days !== null}
													{days} days
												{/if}
											</span>
										</div>
										<p class="text-sm text-muted-foreground">
											{formatDueDate(dueAt)}
										</p>
										{#if status === 'overdue' && stateKey !== 'achieved' && stateKey !== 'missed'}
											<p class="text-xs text-red-500 mt-2">
												This milestone is overdue
											</p>
										{/if}
									{:else}
										<p class="text-muted-foreground">No due date set</p>
									{/if}
								</div>
							</CardBody>
						</Card>

						<!-- Milestone Metadata -->
						<Card variant="elevated">
							<CardHeader variant="default">
								<h3
									class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2"
								>
									<span class="w-1.5 h-1.5 bg-accent rounded-full"></span>
									Milestone Information
								</h3>
							</CardHeader>
							<CardBody padding="sm">
								<div class="space-y-2 text-sm">
									<div class="flex justify-between items-center">
										<span class="text-muted-foreground">Type:</span>
										<Badge variant="info" size="sm">
											{getTypeLabel(milestone.type_key)}
										</Badge>
									</div>

									<div class="flex justify-between items-center">
										<span class="text-muted-foreground">State:</span>
										{#if stateBadge}
											<span
												class="text-xs px-2 py-0.5 rounded-full font-medium {stateBadge.color}"
											>
												{stateBadge.label}
											</span>
										{/if}
									</div>

									<div class="flex justify-between">
										<span class="text-muted-foreground">ID:</span>
										<span class="font-mono text-xs text-muted-foreground"
											>{milestone.id.slice(0, 8)}...</span
										>
									</div>

									{#if milestone.created_at}
										<div class="flex justify-between">
											<span class="text-muted-foreground">Created:</span>
											<span class="text-foreground">
												{new Date(
													milestone.created_at
												).toLocaleDateString()}
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
		{#if !isLoading && milestone}
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
						disabled={isSaving || isDeleting || !title.trim() || !dueAt}
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
		title="Delete Milestone"
		confirmText="Delete Milestone"
		confirmVariant="danger"
		loading={isDeleting}
		loadingText="Deleting..."
		icon="danger"
		on:confirm={handleDelete}
		on:cancel={() => (showDeleteConfirm = false)}
	>
		{#snippet content()}
			<p class="text-sm text-muted-foreground">
				This action cannot be undone. The milestone and all its data will be permanently
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

{#if showRiskModal && selectedRiskIdForModal}
	<RiskEditModal
		riskId={selectedRiskIdForModal}
		{projectId}
		onClose={closeLinkedEntityModals}
		onUpdated={closeLinkedEntityModals}
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
