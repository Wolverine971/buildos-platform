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
		FileText,
		Shield
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
	import { RISK_STATES } from '$lib/types/onto';
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
				typeKey = risk.type_key || 'risk.default';
				content = risk.content || risk.props?.description || '';
				mitigationStrategy = risk.props?.mitigation_strategy || '';
				owner = risk.props?.owner || '';
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
				type_key: typeKey || 'risk.default',
				content: content.trim() || null,
				description: content.trim() || null,
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
					<AlertTriangle class="w-5 h-5" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						{title || risk?.title || 'Risk'}
					</h2>
					<div class="mt-1 flex flex-wrap items-center gap-1.5">
						<Badge variant={stateMeta.variant} size="sm">{stateMeta.label}</Badge>
						{#if impactBadge}
							<Badge
								variant={impact === 'critical'
									? 'error'
									: impact === 'high'
										? 'warning'
										: 'default'}
								size="sm">{impactBadge.label} Impact</Badge
							>
						{/if}
					</div>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-1">
						{#if risk?.created_at}Created {new Date(risk.created_at).toLocaleDateString(
								undefined,
								{ month: 'short', day: 'numeric' }
							)}{/if}{#if risk?.updated_at && risk.updated_at !== risk.created_at}
							· Updated {new Date(risk.updated_at).toLocaleDateString(undefined, {
								month: 'short',
								day: 'numeric'
							})}{/if}
					</p>
				</div>
			</div>
			<div class="flex items-center gap-1.5">
				<!-- Chat about this risk button -->
				<button
					type="button"
					onclick={openChatAbout}
					disabled={isLoading || isSaving || !risk}
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:border-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 tx tx-grain tx-weak"
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
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border bg-card text-muted-foreground shadow-ink transition-all pressable hover:border-red-600/50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:hover:border-red-400/50 dark:hover:text-red-400 tx tx-grain tx-weak"
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
			{:else if !risk}
				<div class="text-center py-8">
					<p class="text-destructive">Risk not found</p>
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
													Risk Overview
												</p>
											</div>
											<h3 class="mt-1 text-sm font-semibold text-foreground">
												What could go wrong and how to handle it
											</h3>
											<p class="mt-1 text-xs text-muted-foreground">
												Describe the risk, its severity, and how you plan to
												mitigate it.
											</p>
										</div>
										<div class="flex flex-wrap items-center gap-1.5">
											<Badge variant={stateMeta.variant} size="sm"
												>{stateMeta.label}</Badge
											>
										</div>
									</div>
								</CardHeader>
								<CardBody class="space-y-4">
									<FormField
										label="Risk Title"
										labelFor="title"
										required={true}
										uppercase={false}
										showOptional={false}
										error={!title.trim() && error
											? 'Risk title is required'
											: ''}
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
										label="Risk Details"
										labelFor="content"
										uppercase={false}
										showOptional={false}
									>
										<Textarea
											id="content"
											bind:value={content}
											enterkeyhint="next"
											placeholder="Describe what could happen and why..."
											rows={3}
											disabled={isSaving}
											size="md"
										/>
									</FormField>

									<FormField
										label="Mitigation Strategy"
										labelFor="mitigation-strategy"
										uppercase={false}
										showOptional={false}
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
								</CardBody>
							</Card>

							<Card variant="default" class="wt-paper">
								<CardHeader variant="transparent" texture="none">
									<div
										class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
									>
										<div>
											<div class="flex items-center gap-2">
												<Shield class="h-4 w-4 text-muted-foreground" />
												<p
													class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
												>
													Assessment
												</p>
											</div>
											<h3 class="mt-1 text-sm font-semibold text-foreground">
												Impact, probability, and ownership
											</h3>
										</div>
										<p
											class="text-xs text-muted-foreground sm:max-w-52 sm:text-right"
										>
											Keep operational controls together so the risk's
											severity is obvious at a glance.
										</p>
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
												{#each IMPACT_OPTIONS as opt}
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
												{#each PROBABILITY_OPTIONS as opt}
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
												{#each STATE_OPTIONS as opt}
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
												placeholder="Person responsible..."
												disabled={isSaving}
												size="sm"
											/>
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
											Risk snapshot
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
											Impact
										</p>
										<p class="mt-1 text-sm font-semibold text-foreground">
											{impactBadge?.label ?? impact}
										</p>
									</div>
									<div class="rounded-lg border border-border/70 bg-muted/30 p-3">
										<p
											class="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
										>
											Probability
										</p>
										<p class="mt-1 text-sm font-semibold text-foreground">
											{Math.round(riskProb * 100)}%
										</p>
									</div>
								</div>

								<!-- Risk Score -->
								<div
									class="rounded-lg border border-border/70 bg-card p-3 text-center"
								>
									<p
										class="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
									>
										Risk Score
									</p>
									<p
										class="mt-1 text-2xl font-bold {riskScore >= 2
											? 'text-destructive'
											: riskScore >= 1
												? 'text-warning'
												: 'text-foreground'}"
									>
										{riskScore.toFixed(1)}
									</p>
									<p class="text-xs text-muted-foreground mt-1">
										{riskScore >= 2
											? 'High Priority'
											: riskScore >= 1
												? 'Medium Priority'
												: 'Low Priority'}
									</p>
									<p class="text-[10px] text-muted-foreground mt-1">
										Impact ({riskImpactScore}) x Probability ({Math.round(
											riskProb * 100
										)}%)
									</p>
								</div>

								<div class="rounded-lg border border-border/70 bg-muted/30 p-3">
									<div class="grid grid-cols-1 gap-1.5 text-xs">
										{#if owner}
											<div class="flex items-center justify-between gap-2">
												<span class="text-muted-foreground">Owner</span>
												<span class="text-right text-foreground"
													>{owner}</span
												>
											</div>
										{/if}
										<div class="flex items-center justify-between gap-2">
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
										<div class="flex items-center justify-between gap-2">
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
								</div>
							</CardBody>
						</Card>

						<!-- Linked Entities -->
						<LinkedEntities
							sourceId={riskId}
							sourceKind="risk"
							{projectId}
							onEntityClick={handleLinkedEntityClick}
							onLinksChanged={loadRisk}
						/>

						<!-- Images -->
						<ImageAssetsPanel
							{projectId}
							entityKind="risk"
							entityId={riskId}
							title="Images"
							compact={true}
							onChanged={() => {
								void loadRisk();
								onUpdated?.();
							}}
						/>

						{#if risk?.props?.tags?.length}
							<div
								class="px-3 py-2.5 border border-border rounded-lg bg-card shadow-ink"
							>
								<p
									class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5"
								>
									Tags
								</p>
								<TagsDisplay props={risk.props} size="sm" compact={true} />
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
										entityType="risk"
										entityId={riskId}
										autoLoad={true}
										embedded={true}
									/>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<div class="mt-4">
					<EntityCommentsSection {projectId} entityType="risk" entityId={riskId} />
				</div>
			{/if}
		</div>
	{/snippet}

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
		title="Delete Risk"
		confirmText="Delete Risk"
		confirmVariant="danger"
		loading={isDeleting}
		loadingText="Deleting..."
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
	<AgentChatModalComponent
		isOpen={showChatModal}
		initialProjectFocus={entityFocus}
		onClose={handleChatClose}
	/>
{/if}
