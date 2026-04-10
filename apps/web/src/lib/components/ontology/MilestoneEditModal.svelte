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
	import {
		Save,
		Loader,
		Trash2,
		Flag,
		Calendar,
		Clock,
		X,
		ChevronDown,
		FileText
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
	import type { EntityKind } from './linked-entities/linked-entities.types';
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import TaskEditModal from './TaskEditModal.svelte';
	import PlanEditModal from './PlanEditModal.svelte';
	import GoalEditModal from './GoalEditModal.svelte';
	import DocumentModal from './DocumentModal.svelte';
	import RiskEditModal from './RiskEditModal.svelte';
	import { MILESTONE_STATES, type Milestone } from '$lib/types/onto';
	import { formatDateForInput, parseDateFromInput } from '$lib/utils/date-utils';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';

	type MilestoneModalProps = Milestone['props'] & {
		description?: string;
		milestone?: string;
		tags?: string[];
	};

	type LoadedMilestone = Omit<Milestone, 'props'> & {
		props: MilestoneModalProps;
		project?: { name?: string | null } | null;
	};

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
		milestoneId: string;
		projectId: string;
		onClose: () => void;
		onUpdated?: () => void;
		onDeleted?: () => void;
	}

	let { milestoneId, projectId, onClose, onUpdated, onDeleted }: Props = $props();

	const STATE_OPTIONS = MILESTONE_STATES.map((state) => ({
		value: state,
		label: state.replace('_', ' '),
		description:
			state === 'pending'
				? 'Not yet started'
				: state === 'in_progress'
					? 'Work underway'
					: state === 'completed'
						? 'Successfully completed'
						: 'Deadline not met',
		color:
			state === 'pending'
				? 'bg-muted text-muted-foreground'
				: state === 'in_progress'
					? 'bg-accent/10 text-accent'
					: state === 'completed'
						? 'bg-emerald-500/10 text-emerald-600'
						: 'bg-red-500/10 text-red-600'
	}));

	let modalOpen = $state(true);
	let milestone = $state<LoadedMilestone | null>(null);
	let isLoading = $state(true);
	let isSaving = $state(false);
	let isDeleting = $state(false);
	let error = $state('');
	let showDeleteConfirm = $state(false);

	// Form fields
	let title = $state('');
	let description = $state('');
	let milestoneDetails = $state('');
	let dueAt = $state('');
	let stateKey = $state('pending');
	let typeKey = $state('milestone.default');

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
	let showActivityLog = $state(false);

	type SurfaceBadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent';

	const MILESTONE_STATE_META: Record<string, { label: string; variant: SurfaceBadgeVariant }> = {
		pending: { label: 'Pending', variant: 'default' },
		in_progress: { label: 'In Progress', variant: 'info' },
		completed: { label: 'Completed', variant: 'success' },
		missed: { label: 'Missed', variant: 'error' }
	};

	const milestoneStateMeta = $derived(
		MILESTONE_STATE_META[stateKey] ?? {
			label: stateKey,
			variant: 'default' as SurfaceBadgeVariant
		}
	);
	const detailsFormId = $derived(`milestone-edit-${milestoneId}-details`);

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
	function parseDateOnlyToLocal(dateOnly: string): Date | null {
		const [year, month, day] = dateOnly.split('-').map(Number);
		if (!year || !month || !day) return null;
		const date = new Date(year, month - 1, day);
		return Number.isNaN(date.getTime()) ? null : date;
	}

	const dueDate = $derived.by(() => (dueAt ? parseDateOnlyToLocal(dueAt) : null));
	const daysUntilDue = $derived.by(() => {
		if (!dueDate) return null;
		const now = new Date();
		now.setHours(0, 0, 0, 0);
		const due = new Date(dueDate);
		due.setHours(0, 0, 0, 0);
		return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
	});
	const dueDateStatus = $derived.by(() => {
		if (daysUntilDue === null) return 'unknown';
		if (stateKey === 'completed') return 'completed';
		if (stateKey === 'missed') return 'missed';
		if (daysUntilDue < 0) return 'overdue';
		if (daysUntilDue === 0) return 'today';
		if (daysUntilDue <= 7) return 'soon';
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
			milestone = (data.data?.milestone ?? null) as LoadedMilestone | null;

			if (milestone) {
				title = milestone.title || '';
				// Extract date portion for input
				dueAt = formatDateForInput(milestone.due_at);
				stateKey = milestone.state_key || 'pending';
				typeKey = milestone.type_key || 'milestone.default';
				description = milestone.description || milestone.props?.description || '';
				milestoneDetails = milestone.milestone || milestone.props?.milestone || '';
			}
		} catch (err) {
			console.error('Error loading milestone:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/milestones/${milestoneId}`,
				method: 'GET',
				projectId,
				entityType: 'milestone',
				entityId: milestoneId,
				operation: 'milestone_load'
			});
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

		isSaving = true;
		error = '';

		try {
			let dueDateIso: string | null = null;
			if (dueAt && dueAt.trim()) {
				dueDateIso = parseDateFromInput(dueAt);
				if (!dueDateIso) {
					error = 'Due date must be a valid date';
					isSaving = false;
					return;
				}
			}

			const requestBody = {
				title: title.trim(),
				due_at: dueDateIso,
				state_key: stateKey,
				type_key: typeKey || 'milestone.default',
				milestone: milestoneDetails.trim() || null,
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
			void logOntologyClientError(err, {
				endpoint: `/api/onto/milestones/${milestoneId}`,
				method: 'PATCH',
				projectId,
				entityType: 'milestone',
				entityId: milestoneId,
				operation: 'milestone_update'
			});
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
			void logOntologyClientError(err, {
				endpoint: `/api/onto/milestones/${milestoneId}`,
				method: 'DELETE',
				projectId,
				entityType: 'milestone',
				entityId: milestoneId,
				operation: 'milestone_delete'
			});
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

	function formatDueDate(dateStr?: string | null): string {
		if (!dateStr) return 'No due date';
		const date = new Date(dateStr);
		if (Number.isNaN(date.getTime())) return 'No due date';
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
					<Flag class="w-5 h-5" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						{title || milestone?.title || 'Milestone'}
					</h2>
					<div class="mt-1 flex flex-wrap items-center gap-1.5">
						<Badge variant={milestoneStateMeta.variant} size="sm"
							>{milestoneStateMeta.label}</Badge
						>
						{#if dueDateStatus === 'overdue'}
							<Badge variant="error" size="sm">Overdue</Badge>
						{:else if dueDateStatus === 'today'}
							<Badge variant="warning" size="sm">Due Today</Badge>
						{/if}
					</div>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-1">
						{#if milestone?.due_at}Due {formatDueDate(milestone.due_at)}{/if}
					</p>
				</div>
			</div>
			<div class="flex items-center gap-1.5">
				<!-- Chat about this milestone button -->
				<button
					type="button"
					onclick={openChatAbout}
					disabled={isLoading || isSaving || !milestone}
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:border-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 tx tx-grain tx-weak"
					title="Chat about this milestone"
				>
					<img
						src="/brain-bolt.png"
						alt="Chat about this milestone"
						class="w-6 h-6 rounded object-cover"
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
		<!-- Main content -->
		<div class="px-2 py-2 sm:px-4 sm:py-4">
			{#if isLoading}
				<div class="flex items-center justify-center py-12">
					<Loader class="w-8 h-8 animate-spin text-muted-foreground" />
				</div>
			{:else if !milestone}
				<div class="text-center py-8">
					<p class="text-destructive">Milestone not found</p>
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
												What this milestone marks and when it's due
											</h3>
											<p class="mt-1 text-xs text-muted-foreground">
												Define the milestone and its deadline so progress is
												trackable.
											</p>
										</div>
										<Badge variant={milestoneStateMeta.variant} size="sm"
											>{milestoneStateMeta.label}</Badge
										>
									</div>
								</CardHeader>
								<CardBody class="space-y-4">
									<FormField
										label="Milestone Title"
										labelFor="title"
										required={true}
										uppercase={false}
										showOptional={false}
										error={!title.trim() && error
											? 'Milestone title is required'
											: ''}
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
										label="Description"
										labelFor="description"
										uppercase={false}
										showOptional={false}
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
										label="Milestone Details"
										labelFor="milestone-details"
										uppercase={false}
										showOptional={false}
									>
										<Textarea
											id="milestone-details"
											bind:value={milestoneDetails}
											enterkeyhint="next"
											placeholder="Add any additional milestone context or criteria..."
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
												<Calendar class="h-4 w-4 text-muted-foreground" />
												<p
													class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
												>
													Schedule & State
												</p>
											</div>
											<h3 class="mt-1 text-sm font-semibold text-foreground">
												Due date and current status
											</h3>
										</div>
									</div>
								</CardHeader>
								<CardBody class="space-y-4">
									<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
										<FormField
											label="Due Date"
											labelFor="due_at"
											uppercase={false}
											showOptional={false}
											error={error && error.toLowerCase().includes('date')
												? error
												: ''}
										>
											<TextInput
												type="date"
												id="due_at"
												bind:value={dueAt}
												inputmode="numeric"
												enterkeyhint="next"
												disabled={isSaving}
												size="sm"
												error={error && error.toLowerCase().includes('date')
													? true
													: false}
											/>
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
												placeholder="Select state"
											>
												{#each STATE_OPTIONS as opt}
													<option value={opt.value}>{opt.label}</option>
												{/each}
											</Select>
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
											Milestone snapshot
										</h3>
									</div>
									<Badge variant={milestoneStateMeta.variant} size="sm"
										>{milestoneStateMeta.label}</Badge
									>
								</div>
							</CardHeader>
							<CardBody class="space-y-3">
								<!-- Due Date Display -->
								<div
									class="rounded-lg border border-border/70 {dueDateStatus ===
									'overdue'
										? 'bg-destructive/5'
										: 'bg-muted/30'} p-3 text-center"
								>
									<p
										class="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
									>
										Due Date
									</p>
									{#if dueDate}
										{@const days = daysUntilDue}
										{@const status = dueDateStatus}
										<p
											class="mt-1 text-xl font-bold {status === 'overdue' ||
											status === 'missed'
												? 'text-destructive'
												: status === 'today'
													? 'text-warning'
													: status === 'completed'
														? 'text-foreground'
														: 'text-foreground'}"
										>
											{#if status === 'completed'}
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
										</p>
										<p class="text-xs text-muted-foreground mt-1">
											{formatDueDate(dueAt)}
										</p>
									{:else}
										<p class="mt-1 text-sm text-muted-foreground">
											No due date set
										</p>
									{/if}
								</div>

								<div class="rounded-lg border border-border/70 bg-muted/30 p-3">
									<div class="grid grid-cols-1 gap-1.5 text-xs">
										<div class="flex items-center justify-between gap-2">
											<span class="text-muted-foreground">State</span>
											<span class="text-right text-foreground">
												{milestoneStateMeta.label}
											</span>
										</div>
										<div class="flex items-center justify-between gap-2">
											<span class="text-muted-foreground">Created</span>
											<span class="text-right text-foreground">
												{milestone.created_at
													? new Date(
															milestone.created_at
														).toLocaleDateString(undefined, {
															month: 'short',
															day: 'numeric',
															year: 'numeric'
														})
													: '—'}
											</span>
										</div>
										{#if milestone.updated_at}
											<div class="flex items-center justify-between gap-2">
												<span class="text-muted-foreground">Updated</span>
												<span class="text-right text-foreground">
													{new Date(
														milestone.updated_at
													).toLocaleDateString(undefined, {
														month: 'short',
														day: 'numeric',
														year: 'numeric'
													})}
												</span>
											</div>
										{/if}
									</div>
								</div>
							</CardBody>
						</Card>

						<!-- Linked Entities -->
						<LinkedEntities
							sourceId={milestoneId}
							sourceKind="milestone"
							{projectId}
							onEntityClick={handleLinkedEntityClick}
							onLinksChanged={loadMilestone}
						/>

						<!-- Images -->
						<ImageAssetsPanel
							{projectId}
							entityKind="milestone"
							entityId={milestoneId}
							title="Images"
							compact={true}
							onChanged={() => {
								void loadMilestone();
								onUpdated?.();
							}}
						/>

						{#if milestone?.props?.tags?.length}
							<div
								class="px-3 py-2.5 border border-border rounded-lg bg-card shadow-ink"
							>
								<p
									class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5"
								>
									Tags
								</p>
								<TagsDisplay props={milestone.props} size="sm" compact={true} />
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
										entityType="milestone"
										entityId={milestoneId}
										autoLoad={true}
										embedded={true}
									/>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<div class="mt-4">
					<EntityCommentsSection
						{projectId}
						entityType="milestone"
						entityId={milestoneId}
					/>
				</div>
			{/if}
		</div>
	{/snippet}

	<!-- Footer Actions -->
	{#snippet footer()}
		{#if !isLoading && milestone}
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
						disabled={isSaving || isDeleting || !title.trim()}
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
		title="Delete Milestone"
		confirmText="Delete Milestone"
		confirmVariant="danger"
		loading={isDeleting}
		loadingText="Deleting..."
		icon="danger"
		onconfirm={handleDelete}
		oncancel={() => (showDeleteConfirm = false)}
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
	<AgentChatModalComponent
		isOpen={showChatModal}
		initialProjectFocus={entityFocus}
		onClose={handleChatClose}
	/>
{/if}
