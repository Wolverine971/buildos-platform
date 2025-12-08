<!-- apps/web/src/lib/components/ontology/PlanEditModal.svelte -->
<!--
	Plan Edit Modal Component (2025 refresh)

	High-fidelity plan workspace inspired by TaskEditModal. Provides:
	- Rich hero header with plan metadata + live timeline metrics
	- Dual-column layout: form + insights
	- FSM state visualizer or manual state selection
	- Linked task snapshot and safe danger zone

	Related Files:
	- API Endpoints: /apps/web/src/routes/api/onto/plans/[id]/+server.ts
	- Create Modal: /apps/web/src/lib/components/ontology/PlanCreateModal.svelte
	- FSM Visualizer: /apps/web/src/lib/components/ontology/FSMStateVisualizer.svelte
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import { Clock, ListChecks, Loader, Save, Trash2 } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import FSMStateVisualizer from './FSMStateVisualizer.svelte';
	import {
		getPlanStateBadgeClass,
		getTaskStateBadgeClass
	} from '$lib/utils/ontology-badge-styles';
	import type { Task } from '$lib/types/onto';

	interface Props {
		planId: string;
		projectId: string;
		tasks?: Task[];
		onClose: () => void;
		onUpdated?: () => void;
		onDeleted?: () => void;
	}

	let { planId, projectId, tasks = [], onClose, onUpdated, onDeleted }: Props = $props();

	let modalOpen = $state(true);
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

	const stateOptions = [
		{ value: 'draft', label: 'Draft' },
		{ value: 'planning', label: 'Planning' },
		{ value: 'active', label: 'Active' },
		{ value: 'on_hold', label: 'On Hold' },
		{ value: 'completed', label: 'Completed' },
		{ value: 'cancelled', label: 'Cancelled' }
	];

	// FSM related
	let allowedTransitions = $state<any[]>([]);

	const planTasks = $derived((tasks || []).filter((task) => task.plan_id === planId));
	const completedTasks = $derived(
		planTasks.filter((task) => ['done', 'completed'].includes(task.state_key)).length
	);
	const completionPercent = $derived(
		planTasks.length ? Math.round((completedTasks / planTasks.length) * 100) : null
	);
	const highlightedTasks = $derived(
		[...planTasks]
			.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
			.slice(0, 3)
	);
	const stateBadgeClasses = $derived(
		`px-3 py-1 rounded-full text-xs font-semibold capitalize ${getPlanStateBadgeClass(stateKey)}`
	);
	const dateError = $derived.by(() => {
		if (startDate && endDate) {
			const start = new Date(startDate);
			const end = new Date(endDate);
			if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start > end) {
				return 'End date must be after start date';
			}
		}
		return '';
	});

	const startLabel = $derived(formatDateOnly(startDate) ?? 'Not scheduled');
	const endLabel = $derived(formatDateOnly(endDate) ?? 'Not scheduled');
	const durationLabel = $derived.by(() => {
		const days = computeDurationDays(startDate, endDate);
		return days > 0 ? `${days} day${days === 1 ? '' : 's'}` : 'Flexible timeline';
	});
	const lastUpdatedLabel = $derived(formatRelativeTime(plan?.updated_at || plan?.created_at));
	const planTypeLabel = $derived(plan?.type_key || 'plan.phase.base');
	const planIdLabel = $derived(plan?.id?.slice(0, 8) || planId.slice(0, 8));
	const formDisabled = $derived(isSaving || isDeleting);

	// Load plan data when modal opens (client-side only)
	$effect(() => {
		if (browser) {
			loadPlan();
		}
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
			const response = await fetch(`/api/onto/fsm/transitions?kind=plan&id=${planId}`);
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
			error = 'Plan name is required';
			return;
		}

		if (dateError) {
			error = dateError;
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

	async function handleStateChange(event: { state: string; actions: string[]; event: string }) {
		stateKey = event.state;
		await handleSave();
		await loadTransitions();
	}

	function handleClose() {
		modalOpen = false;
		onClose?.();
	}

	function formatDateOnly(value: string | null | undefined): string | null {
		if (!value) return null;
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return null;
		return parsed.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatRelativeTime(value: string | null | undefined): string | null {
		if (!value) return null;
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return null;
		const diffMs = Date.now() - date.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Yesterday';
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString();
	}

	function computeDurationDays(start: string, end: string): number {
		if (!start || !end) return 0;
		const startDateObj = new Date(start);
		const endDateObj = new Date(end);
		if (Number.isNaN(startDateObj.getTime()) || Number.isNaN(endDateObj.getTime())) return 0;
		const diff = endDateObj.getTime() - startDateObj.getTime();
		return diff > 0 ? Math.round(diff / (1000 * 60 * 60 * 24)) : 0;
	}

	function formatTaskMeta(task: Task): string {
		if (task.due_at) {
			const dueLabel = formatDateOnly(task.due_at);
			return dueLabel ? `Due ${dueLabel}` : 'Due date pending';
		}
		return formatRelativeTime(task.updated_at)
			? `Updated ${formatRelativeTime(task.updated_at)}`
			: 'No recent activity';
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
		<!-- Inkprint header with strip texture -->
		<div
			class="flex-shrink-0 bg-muted/50 border-b border-border px-3 py-3 sm:px-6 sm:py-6 flex flex-col gap-3 sm:gap-5 tx tx-strip tx-weak"
		>
			<div class="flex items-start justify-between gap-2 sm:gap-4">
				<div class="space-y-1 sm:space-y-2 min-w-0 flex-1">
					<p
						class="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.3em] sm:tracking-[0.4em] text-muted-foreground"
					>
						Plan overview
					</p>
					<h2
						class="text-lg sm:text-2xl font-bold leading-tight truncate text-foreground"
					>
						{name || plan?.name || 'Plan details'}
					</h2>
					<div class="flex flex-wrap items-center gap-1.5 sm:gap-3 text-xs sm:text-sm">
						<span class={stateBadgeClasses}>{stateKey}</span>
						<span
							class="hidden sm:inline font-mono text-xs tracking-wide text-muted-foreground"
							>{planTypeLabel}</span
						>
						<span class="text-muted-foreground">#{planIdLabel}</span>
					</div>
					{#if lastUpdatedLabel}
						<p class="text-xs sm:text-sm text-muted-foreground hidden sm:block">
							Updated {lastUpdatedLabel}
						</p>
					{/if}
				</div>
				<Button
					variant="ghost"
					size="sm"
					onclick={handleClose}
					class="text-muted-foreground hover:text-foreground shrink-0 !p-1.5 sm:!p-2"
					disabled={isSaving || isDeleting}
				>
					<svg
						class="w-4 h-4 sm:w-5 sm:h-5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						></path>
					</svg>
				</Button>
			</div>

			<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-xs sm:text-sm">
				<div class="rounded bg-muted/50 p-2 sm:p-3">
					<p
						class="text-[10px] sm:text-xs uppercase tracking-[0.2em] sm:tracking-[0.3em] text-muted-foreground"
					>
						Duration
					</p>
					<p class="text-sm sm:text-lg font-semibold truncate text-foreground">
						{durationLabel}
					</p>
				</div>
				<div class="rounded bg-muted/50 p-2 sm:p-3">
					<p
						class="text-[10px] sm:text-xs uppercase tracking-[0.2em] sm:tracking-[0.3em] text-muted-foreground"
					>
						Start
					</p>
					<p class="text-sm sm:text-lg font-semibold truncate text-foreground">
						{startLabel}
					</p>
				</div>
				<div class="rounded bg-muted/50 p-2 sm:p-3">
					<p
						class="text-[10px] sm:text-xs uppercase tracking-[0.2em] sm:tracking-[0.3em] text-muted-foreground"
					>
						End
					</p>
					<p class="text-sm sm:text-lg font-semibold truncate text-foreground">
						{endLabel}
					</p>
				</div>
				<div class="rounded bg-muted/50 p-2 sm:p-3">
					<p
						class="text-[10px] sm:text-xs uppercase tracking-[0.2em] sm:tracking-[0.3em] text-muted-foreground"
					>
						Tasks
					</p>
					<p class="text-sm sm:text-lg font-semibold text-foreground">
						{planTasks.length}
						{#if completionPercent !== null}
							<span class="text-xs sm:text-sm font-medium text-muted-foreground">
								({completionPercent}%)</span
							>
						{/if}
					</p>
				</div>
			</div>
		</div>
	{/snippet}

	{#snippet children()}
		<!-- Main content - minimal padding on mobile -->
		<div class="px-3 py-3 sm:px-6 sm:py-6">
			{#if isLoading}
				<div class="flex items-center justify-center py-16">
					<Loader class="w-8 h-8 animate-spin text-muted-foreground" />
				</div>
			{:else if !plan}
				<div class="text-center py-16">
					<p class="text-destructive">Plan not found</p>
				</div>
			{:else}
				<div class="grid gap-6 lg:grid-cols-3">
					<section class="space-y-6 lg:col-span-2">
						<Card class="shadow-ink">
							<CardHeader
								variant="default"
								class="flex items-center justify-between tx tx-frame tx-weak"
							>
								<div>
									<p
										class="text-xs font-semibold uppercase tracking-[0.3em] text-accent"
									>
										Plan details
									</p>
									<h3 class="text-lg font-semibold text-foreground">
										Structure the execution blueprint
									</h3>
								</div>
							</CardHeader>
							<CardBody class="space-y-5">
								<form
									onsubmit={(event) => {
										event.preventDefault();
										handleSave();
									}}
									class="space-y-5"
								>
									<FormField label="Plan name" labelFor="plan-name" required>
										<TextInput
											id="plan-name"
											bind:value={name}
											inputmode="text"
											enterkeyhint="next"
											placeholder="e.g., Foundation sprint, GTM launch"
											required
											disabled={formDisabled}
										/>
									</FormField>

									<FormField
										label="Description"
										labelFor="plan-description"
										showOptional={false}
									>
										<Textarea
											id="plan-description"
											bind:value={description}
											enterkeyhint="next"
											rows={4}
											placeholder="Summarize objectives, target outcomes, and cross-team dependencies."
											disabled={formDisabled}
										/>
									</FormField>

									<div class="grid gap-4 sm:grid-cols-2">
										<FormField
											label="Start date"
											labelFor="plan-start"
											showOptional={false}
										>
											<TextInput
												id="plan-start"
												bind:value={startDate}
												type="date"
												inputmode="numeric"
												enterkeyhint="next"
												disabled={formDisabled}
											/>
										</FormField>
										<FormField
											label="End date"
											labelFor="plan-end"
											error={dateError}
											showOptional={false}
										>
											<TextInput
												id="plan-end"
												bind:value={endDate}
												type="date"
												inputmode="numeric"
												enterkeyhint="done"
												disabled={formDisabled}
											/>
										</FormField>
									</div>

									{#if allowedTransitions.length > 0}
										<div class="pt-4 border-t border-border">
											<FSMStateVisualizer
												entityId={planId}
												entityKind="plan"
												entityName={name}
												currentState={stateKey}
												initialTransitions={allowedTransitions}
												onstatechange={handleStateChange}
											/>
										</div>
									{:else}
										<FormField
											label="State"
											labelFor="plan-state"
											showOptional={false}
										>
											<Select
												id="plan-state"
												bind:value={stateKey}
												disabled={formDisabled}
											>
												{#each stateOptions as option}
													<option value={option.value}
														>{option.label}</option
													>
												{/each}
											</Select>
										</FormField>
									{/if}

									{#if error}
										<div
											class="rounded border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
										>
											{error}
										</div>
									{/if}
								</form>
							</CardBody>
						</Card>
					</section>

					<div class="space-y-4">
						<Card class="shadow-ink">
							<CardHeader class="flex items-center gap-2">
								<Clock class="w-4 h-4 text-accent" />
								<h4
									class="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground"
								>
									Timeline insight
								</h4>
							</CardHeader>
							<CardBody class="space-y-3">
								<div class="grid grid-cols-2 gap-3 text-sm">
									<div class="rounded bg-muted/30 p-3 border border-border">
										<p
											class="text-xs uppercase tracking-[0.3em] text-muted-foreground"
										>
											Start
										</p>
										<p class="font-semibold text-foreground">
											{startLabel}
										</p>
									</div>
									<div class="rounded bg-muted/30 p-3 border border-border">
										<p
											class="text-xs uppercase tracking-[0.3em] text-muted-foreground"
										>
											End
										</p>
										<p class="font-semibold text-foreground">
											{endLabel}
										</p>
									</div>
								</div>
								<div
									class="rounded bg-accent/10 border border-accent/30 px-3 py-2 text-xs text-foreground tx tx-bloom tx-weak"
								>
									Align plan duration with sprint cadence. If work exceeds six
									weeks, consider splitting into phases.
								</div>
							</CardBody>
						</Card>

						<Card class="shadow-ink">
							<CardHeader class="flex items-center gap-2">
								<ListChecks class="w-4 h-4 text-accent" />
								<h4
									class="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground"
								>
									Linked tasks
								</h4>
							</CardHeader>
							<CardBody class="space-y-3">
								{#if planTasks.length === 0}
									<div class="text-sm text-muted-foreground">
										No tasks linked yet. Assign tasks to this plan from the
										Tasks tab to visualize progress.
									</div>
								{:else}
									{#each highlightedTasks as task}
										<div
											class="p-3 border border-border rounded flex items-start justify-between gap-3"
										>
											<div>
												<p class="font-semibold text-foreground">
													{task.title}
												</p>
												<p class="text-xs text-muted-foreground">
													{formatTaskMeta(task)}
												</p>
											</div>
											<span
												class={`text-xs font-semibold px-3 py-1 rounded-full ${getTaskStateBadgeClass(task.state_key)}`}
											>
												{task.state_key}
											</span>
										</div>
									{/each}
									{#if planTasks.length > highlightedTasks.length}
										<p class="text-xs text-muted-foreground">
											+{planTasks.length - highlightedTasks.length} more tasks
											linked
										</p>
									{/if}
								{/if}
							</CardBody>
						</Card>

						<!-- Danger zone - compact inline on mobile -->
						<div
							class="flex items-center justify-between gap-2 p-2 sm:p-3 rounded-lg border border-destructive/30 bg-destructive/5"
						>
							<div class="flex items-center gap-1.5 sm:gap-2 min-w-0">
								<Trash2 class="w-3 h-3 sm:w-4 sm:h-4 text-destructive shrink-0" />
								<span
									class="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-destructive"
								>
									Danger
								</span>
							</div>
							{#if !showDeleteConfirm}
								<Button
									variant="danger"
									size="sm"
									onclick={() => (showDeleteConfirm = true)}
									disabled={isDeleting}
									class="text-[10px] sm:text-xs px-2 py-1 sm:px-3 sm:py-1.5"
								>
									Delete
								</Button>
							{:else}
								<div class="flex items-center gap-1.5 sm:gap-2">
									<Button
										variant="ghost"
										size="sm"
										onclick={() => (showDeleteConfirm = false)}
										disabled={isDeleting}
										class="text-[10px] sm:text-xs px-2 py-1"
									>
										No
									</Button>
									<Button
										variant="danger"
										size="sm"
										onclick={handleDelete}
										loading={isDeleting}
										class="text-[10px] sm:text-xs px-2 py-1 sm:px-3 sm:py-1.5"
									>
										Confirm
									</Button>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/snippet}

	<!-- Footer Actions - buttons on one row, smaller on mobile -->
	{#snippet footer()}
		{#if !isLoading && plan}
			<div
				class="flex flex-row items-center justify-end gap-2 sm:gap-4 p-2 sm:p-6 border-t border-border bg-muted/30 tx tx-grain tx-weak"
			>
				<Button
					variant="ghost"
					size="sm"
					onclick={handleClose}
					disabled={isSaving || isDeleting}
					class="text-xs sm:text-sm px-2 sm:px-4"
				>
					Cancel
				</Button>
				<Button
					variant="primary"
					size="sm"
					onclick={handleSave}
					loading={isSaving}
					disabled={formDisabled || !name.trim()}
					class="text-xs sm:text-sm px-2 sm:px-4"
				>
					<Save class="w-3 h-3 sm:w-4 sm:h-4" />
					<span class="hidden sm:inline">Save changes</span>
					<span class="sm:hidden">Save</span>
				</Button>
			</div>
		{/if}
	{/snippet}
</Modal>

{#if showDeleteConfirm}
	<ConfirmationModal
		isOpen={showDeleteConfirm}
		title="Delete Plan"
		confirmText="Delete Plan"
		confirmVariant="danger"
		loading={isDeleting}
		loadingText="Deleting..."
		icon="danger"
		on:confirm={handleDelete}
		on:cancel={() => (showDeleteConfirm = false)}
	>
		<p class="text-sm text-gray-600 dark:text-gray-400" slot="content">
			This will permanently remove the plan and disconnect linked tasks.
		</p>
	</ConfirmationModal>
{/if}
