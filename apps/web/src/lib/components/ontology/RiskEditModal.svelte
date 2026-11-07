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
	import {
		Save,
		Loader,
		Trash2,
		AlertTriangle,
		X,
		ChevronDown,
		Shield,
		Activity,
		Link as LinkIcon,
		Image as ImageIcon,
		Tag as TagIcon,
		User,
		Clock,
		FileText
	} from '$lib/icons/lucide';
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
	import EntityModalDetailsDrawer from './EntityModalDetailsDrawer.svelte';
	import EntityModalHeader from './EntityModalHeader.svelte';
	import ImageAssetsPanel from './ImageAssetsPanel.svelte';
	import type { EntityKind } from './linked-entities/linked-entities.types';
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import TaskEditModal from './TaskEditModal.svelte';
	import PlanEditModal from './PlanEditModal.svelte';
	import GoalEditModal from './GoalEditModal.svelte';
	import DocumentModal from './DocumentModal.svelte';
	import { RISK_STATES } from '$lib/types/onto';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import { changedFormFields } from '$lib/utils/form-patch';

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
		riskId: string;
		projectId: string;
		onClose: () => void;
		onUpdated?: () => void;
		onDeleted?: () => void;
	}

	let { riskId, projectId, onClose, onUpdated, onDeleted }: Props = $props();

	const IMPACT_OPTIONS = [
		{ value: 'low', label: 'Low', dot: 'bg-muted-foreground/50' },
		{ value: 'medium', label: 'Medium', dot: 'bg-muted-foreground/50' },
		{ value: 'high', label: 'High', dot: 'bg-warning' },
		{ value: 'critical', label: 'Critical', dot: 'bg-destructive' }
	];

	const PROBABILITY_OPTIONS = [
		{ value: '0.1', label: 'Rare (10%)' },
		{ value: '0.25', label: 'Unlikely (25%)' },
		{ value: '0.5', label: 'Possible (50%)' },
		{ value: '0.75', label: 'Likely (75%)' },
		{ value: '0.9', label: 'Almost certain (90%)' }
	];

	const STATE_OPTIONS = RISK_STATES.map((state) => ({
		value: state,
		label: state.charAt(0).toUpperCase() + state.slice(1).replace(/_/g, ' '),
		description:
			state === 'identified'
				? 'Risk has been logged'
				: state === 'mitigated'
					? 'Mitigation applied'
					: state === 'occurred'
						? 'Risk event occurred'
						: 'Closed out'
	}));

	type SurfaceBadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent';

	const RISK_STATE_META: Record<string, { label: string; variant: SurfaceBadgeVariant }> = {
		identified: { label: 'Identified', variant: 'warning' },
		mitigated: { label: 'Mitigated', variant: 'info' },
		occurred: { label: 'Occurred', variant: 'error' },
		closed: { label: 'Closed', variant: 'success' }
	};

	let modalOpen = $state(true);
	let risk = $state<any>(null);
	let isLoading = $state(true);
	let isSaving = $state(false);
	let isDeleting = $state(false);
	let error = $state('');
	let showDeleteConfirm = $state(false);
	let initialForm: ReturnType<typeof formSnapshot> | null = null;
	let showLinkedEntities = $state(true);
	let showImages = $state(false);
	let showActivityLog = $state(false);

	// Form fields
	let title = $state('');
	let content = $state('');
	let impact = $state<string>('medium');
	let probability = $state<string>('0.5');
	let mitigationStrategy = $state('');
	let stateKey = $state('identified');
	let typeKey = $state('risk.default');
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
	const stateMeta = $derived(
		RISK_STATE_META[stateKey] ?? { label: stateKey, variant: 'default' as SurfaceBadgeVariant }
	);
	const detailsFormId = $derived(`risk-edit-${riskId}-details`);

	function stateDotClass(variant: SurfaceBadgeVariant): string {
		if (variant === 'error') return 'bg-destructive';
		if (variant === 'warning') return 'bg-warning';
		return 'bg-muted-foreground/50';
	}

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

	function formSnapshot() {
		return {
			title: title.trim(),
			impact,
			probability: probability ? parseFloat(probability) : null,
			state_key: stateKey,
			type_key: typeKey || 'risk.default',
			content: content.trim() || null,
			description: content.trim() || null,
			mitigation_strategy: mitigationStrategy.trim() || null,
			owner: owner.trim() || null
		};
	}

	function isFormDirty(): boolean {
		return (
			initialForm !== null &&
			Object.keys(changedFormFields(initialForm, formSnapshot())).length > 0
		);
	}

	/**
	 * Reload the risk. `preserveEdits` is for refreshes triggered by nested
	 * modals, link changes, or images: it keeps the user's unsaved form edits.
	 */
	async function loadRisk(options: { preserveEdits?: boolean } = {}) {
		const keepForm = options.preserveEdits === true && isFormDirty();
		try {
			if (!keepForm) initialForm = null;
			isLoading = true;
			const response = await fetch(`/api/onto/risks/${riskId}`);
			if (!response.ok) throw new Error('Failed to load risk');

			const data = await response.json();
			risk = data.data?.risk;

			if (risk && !keepForm) {
				title = risk.title || '';
				impact = risk.impact || 'medium';
				probability = risk.probability?.toString() || '0.5';
				stateKey = risk.state_key || 'identified';
				typeKey = risk.type_key || 'risk.default';
				content = risk.content || risk.props?.description || '';
				mitigationStrategy = risk.props?.mitigation_strategy || '';
				owner = risk.props?.owner || '';
				initialForm = formSnapshot();
			}
		} catch (err) {
			console.error('Error loading risk:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/risks/${riskId}`,
				method: 'GET',
				projectId,
				entityType: 'risk',
				entityId: riskId,
				operation: 'risk_load'
			});
			error = 'Failed to load risk';
		} finally {
			isLoading = false;
		}
	}

	async function handleSave() {
		if (isLoading || isSaving || !initialForm) return;
		if (!title.trim()) {
			error = 'Risk title is required';
			return;
		}

		// Send only edited fields so a stale form cannot overwrite concurrent
		// changes (chat, another tab) to fields the user never touched.
		const requestBody = changedFormFields(initialForm, formSnapshot());
		if (Object.keys(requestBody).length === 0) {
			handleClose();
			return;
		}

		isSaving = true;
		error = '';

		try {
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
			void logOntologyClientError(err, {
				endpoint: `/api/onto/risks/${riskId}`,
				method: 'PATCH',
				projectId,
				entityType: 'risk',
				entityId: riskId,
				operation: 'risk_update'
			});
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
			void logOntologyClientError(err, {
				endpoint: `/api/onto/risks/${riskId}`,
				method: 'DELETE',
				projectId,
				entityType: 'risk',
				entityId: riskId,
				operation: 'risk_delete'
			});
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

	// Nested modals report changes without closing (DocumentModal autosave,
	// image uploads), so only remember them and refresh once the nested modal closes.
	let linkedEntityChanged = false;
	function markLinkedEntityChanged() {
		linkedEntityChanged = true;
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
		// Refresh linked entities only when a nested modal changed something,
		// and never overwrite unsaved edits in this form.
		if (!linkedEntityChanged) return;
		linkedEntityChanged = false;
		void loadRisk({ preserveEdits: true });
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

{#snippet headerIcon()}
	<AlertTriangle class="w-5 h-5" />
{/snippet}

{#snippet headerActions()}
	<!-- Chat about this risk button -->
	<button
		type="button"
		onclick={openChatAbout}
		disabled={isLoading || isSaving || !risk}
		class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
		title="Chat about this risk"
	>
		<img
			src="/brain-bolt.webp"
			alt="Chat about this risk"
			class="w-6 h-6 rounded object-cover"
		/>
	</button>
	<!-- Inkprint close button -->
	<button
		type="button"
		onclick={handleClose}
		disabled={isSaving || isDeleting}
		class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
		aria-label="Close modal"
	>
		<X class="w-5 h-5" />
	</button>
{/snippet}

<Modal
	bind:isOpen={modalOpen}
	size="xl"
	onClose={handleClose}
	closeOnEscape={!isSaving && !isDeleting}
	showCloseButton={false}
	ariaLabel={title || risk?.title || 'Risk'}
	customClasses="wt-plate"
>
	{#snippet header()}
		<EntityModalHeader
			title={title || risk?.title || 'Risk'}
			icon={headerIcon}
			actions={headerActions}
		/>
	{/snippet}

	<!-- Main content -->
	<div class="px-2 py-2 sm:px-4 sm:py-4">
		{#if isLoading}
			<div class="flex items-center justify-center py-12">
				<Loader class="w-8 h-8 animate-spin text-muted-foreground" />
			</div>
		{:else if !risk}
			<div class="text-center py-8">
				<p class="text-destructive">Risk not found</p>
			</div>
		{:else}
			<div
				class="relative grid grid-cols-1 gap-y-3 sm:gap-y-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:overflow-x-clip"
			>
				<!-- Main Form (Left 2 columns) -->
				<div class="min-w-0">
					<form
						id={detailsFormId}
						onsubmit={(e) => {
							e.preventDefault();
							handleSave();
						}}
						class="space-y-3 sm:space-y-4"
					>
						<Card variant="elevated" class="wt-paper">
							<CardHeader variant="muted" texture="strip">
								<div class="flex items-center justify-end gap-3">
									<span
										class="inline-flex items-center gap-2 text-xs text-muted-foreground"
									>
										<span
											class="h-1.5 w-1.5 rounded-full {stateDotClass(
												stateMeta.variant
											)}"
											aria-hidden="true"
										></span>
										{stateMeta.label}
									</span>
								</div>
							</CardHeader>
							<CardBody class="space-y-4">
								<FormField
									label="Title"
									labelFor="title"
									required={true}
									uppercase={false}
									showOptional={false}
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
									label="Details"
									labelFor="content"
									uppercase={false}
									showOptional={false}
								>
									<Textarea
										id="content"
										bind:value={content}
										enterkeyhint="next"
										placeholder="What could happen, and why"
										rows={3}
										disabled={isSaving}
										size="md"
									/>
								</FormField>

								<FormField
									label="Mitigation"
									labelFor="mitigation-strategy"
									uppercase={false}
									showOptional={false}
								>
									<Textarea
										id="mitigation-strategy"
										bind:value={mitigationStrategy}
										enterkeyhint="next"
										placeholder="Steps to prevent or soften it"
										rows={3}
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
									<div class="flex items-center gap-2">
										<Shield class="h-4 w-4 text-muted-foreground" />
										<h3 class="text-sm font-medium text-foreground">
											Impact, probability, and owner
										</h3>
									</div>
								</div>
							</CardHeader>
							<CardBody class="space-y-4">
								<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
									<FormField
										label="Impact"
										labelFor="impact"
										required={true}
										uppercase={false}
										showOptional={false}
									>
										<Select
											id="impact"
											bind:value={impact}
											disabled={isSaving}
											size="sm"
											placeholder="Select impact"
										>
											{#each IMPACT_OPTIONS as opt (opt.value)}
												<option value={opt.value}>{opt.label}</option>
											{/each}
										</Select>
									</FormField>

									<FormField
										label="Probability"
										labelFor="probability"
										uppercase={false}
										showOptional={false}
									>
										<Select
											id="probability"
											bind:value={probability}
											disabled={isSaving}
											size="sm"
											placeholder="Select likelihood"
										>
											{#each PROBABILITY_OPTIONS as opt (opt.value)}
												<option value={opt.value}>{opt.label}</option>
											{/each}
										</Select>
									</FormField>
								</div>

								<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
											{#each STATE_OPTIONS as opt (opt.value)}
												<option value={opt.value}>{opt.label}</option>
											{/each}
										</Select>
									</FormField>

									<FormField
										label="Owner"
										labelFor="owner"
										uppercase={false}
										showOptional={false}
									>
										<TextInput
											id="owner"
											bind:value={owner}
											inputmode="text"
											enterkeyhint="done"
											placeholder="Who watches this risk"
											disabled={isSaving}
											size="sm"
										/>
									</FormField>
								</div>
							</CardBody>
						</Card>

						{#if error}
							<div
								class="rounded-lg border border-destructive/30 bg-destructive/10 p-3"
							>
								<p class="text-sm text-destructive">{error}</p>
							</div>
						{/if}
					</form>
				</div>

				<!-- Sidebar (Right column) -->
				<EntityModalDetailsDrawer panelLabel="Risk details">
					<Card variant="elevated" class="wt-card">
						<CardHeader variant="muted" texture="strip">
							<div class="flex items-center justify-between gap-3">
								<h3 class="text-sm font-medium text-foreground">Overview</h3>
								<span
									class="inline-flex items-center gap-2 text-xs text-muted-foreground"
								>
									<span
										class="h-1.5 w-1.5 rounded-full {stateDotClass(
											stateMeta.variant
										)}"
										aria-hidden="true"
									></span>
									{stateMeta.label}
								</span>
							</div>
						</CardHeader>
						<CardBody padding="none">
							<div class="divide-y divide-border/70">
								<!-- Risk Score -->
								<section class="px-3 py-3 sm:px-4" aria-label="Risk score">
									<div class="flex items-center gap-2">
										<Shield class="h-4 w-4 text-muted-foreground" />
										<p class="text-xs font-medium text-muted-foreground">
											Risk score
										</p>
									</div>
									<div class="mt-2 text-center">
										<p
											class="font-mono text-2xl font-medium tabular-nums text-foreground"
										>
											{riskScore.toFixed(1)}
										</p>
										<p
											class="mt-1 inline-flex items-center gap-2 text-xs text-muted-foreground"
										>
											<span
												class="h-1.5 w-1.5 rounded-full {riskScore >= 2
													? 'bg-destructive'
													: riskScore >= 1
														? 'bg-warning'
														: 'bg-muted-foreground/50'}"
												aria-hidden="true"
											></span>
											{riskScore >= 2
												? 'High priority'
												: riskScore >= 1
													? 'Medium priority'
													: 'Low priority'}
										</p>
										<p class="text-2xs text-muted-foreground mt-1">
											Impact ({riskImpactScore}) × probability ({Math.round(
												riskProb * 100
											)}%)
										</p>
									</div>
									<div class="mt-4 grid grid-cols-2 gap-2 text-sm">
										<div>
											<p class="text-xs font-medium text-muted-foreground">
												Impact
											</p>
											<p
												class="mt-1 inline-flex items-center gap-2 font-medium text-foreground"
											>
												<span
													class="h-1.5 w-1.5 rounded-full {impactBadge?.dot ??
														'bg-muted-foreground/50'}"
													aria-hidden="true"
												></span>
												{impactBadge?.label ?? impact}
											</p>
										</div>
										<div>
											<p class="text-xs font-medium text-muted-foreground">
												Probability
											</p>
											<p
												class="mt-1 font-medium tabular-nums text-foreground"
											>
												{Math.round(riskProb * 100)}%
											</p>
										</div>
									</div>
								</section>

								<!-- Owner -->
								{#if owner}
									<section class="px-3 py-3 sm:px-4" aria-label="Owner">
										<div class="flex items-center gap-2">
											<User class="h-4 w-4 text-muted-foreground" />
											<p class="text-xs font-medium text-muted-foreground">
												Owner
											</p>
										</div>
										<p class="mt-2 text-sm text-foreground">{owner}</p>
									</section>
								{/if}

								<!-- Status -->
								<section class="px-3 py-3 sm:px-4" aria-label="Status">
									<div class="flex items-center justify-between gap-2">
										<div class="flex items-center gap-2">
											<FileText class="h-4 w-4 text-muted-foreground" />
											<p class="text-xs font-medium text-muted-foreground">
												Status
											</p>
										</div>
										<span
											class="inline-flex items-center gap-2 text-xs text-muted-foreground"
										>
											<span
												class="h-1.5 w-1.5 rounded-full {stateDotClass(
													stateMeta.variant
												)}"
												aria-hidden="true"
											></span>
											{stateMeta.label}
										</span>
									</div>
								</section>

								<!-- Record -->
								<section class="px-3 py-3 sm:px-4">
									<div class="flex items-center gap-2">
										<Clock class="h-4 w-4 text-muted-foreground" />
										<p class="text-xs font-medium text-muted-foreground">
											Record
										</p>
									</div>
									<div class="mt-2 space-y-2 text-sm">
										<div class="flex items-center justify-between gap-3">
											<span class="text-muted-foreground">Created</span>
											<span class="text-right text-foreground">
												{risk.created_at
													? new Date(risk.created_at).toLocaleDateString(
															undefined,
															{
																month: 'short',
																day: 'numeric',
																year: 'numeric'
															}
														)
													: '—'}
											</span>
										</div>
										<div class="flex items-center justify-between gap-3">
											<span class="text-muted-foreground">Updated</span>
											<span class="text-right text-foreground">
												{risk.updated_at
													? new Date(risk.updated_at).toLocaleDateString(
															undefined,
															{
																month: 'short',
																day: 'numeric',
																year: 'numeric'
															}
														)
													: '—'}
											</span>
										</div>
									</div>
								</section>

								<!-- Tags -->
								{#if risk?.props?.tags?.length}
									<section class="px-3 py-3 sm:px-4">
										<div class="flex items-center gap-2 mb-2">
											<TagIcon class="h-4 w-4 text-muted-foreground" />
											<p class="text-xs font-medium text-muted-foreground">
												Tags
											</p>
										</div>
										<TagsDisplay props={risk.props} size="sm" compact={true} />
									</section>
								{/if}

								<!-- Linked Entities (collapsible, default open) -->
								<section class="px-3 sm:px-4">
									<button
										type="button"
										onclick={() => (showLinkedEntities = !showLinkedEntities)}
										class="w-full py-3 flex items-center justify-between gap-2 text-left hover:opacity-80 transition-opacity"
										aria-expanded={showLinkedEntities}
									>
										<div class="flex items-center gap-2">
											<LinkIcon class="h-4 w-4 text-muted-foreground" />
											<p class="text-xs font-medium text-muted-foreground">
												Linked
											</p>
										</div>
										<ChevronDown
											class="w-3.5 h-3.5 text-muted-foreground transition-transform {showLinkedEntities
												? 'rotate-180'
												: ''}"
										/>
									</button>
									{#if showLinkedEntities}
										<div class="pb-3">
											<LinkedEntities
												sourceId={riskId}
												sourceKind="risk"
												{projectId}
												onEntityClick={handleLinkedEntityClick}
												onLinksChanged={() =>
													loadRisk({ preserveEdits: true })}
											/>
										</div>
									{/if}
								</section>

								<!-- Images (collapsible) -->
								<section class="px-3 sm:px-4">
									<button
										type="button"
										onclick={() => (showImages = !showImages)}
										class="w-full py-3 flex items-center justify-between gap-2 text-left hover:opacity-80 transition-opacity"
										aria-expanded={showImages}
									>
										<div class="flex items-center gap-2">
											<ImageIcon class="h-4 w-4 text-muted-foreground" />
											<p class="text-xs font-medium text-muted-foreground">
												Images
											</p>
										</div>
										<ChevronDown
											class="w-3.5 h-3.5 text-muted-foreground transition-transform {showImages
												? 'rotate-180'
												: ''}"
										/>
									</button>
									{#if showImages}
										<div class="pb-3">
											<ImageAssetsPanel
												{projectId}
												entityKind="risk"
												entityId={riskId}
												showTitle={false}
												compact={true}
												onChanged={() => {
													void loadRisk({ preserveEdits: true });
													onUpdated?.();
												}}
											/>
										</div>
									{/if}
								</section>

								<!-- Activity (collapsible) -->
								<section class="px-3 sm:px-4">
									<button
										type="button"
										onclick={() => (showActivityLog = !showActivityLog)}
										class="w-full py-3 flex items-center justify-between gap-2 text-left hover:opacity-80 transition-opacity"
										aria-expanded={showActivityLog}
									>
										<div class="flex items-center gap-2">
											<Activity class="h-4 w-4 text-muted-foreground" />
											<p class="text-xs font-medium text-muted-foreground">
												Activity
											</p>
										</div>
										<ChevronDown
											class="w-3.5 h-3.5 text-muted-foreground transition-transform {showActivityLog
												? 'rotate-180'
												: ''}"
										/>
									</button>
									{#if showActivityLog}
										<div class="pb-3">
											<EntityActivityLog
												entityType="risk"
												entityId={riskId}
												autoLoad={true}
												embedded={true}
											/>
										</div>
									{/if}
								</section>
							</div>
						</CardBody>
					</Card>
				</EntityModalDetailsDrawer>
			</div>

			<div class="mt-4">
				<EntityCommentsSection {projectId} entityType="risk" entityId={riskId} />
			</div>
		{/if}
	</div>

	<!-- Footer Actions -->
	{#snippet footer()}
		{#if !isLoading && risk}
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
						class="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs px-2 h-8"
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
						class="text-xs h-8"
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
						class="text-xs h-8"
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
		title="Delete risk"
		confirmText="Delete risk"
		confirmVariant="danger"
		loading={isDeleting}
		loadingText="Deleting"
		icon="danger"
		onconfirm={handleDelete}
		oncancel={() => (showDeleteConfirm = false)}
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
		onUpdated={markLinkedEntityChanged}
		onDeleted={markLinkedEntityChanged}
	/>
{/if}

{#if showPlanModal && selectedPlanIdForModal}
	<PlanEditModal
		planId={selectedPlanIdForModal}
		{projectId}
		onClose={closeLinkedEntityModals}
		onUpdated={markLinkedEntityChanged}
		onDeleted={markLinkedEntityChanged}
	/>
{/if}

{#if showGoalModal && selectedGoalIdForModal}
	<GoalEditModal
		goalId={selectedGoalIdForModal}
		{projectId}
		onClose={closeLinkedEntityModals}
		onUpdated={markLinkedEntityChanged}
		onDeleted={markLinkedEntityChanged}
	/>
{/if}

{#if showDocumentModal && selectedDocumentIdForModal}
	<DocumentModal
		{projectId}
		documentId={selectedDocumentIdForModal}
		bind:isOpen={showDocumentModal}
		onClose={closeLinkedEntityModals}
		onSaved={markLinkedEntityChanged}
		onDeleted={markLinkedEntityChanged}
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
