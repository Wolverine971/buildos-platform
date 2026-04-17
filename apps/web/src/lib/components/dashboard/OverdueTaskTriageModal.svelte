<!-- apps/web/src/lib/components/dashboard/OverdueTaskTriageModal.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import {
		ArrowRight,
		CalendarDays,
		CheckCircle2,
		ChevronsUpDown,
		CircleCheck,
		Clock3,
		ExternalLink,
		LoaderCircle,
		MoreHorizontal,
		Share2,
		TriangleAlert,
		Users
	} from 'lucide-svelte';

	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import type {
		OverdueProjectBatch,
		OverdueProjectBatchesPayload,
		OverdueTask
	} from '$lib/types/overdue-triage';
	import {
		buildOverdueProjectBatches,
		safeTimeMs,
		sortBatchTasks,
		sortOverdueProjectBatches
	} from '$lib/utils/overdue-task-batches';
	import { resolveNextOverdueProjectSelection } from '$lib/utils/overdue-triage-selection';

	type ReschedulePreset = 'today' | 'tomorrow' | 'plus3' | 'nextWeek';
	type RescheduleSlot = {
		start_at: string;
		due_at: string;
		duration_minutes: number;
	};
	type ReschedulePlan = {
		preset: ReschedulePreset;
		timezone: string;
		duration_minutes: number;
		window_start_at: string;
		window_end_at: string;
		note: string | null;
		slots: RescheduleSlot[];
		calendar_connected: boolean;
	};
	type CloseSummary = {
		hasChanges: boolean;
		changedCount: number;
	};
	type CompletedBatch = {
		project_id: string;
		project_name: string;
	};

	interface Props {
		isOpen: boolean;
		initialProjectId?: string | null;
		onClose: (summary?: CloseSummary) => void;
	}

	const RESCHEDULE_PRESETS: ReschedulePreset[] = ['today', 'tomorrow', 'plus3', 'nextWeek'];
	const BLOCKED_REVISIT_PRESET: 'tomorrow' | 'plus3' = 'tomorrow';
	const presetLabels: Record<ReschedulePreset, string> = {
		today: 'Today',
		tomorrow: 'Tomorrow',
		plus3: '+3d',
		nextWeek: 'Next week'
	};

	let { isOpen, initialProjectId = null, onClose }: Props = $props();

	let isLoading = $state(false);
	let isProjectActionRunning = $state(false);
	let error = $state<string | null>(null);
	let changedCount = $state(0);
	let initialTaskCount = $state(0);
	let wasOpen = $state(false);
	let activeProjectId = $state<string | null>(initialProjectId);
	let batches = $state<OverdueProjectBatch[]>([]);
	let completedBatches = $state<CompletedBatch[]>([]);
	let pendingTaskIds = $state(new Set<string>());
	let projectMenuOpen = $state(false);
	let projectMenuRef = $state<HTMLDivElement | null>(null);
	let expandedTaskId = $state<string | null>(null);
	let slotTaskId = $state<string | null>(null);
	let activeSlotPreset = $state<ReschedulePreset | null>(null);
	let loadingSlotKey = $state<string | null>(null);
	let slotPlansByTask = $state<Record<string, Partial<Record<ReschedulePreset, ReschedulePlan>>>>(
		{}
	);
	let slotErrorsByTask = $state<Record<string, string>>({});

	const totalRemaining = $derived(batches.reduce((sum, batch) => sum + batch.overdue_count, 0));
	const resolvedCount = $derived(Math.max(0, initialTaskCount - totalRemaining));
	const activeBatch = $derived(
		batches.find((batch) => batch.project_id === activeProjectId) ?? batches[0] ?? null
	);
	const activeTasks = $derived((activeBatch?.tasks ?? []) as OverdueTask[]);

	function resetEphemeralState() {
		projectMenuOpen = false;
		expandedTaskId = null;
		slotTaskId = null;
		activeSlotPreset = null;
		loadingSlotKey = null;
		slotPlansByTask = {};
		slotErrorsByTask = {};
		pendingTaskIds = new Set<string>();
	}

	function formatDueDate(value: string | null): string {
		if (!value) return 'No due date';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'No due date';
		return date.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric'
		});
	}

	function formatStateLabel(state: string): string {
		return state
			.split('_')
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	}

	function overdueLabel(dueAt: string | null): string {
		if (!dueAt) return 'No due date';
		const dueMs = Date.parse(dueAt);
		if (Number.isNaN(dueMs)) return 'No due date';
		const diffDays = Math.max(1, Math.floor((Date.now() - dueMs) / (1000 * 60 * 60 * 24)));
		return `${diffDays}d overdue`;
	}

	function formatAssigneeLabel(task: OverdueTask): string | null {
		const first = task.assignees?.[0];
		if (!first) return null;
		const firstLabel = first.name?.trim() || first.email?.trim()?.split('@')[0] || 'Assigned';
		if ((task.assignees?.length ?? 0) <= 1) return firstLabel;
		return `${firstLabel} +${task.assignees.length - 1}`;
	}

	function isOverdue(task: Pick<OverdueTask, 'state_key' | 'due_at'>): boolean {
		if (!task.due_at) return false;
		if (task.state_key === 'done') return false;
		return safeTimeMs(task.due_at) < Date.now();
	}

	function toIsoEndOfDay(date: Date): string {
		const local = new Date(date);
		local.setHours(23, 59, 0, 0);
		return local.toISOString();
	}

	function presetDueAt(preset: ReschedulePreset): string {
		const base = new Date();
		if (preset === 'tomorrow') base.setDate(base.getDate() + 1);
		if (preset === 'plus3') base.setDate(base.getDate() + 3);
		if (preset === 'nextWeek') base.setDate(base.getDate() + 7);
		return toIsoEndOfDay(base);
	}

	function formatSlotDayLabel(value: string): string {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Invalid date';
		return date.toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}

	function formatSlotTimeRange(startValue: string, endValue: string): string {
		const start = new Date(startValue);
		const end = new Date(endValue);
		if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
			return 'Invalid time';
		}
		return `${start.toLocaleTimeString(undefined, {
			hour: 'numeric',
			minute: '2-digit'
		})} - ${end.toLocaleTimeString(undefined, {
			hour: 'numeric',
			minute: '2-digit'
		})}`;
	}

	function normalizeBatch(batch: OverdueProjectBatch): OverdueProjectBatch {
		return {
			...batch,
			tasks: sortBatchTasks((batch.tasks ?? []) as OverdueTask[])
		};
	}

	function setBatches(
		nextBatches: OverdueProjectBatch[],
		fallbackProjectId: string | null = null
	) {
		const currentProjectId = activeProjectId;
		batches = sortOverdueProjectBatches(nextBatches.map(normalizeBatch));
		activeProjectId = resolveNextOverdueProjectSelection(
			batches,
			currentProjectId,
			fallbackProjectId
		);
	}

	function recomputeBatch(tasks: OverdueTask[]): OverdueProjectBatch | null {
		return buildOverdueProjectBatches(tasks)[0] ?? null;
	}

	function recordCompletedBatch(batch: OverdueProjectBatch) {
		if (completedBatches.some((item) => item.project_id === batch.project_id)) return;
		completedBatches = [
			...completedBatches,
			{ project_id: batch.project_id, project_name: batch.project_name }
		];
	}

	async function loadBatches() {
		isLoading = true;
		error = null;
		resetEphemeralState();
		try {
			const params = new URLSearchParams({
				include_tasks: 'true',
				limit: '100'
			});
			if (initialProjectId) {
				params.set('project_id', initialProjectId);
			}

			const response = await fetch(`/api/onto/tasks/overdue/batches?${params.toString()}`);
			const payload = (await response.json()) as {
				success?: boolean;
				error?: string;
				data?: OverdueProjectBatchesPayload;
			};

			if (!response.ok || !payload.success || !payload.data) {
				throw new Error(payload.error || 'Failed to load overdue project batches');
			}

			setBatches(payload.data.batches, initialProjectId);
			initialTaskCount = payload.data.totalTasks;
			changedCount = 0;
			completedBatches = [];
		} catch (err) {
			console.error('[Overdue Project Batch Triage] Failed to load batches:', err);
			error = err instanceof Error ? err.message : 'Failed to load overdue project batches';
		} finally {
			isLoading = false;
		}
	}

	$effect(() => {
		if (!browser) return;

		if (isOpen && !wasOpen) {
			wasOpen = true;
			activeProjectId = initialProjectId;
			void loadBatches();
			return;
		}

		if (!isOpen && wasOpen) {
			wasOpen = false;
			resetEphemeralState();
		}
	});

	function findTask(taskId: string): {
		batch: OverdueProjectBatch;
		batchIndex: number;
		task: OverdueTask;
		taskIndex: number;
	} | null {
		for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
			const batch = batches[batchIndex];
			if (!batch) continue;
			const tasks = (batch?.tasks ?? []) as OverdueTask[];
			const taskIndex = tasks.findIndex((task) => task.id === taskId);
			if (taskIndex >= 0) {
				const task = tasks[taskIndex];
				if (!task) return null;
				return { batch, batchIndex, task, taskIndex };
			}
		}
		return null;
	}

	function removeTaskFromBatches(taskId: string) {
		const found = findTask(taskId);
		if (!found) return;

		const nextBatches = [...batches];
		const batchTasks = [...((found.batch.tasks ?? []) as OverdueTask[])];
		batchTasks.splice(found.taskIndex, 1);

		if (batchTasks.length === 0) {
			nextBatches.splice(found.batchIndex, 1);
			recordCompletedBatch(found.batch);
			setBatches(nextBatches);
			return;
		}

		const nextBatch = recomputeBatch(batchTasks);
		if (!nextBatch) return;
		nextBatches[found.batchIndex] = nextBatch;
		setBatches(nextBatches, found.batch.project_id);
	}

	function replaceTaskInBatches(taskId: string, nextTask: OverdueTask) {
		const found = findTask(taskId);
		if (!found) return;

		const nextBatches = [...batches];
		const batchTasks = [...((found.batch.tasks ?? []) as OverdueTask[])];
		batchTasks[found.taskIndex] = nextTask;
		const nextBatch = recomputeBatch(batchTasks);
		if (!nextBatch) return;
		nextBatches[found.batchIndex] = nextBatch;
		setBatches(nextBatches, found.batch.project_id);
	}

	async function patchTask(taskId: string, updates: Record<string, unknown>) {
		const response = await fetch(`/api/onto/tasks/${taskId}`, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(updates)
		});

		const payload = (await response.json().catch(() => null)) as {
			error?: string;
			data?: { task?: Partial<OverdueTask> };
		} | null;

		if (!response.ok) {
			throw new Error(payload?.error || 'Failed to update task');
		}

		return payload?.data?.task ?? null;
	}

	async function mutateTask(
		taskId: string,
		updates: Record<string, unknown>,
		options: { silent?: boolean } = {}
	): Promise<boolean> {
		const found = findTask(taskId);
		if (!found || pendingTaskIds.has(taskId)) return false;

		pendingTaskIds = new Set([...pendingTaskIds, taskId]);
		try {
			const patched = await patchTask(taskId, updates);
			const merged: OverdueTask = {
				...found.task,
				...(patched ?? {}),
				project_id: found.task.project_id,
				project_name: found.task.project_name,
				project_state_key: found.task.project_state_key,
				project_updated_at: found.task.project_updated_at,
				project_is_shared: found.task.project_is_shared,
				project_is_collaborative: found.task.project_is_collaborative,
				is_assigned_to_me: found.task.is_assigned_to_me,
				lane: found.task.lane,
				assignees: Array.isArray(patched?.assignees)
					? (patched.assignees as OverdueTask['assignees'])
					: found.task.assignees
			};

			if (isOverdue(merged)) {
				replaceTaskInBatches(taskId, merged);
			} else {
				removeTaskFromBatches(taskId);
			}

			changedCount += 1;
			if (!options.silent) {
				toastService.success('Task updated');
			}
			return true;
		} catch (err) {
			console.error('[Overdue Project Batch Triage] Failed to update task:', err);
			toastService.error(err instanceof Error ? err.message : 'Failed to update task');
			return false;
		} finally {
			const nextPending = new Set(pendingTaskIds);
			nextPending.delete(taskId);
			pendingTaskIds = nextPending;
		}
	}

	async function handleSetTaskState(taskId: string, state: 'done' | 'in_progress' | 'blocked') {
		if (state === 'blocked') {
			await mutateTask(taskId, {
				state_key: 'blocked',
				due_at: presetDueAt(BLOCKED_REVISIT_PRESET)
			});
			return;
		}

		await mutateTask(taskId, { state_key: state });
	}

	async function handleQuickReschedule(taskId: string, preset: 'tomorrow' | 'plus3') {
		await mutateTask(taskId, { due_at: presetDueAt(preset) });
	}

	async function fetchReschedulePlan(
		taskId: string,
		preset: ReschedulePreset
	): Promise<ReschedulePlan> {
		const response = await fetch(`/api/onto/tasks/${taskId}/reschedule-options`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				preset,
				limit: 5
			})
		});

		const payload = (await response.json().catch(() => null)) as {
			success?: boolean;
			error?: string;
			data?: ReschedulePlan;
		} | null;

		if (!response.ok || !payload?.success || !payload.data) {
			throw new Error(payload?.error || 'Failed to load reschedule options');
		}

		return payload.data;
	}

	async function loadReschedulePlan(taskId: string, preset: ReschedulePreset) {
		loadingSlotKey = `${taskId}:${preset}`;
		slotErrorsByTask = {
			...slotErrorsByTask,
			[taskId]: ''
		};
		try {
			const plan = await fetchReschedulePlan(taskId, preset);
			slotPlansByTask = {
				...slotPlansByTask,
				[taskId]: {
					...(slotPlansByTask[taskId] ?? {}),
					[preset]: plan
				}
			};
		} catch (err) {
			console.error('[Overdue Project Batch Triage] Failed to load slot options:', err);
			const message =
				err instanceof Error ? err.message : 'Failed to load reschedule options';
			slotErrorsByTask = {
				...slotErrorsByTask,
				[taskId]: message
			};
			toastService.error(message);
		} finally {
			if (loadingSlotKey === `${taskId}:${preset}`) {
				loadingSlotKey = null;
			}
		}
	}

	function toggleTaskDetails(taskId: string) {
		if (expandedTaskId === taskId) {
			expandedTaskId = null;
			slotTaskId = null;
			activeSlotPreset = null;
			return;
		}

		expandedTaskId = taskId;
		slotTaskId = null;
		activeSlotPreset = null;
	}

	async function toggleSlotFinder(taskId: string) {
		if (slotTaskId === taskId) {
			slotTaskId = null;
			activeSlotPreset = null;
			return;
		}

		slotTaskId = taskId;
		activeSlotPreset = 'tomorrow';
		if (!slotPlansByTask[taskId]?.tomorrow) {
			await loadReschedulePlan(taskId, 'tomorrow');
		}
	}

	async function selectSlotPreset(taskId: string, preset: ReschedulePreset) {
		activeSlotPreset = preset;
		if (slotPlansByTask[taskId]?.[preset]) return;
		await loadReschedulePlan(taskId, preset);
	}

	async function applyRescheduleSlot(taskId: string, slot: RescheduleSlot) {
		await mutateTask(taskId, {
			start_at: slot.start_at,
			due_at: slot.due_at
		});
	}

	async function runProjectAction(action: 'tomorrow' | 'plus3' | 'in_progress' | 'done') {
		if (!activeBatch) return;
		const taskIds = ((activeBatch.tasks ?? []) as OverdueTask[]).map((task) => task.id);
		if (taskIds.length === 0) return;

		if (action === 'done' && browser) {
			const confirmed = window.confirm(
				`Mark ${taskIds.length} overdue tasks as done in ${activeBatch.project_name}?`
			);
			if (!confirmed) return;
		}

		isProjectActionRunning = true;
		projectMenuOpen = false;
		let succeeded = 0;
		let failed = 0;

		try {
			for (const taskId of taskIds) {
				const updates =
					action === 'tomorrow'
						? { due_at: presetDueAt('tomorrow') }
						: action === 'plus3'
							? { due_at: presetDueAt('plus3') }
							: action === 'in_progress'
								? { state_key: 'in_progress' }
								: { state_key: 'done' };

				const ok = await mutateTask(taskId, updates, { silent: true });
				if (ok) succeeded += 1;
				else failed += 1;
			}
		} finally {
			isProjectActionRunning = false;
		}

		if (succeeded > 0 && failed === 0) {
			toastService.success(`Updated ${succeeded} tasks in ${activeBatch.project_name}`);
			return;
		}
		if (succeeded > 0 && failed > 0) {
			toastService.error(`Updated ${succeeded} tasks (${failed} failed)`);
			return;
		}
		toastService.error('No tasks were updated');
	}

	function setActiveProject(projectId: string) {
		activeProjectId = projectId;
		projectMenuOpen = false;
		expandedTaskId = null;
		slotTaskId = null;
		activeSlotPreset = null;
	}

	function closeModal() {
		onClose?.({
			hasChanges: changedCount > 0,
			changedCount
		});
	}

	function handleWindowClick(event: MouseEvent) {
		if (!projectMenuOpen || !projectMenuRef) return;
		if (projectMenuRef.contains(event.target as Node)) return;
		projectMenuOpen = false;
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			projectMenuOpen = false;
		}

		if (!activeBatch) return;
		if ((event.target as HTMLElement | null)?.closest('input, textarea')) return;

		if (event.key.toLowerCase() === 'd' && expandedTaskId) {
			void handleSetTaskState(expandedTaskId, 'done');
		}

		if (event.key.toLowerCase() === 't' && expandedTaskId) {
			void handleQuickReschedule(expandedTaskId, 'tomorrow');
		}
	}
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<Modal {isOpen} onClose={closeModal} title="Project Batch Triage" size="xl">
	<div class="p-3 space-y-3">
		<div class="flex flex-wrap items-center gap-2 text-xs">
			<span
				class="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1"
			>
				<TriangleAlert class="h-3 w-3 text-accent" />
				{batches.length} active {batches.length === 1 ? 'project' : 'projects'}
			</span>
			<span
				class="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1"
			>
				<CircleCheck class="h-3 w-3 text-success" />
				{resolvedCount} resolved
			</span>
			<span
				class="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1"
			>
				<Clock3 class="h-3 w-3 text-muted-foreground" />
				{totalRemaining} remaining
			</span>
		</div>

		{#if isLoading}
			<div
				class="rounded-lg border border-border bg-card p-4 text-center text-sm text-muted-foreground shadow-ink"
			>
				<LoaderCircle class="mx-auto mb-2 h-5 w-5 animate-spin" />
				Loading overdue project batches...
			</div>
		{:else if error}
			<div
				class="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2 tx tx-static tx-weak shadow-ink"
			>
				<p class="text-sm text-destructive">{error}</p>
				<Button variant="outline" size="sm" onclick={loadBatches}>Retry</Button>
			</div>
		{:else if totalRemaining === 0}
			<div
				class="rounded-lg border border-success/30 bg-success/5 p-4 text-center space-y-2 tx tx-bloom tx-weak shadow-ink"
			>
				<CircleCheck class="mx-auto h-6 w-6 text-success" />
				<p class="text-sm font-semibold text-foreground">
					You cleared all overdue project batches
				</p>
				<p class="text-xs text-muted-foreground">No overdue tasks are left to triage.</p>
				<div class="pt-1">
					<a
						href="/projects"
						class="text-xs font-medium text-accent hover:underline underline-offset-2"
					>
						Go to projects &rarr;
					</a>
				</div>
			</div>
		{:else}
			<div class="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
				<div class="space-y-3">
					<div class="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
						{#each batches as batch (batch.project_id)}
							<button
								type="button"
								onclick={() => setActiveProject(batch.project_id)}
								class="min-w-[220px] lg:min-w-0 rounded-lg border px-3 py-2.5 text-left transition-colors shadow-ink pressable {activeBatch?.project_id ===
								batch.project_id
									? 'border-accent/40 bg-accent/10'
									: 'border-border bg-card hover:bg-muted/40'}"
							>
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0">
										<p class="text-sm font-semibold text-foreground truncate">
											{batch.project_name}
										</p>
										<p class="mt-1 text-[11px] text-muted-foreground">
											{batch.overdue_count} overdue
											{#if batch.assigned_to_me_count > 0}
												· {batch.assigned_to_me_count} mine
											{/if}
										</p>
									</div>
									{#if batch.project_is_collaborative}
										<span
											class="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent shrink-0"
										>
											<Users class="h-2.5 w-2.5" />
											Shared
										</span>
									{/if}
								</div>
								{#if batch.oldest_due_at}
									<p class="mt-1.5 text-[11px] text-muted-foreground">
										Oldest {overdueLabel(batch.oldest_due_at)}
									</p>
								{/if}
							</button>
						{/each}
					</div>

					{#if completedBatches.length > 0}
						<div class="rounded-lg border border-border bg-card p-2.5 space-y-2">
							<p
								class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
							>
								Cleared
							</p>
							<div class="space-y-1.5">
								{#each completedBatches as batch (batch.project_id)}
									<div
										class="flex items-center gap-2 text-xs text-muted-foreground"
									>
										<CheckCircle2 class="h-3.5 w-3.5 text-success shrink-0" />
										<span class="truncate">{batch.project_name}</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>

				{#if activeBatch}
					<div class="rounded-lg border border-border bg-card shadow-ink overflow-hidden">
						<div class="border-b border-border px-3 py-3 space-y-3">
							<div class="flex flex-wrap items-start justify-between gap-3">
								<div class="min-w-0">
									<div class="flex flex-wrap items-center gap-2">
										<p class="text-sm font-semibold text-foreground truncate">
											{activeBatch.project_name}
										</p>
										{#if activeBatch.project_is_collaborative}
											<span
												class="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent"
											>
												<Share2 class="h-2.5 w-2.5" />
												Collaborative
											</span>
										{/if}
									</div>
									<p class="mt-1 text-xs text-muted-foreground">
										{activeBatch.overdue_count} overdue
										{#if activeBatch.assigned_to_me_count > 0}
											· {activeBatch.assigned_to_me_count} assigned to me
										{/if}
										{#if activeBatch.oldest_due_at}
											· oldest {overdueLabel(activeBatch.oldest_due_at)}
										{/if}
									</p>
								</div>

								<div class="flex items-center gap-2 shrink-0">
									<a
										href="/projects/{activeBatch.project_id}"
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline underline-offset-2"
									>
										Open project
										<ExternalLink class="h-3 w-3" />
									</a>
								</div>
							</div>

							<div class="flex flex-wrap items-center gap-2">
								<Button
									size="sm"
									variant="outline"
									disabled={isProjectActionRunning}
									onclick={() => runProjectAction('tomorrow')}
								>
									Tomorrow all
								</Button>
								<Button
									size="sm"
									variant="outline"
									disabled={isProjectActionRunning}
									onclick={() => runProjectAction('plus3')}
								>
									+3d all
								</Button>
								<Button
									size="sm"
									variant="outline"
									disabled={isProjectActionRunning}
									onclick={() => runProjectAction('in_progress')}
								>
									Mark all in progress
								</Button>
								<div class="relative" bind:this={projectMenuRef}>
									<button
										type="button"
										class="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground shadow-ink transition-colors hover:bg-muted"
										disabled={isProjectActionRunning}
										aria-expanded={projectMenuOpen}
										onclick={() => (projectMenuOpen = !projectMenuOpen)}
									>
										<MoreHorizontal class="h-4 w-4" />
										More
									</button>
									{#if projectMenuOpen}
										<div
											class="absolute right-0 top-[calc(100%+0.5rem)] z-10 w-44 rounded-lg border border-border bg-card p-1.5 shadow-2xl"
											role="menu"
										>
											<button
												type="button"
												class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
												role="menuitem"
												onclick={() => runProjectAction('done')}
											>
												<CircleCheck class="h-4 w-4 text-success" />
												Mark all done
											</button>
											<a
												href="/projects/{activeBatch.project_id}"
												target="_blank"
												rel="noopener noreferrer"
												class="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-muted"
												role="menuitem"
											>
												<ExternalLink
													class="h-4 w-4 text-muted-foreground"
												/>
												Open project
											</a>
										</div>
									{/if}
								</div>
							</div>
						</div>

						<div class="divide-y divide-border">
							{#each activeTasks as task (task.id)}
								<div class="px-3 py-3">
									<div
										class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
									>
										<div class="min-w-0 flex-1">
											<div class="flex flex-wrap items-center gap-2">
												<p
													class="text-sm font-semibold text-foreground break-words"
												>
													{task.title}
												</p>
												{#if task.is_assigned_to_me}
													<span
														class="inline-flex items-center rounded-full border border-success/30 bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success"
													>
														Mine
													</span>
												{/if}
											</div>
											<div
												class="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"
											>
												<span class="inline-flex items-center gap-1">
													<CalendarDays class="h-3 w-3" />
													Due {formatDueDate(task.due_at)}
												</span>
												<span class="text-border">&middot;</span>
												<span class="inline-flex items-center gap-1">
													<Clock3 class="h-3 w-3" />
													{overdueLabel(task.due_at)}
												</span>
												<span class="text-border">&middot;</span>
												<span>{formatStateLabel(task.state_key)}</span>
												{#if task.priority !== null}
													<span class="text-border">&middot;</span>
													<span>P{task.priority}</span>
												{/if}
												{#if formatAssigneeLabel(task)}
													<span class="text-border">&middot;</span>
													<span>@{formatAssigneeLabel(task)}</span>
												{/if}
											</div>
										</div>

										<div class="flex flex-wrap items-center gap-2 shrink-0">
											<button
												type="button"
												class="rounded-md border border-success/30 bg-success/10 px-2 py-1.5 text-[11px] font-semibold text-success transition-colors hover:bg-success/15 disabled:opacity-50"
												disabled={pendingTaskIds.has(task.id)}
												onclick={() => handleSetTaskState(task.id, 'done')}
											>
												Done
											</button>
											<button
												type="button"
												class="rounded-md border border-border bg-card px-2 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
												disabled={pendingTaskIds.has(task.id)}
												onclick={() =>
													handleQuickReschedule(task.id, 'tomorrow')}
											>
												Tomorrow
											</button>
											<button
												type="button"
												class="rounded-md border border-border bg-card px-2 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
												disabled={pendingTaskIds.has(task.id)}
												onclick={() =>
													handleQuickReschedule(task.id, 'plus3')}
											>
												+3d
											</button>
											<button
												type="button"
												class="rounded-md border border-border bg-card px-2 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted"
												aria-expanded={expandedTaskId === task.id}
												onclick={() => toggleTaskDetails(task.id)}
											>
												<span class="inline-flex items-center gap-1">
													More
													<ChevronsUpDown class="h-3.5 w-3.5" />
												</span>
											</button>
										</div>
									</div>

									{#if expandedTaskId === task.id}
										<div
											class="mt-3 rounded-lg border border-border bg-background/60 p-3 space-y-3"
										>
											<div class="flex flex-wrap items-center gap-2">
												<Button
													size="sm"
													variant="outline"
													disabled={pendingTaskIds.has(task.id)}
													onclick={() =>
														handleSetTaskState(task.id, 'in_progress')}
												>
													In progress
												</Button>
												<Button
													size="sm"
													variant="outline"
													disabled={pendingTaskIds.has(task.id)}
													onclick={() =>
														handleSetTaskState(task.id, 'blocked')}
												>
													Blocked + revisit
												</Button>
												<Button
													size="sm"
													variant="ghost"
													disabled={pendingTaskIds.has(task.id)}
													onclick={() => toggleSlotFinder(task.id)}
												>
													Find slot
												</Button>
												<a
													href="/projects/{task.project_id}/tasks/{task.id}"
													target="_blank"
													rel="noopener noreferrer"
													class="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-accent hover:underline underline-offset-2"
												>
													Open task
													<ArrowRight class="h-3.5 w-3.5" />
												</a>
											</div>

											{#if task.description}
												<p class="text-xs leading-5 text-muted-foreground">
													{task.description}
												</p>
											{/if}

											{#if slotTaskId === task.id}
												<div
													class="space-y-2 rounded-lg border border-border bg-card p-3"
												>
													<div class="flex flex-wrap items-center gap-2">
														{#each RESCHEDULE_PRESETS as preset}
															<button
																type="button"
																class="rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors {activeSlotPreset ===
																preset
																	? 'border-accent/40 bg-accent/10 text-accent'
																	: 'border-border bg-card text-foreground hover:bg-muted'}"
																disabled={loadingSlotKey ===
																	`${task.id}:${preset}`}
																onclick={() =>
																	selectSlotPreset(
																		task.id,
																		preset
																	)}
															>
																{presetLabels[preset]}
															</button>
														{/each}
													</div>

													{#if activeSlotPreset}
														{@const activePlan =
															slotPlansByTask[task.id]?.[
																activeSlotPreset
															]}
														{#if loadingSlotKey === `${task.id}:${activeSlotPreset}`}
															<div
																class="flex items-center gap-2 text-[11px] text-muted-foreground"
															>
																<LoaderCircle
																	class="h-3.5 w-3.5 animate-spin"
																/>
																Finding open time...
															</div>
														{:else if activePlan?.slots?.length}
															<div class="grid gap-2">
																{#each activePlan.slots as slot}
																	<button
																		type="button"
																		class="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-left transition-colors hover:bg-muted/40 disabled:opacity-50"
																		disabled={pendingTaskIds.has(
																			task.id
																		)}
																		onclick={() =>
																			applyRescheduleSlot(
																				task.id,
																				slot
																			)}
																	>
																		<div class="min-w-0">
																			<p
																				class="text-xs font-medium text-foreground"
																			>
																				{formatSlotDayLabel(
																					slot.start_at
																				)}
																			</p>
																			<p
																				class="mt-0.5 text-[11px] text-muted-foreground"
																			>
																				{formatSlotTimeRange(
																					slot.start_at,
																					slot.due_at
																				)}
																			</p>
																		</div>
																		<span
																			class="text-[11px] font-medium text-accent"
																		>
																			Use slot
																		</span>
																	</button>
																{/each}
															</div>
														{:else}
															<p
																class="text-[11px] text-muted-foreground"
															>
																{slotErrorsByTask[task.id] ||
																	activePlan?.note ||
																	'No open time found in this window.'}
															</p>
														{/if}
													{/if}
												</div>
											{/if}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</Modal>
