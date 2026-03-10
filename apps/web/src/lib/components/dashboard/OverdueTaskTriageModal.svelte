<!-- apps/web/src/lib/components/dashboard/OverdueTaskTriageModal.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import {
		TriangleAlert,
		CalendarDays,
		CircleCheck,
		Clock3,
		LoaderCircle,
		SkipForward,
		Users
	} from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService } from '$lib/stores/toast.store';

	type LaneKey = 'assigned_collab' | 'assigned_other' | 'other';
	type BulkScope = 'current_lane' | 'all_lanes';
	type ReschedulePreset = 'today' | 'tomorrow' | 'plus3' | 'nextWeek';
	const BLOCKED_REVISIT_PRESET: 'tomorrow' | 'plus3' = 'tomorrow';

	type TaskAssignee = {
		actor_id: string;
		name: string | null;
		email: string | null;
	};

	type OverdueTask = {
		id: string;
		project_id: string;
		project_name: string;
		title: string;
		description: string | null;
		state_key: 'todo' | 'in_progress' | 'blocked' | 'done';
		due_at: string | null;
		priority: number | null;
		updated_at: string;
		is_assigned_to_me: boolean;
		project_is_shared: boolean;
		project_is_collaborative: boolean;
		assignees: TaskAssignee[];
		lane: LaneKey;
	};

	type OverduePayload = {
		tasks?: OverdueTask[];
		total?: number;
		laneCounts?: Record<LaneKey, number>;
		nextCursor?: string | null;
	};

	type CloseSummary = {
		hasChanges: boolean;
		changedCount: number;
	};

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

	interface Props {
		isOpen: boolean;
		onClose: (summary?: CloseSummary) => void;
	}

	const LANE_ORDER: LaneKey[] = ['assigned_collab', 'assigned_other', 'other'];
	const RESCHEDULE_PRESETS: ReschedulePreset[] = ['today', 'tomorrow', 'plus3', 'nextWeek'];

	const laneLabels: Record<LaneKey, string> = {
		assigned_collab: 'Assigned to me · Collaborative',
		assigned_other: 'Assigned to me · Other projects',
		other: 'Other overdue'
	};

	const reschedulePresetLabels: Record<ReschedulePreset, string> = {
		today: 'Today',
		tomorrow: 'Tomorrow',
		plus3: '+3d',
		nextWeek: 'Next week'
	};

	let { isOpen, onClose }: Props = $props();

	let isLoading = $state(false);
	let isBulkRunning = $state(false);
	let error = $state<string | null>(null);
	let changedCount = $state(0);
	let initialCount = $state(0);
	let wasOpen = $state(false);
	let pendingTaskIds = $state(new Set<string>());
	let activeLane = $state<LaneKey>('assigned_collab');
	let bulkScope = $state<BulkScope>('current_lane');
	let laneIndex = $state<Record<LaneKey, number>>({
		assigned_collab: 0,
		assigned_other: 0,
		other: 0
	});
	let laneTasks = $state<Record<LaneKey, OverdueTask[]>>({
		assigned_collab: [],
		assigned_other: [],
		other: []
	});
	let activeReschedulePreset = $state<ReschedulePreset | null>(null);
	let loadingReschedulePreset = $state<ReschedulePreset | null>(null);
	let reschedulePlans = $state<Partial<Record<ReschedulePreset, ReschedulePlan>>>({});
	let rescheduleError = $state<string | null>(null);
	let rescheduleTaskId = $state<string | null>(null);

	const laneCounts = $derived({
		assigned_collab: laneTasks.assigned_collab.length,
		assigned_other: laneTasks.assigned_other.length,
		other: laneTasks.other.length
	});

	const totalRemaining = $derived(
		laneCounts.assigned_collab + laneCounts.assigned_other + laneCounts.other
	);
	const resolvedCount = $derived(Math.max(0, initialCount - totalRemaining));
	const activeTasks = $derived(laneTasks[activeLane] ?? []);
	const currentTask = $derived(activeTasks[laneIndex[activeLane]] ?? null);
	const currentTaskAssigneeLabel = $derived(currentTask ? formatAssignee(currentTask) : null);

	function isOverdue(task: Pick<OverdueTask, 'state_key' | 'due_at'>): boolean {
		if (!task.due_at) return false;
		if (task.state_key === 'done') return false;
		const dueMs = Date.parse(task.due_at);
		if (Number.isNaN(dueMs)) return false;
		return dueMs < Date.now();
	}

	function safeTimeMs(value: string | null): number {
		if (!value) return 0;
		const parsed = Date.parse(value);
		return Number.isNaN(parsed) ? 0 : parsed;
	}

	function priorityValue(value: number | null): number {
		return typeof value === 'number' && Number.isFinite(value)
			? value
			: Number.MAX_SAFE_INTEGER;
	}

	function sortLane(key: LaneKey) {
		laneTasks[key] = [...laneTasks[key]].sort((a, b) => {
			const dueDelta = safeTimeMs(a.due_at) - safeTimeMs(b.due_at);
			if (dueDelta !== 0) return dueDelta;

			const priorityDelta = priorityValue(a.priority) - priorityValue(b.priority);
			if (priorityDelta !== 0) return priorityDelta;

			return safeTimeMs(a.updated_at) - safeTimeMs(b.updated_at);
		});
	}

	function clampLaneIndex(key: LaneKey) {
		const maxIndex = Math.max(0, laneTasks[key].length - 1);
		const index = laneIndex[key];
		if (index > maxIndex) {
			laneIndex = { ...laneIndex, [key]: maxIndex };
		}
	}

	function ensureActiveLaneHasTasks() {
		if (laneTasks[activeLane].length > 0) {
			clampLaneIndex(activeLane);
			return;
		}
		const nextLane = LANE_ORDER.find((lane) => laneTasks[lane].length > 0) ?? activeLane;
		activeLane = nextLane;
		clampLaneIndex(activeLane);
	}

	function setLaneTasksFromList(tasks: OverdueTask[]) {
		laneTasks = {
			assigned_collab: tasks.filter((task) => task.lane === 'assigned_collab'),
			assigned_other: tasks.filter((task) => task.lane === 'assigned_other'),
			other: tasks.filter((task) => task.lane === 'other')
		};
		sortLane('assigned_collab');
		sortLane('assigned_other');
		sortLane('other');
		laneIndex = { assigned_collab: 0, assigned_other: 0, other: 0 };
		activeLane = LANE_ORDER.find((lane) => laneTasks[lane].length > 0) ?? 'assigned_collab';
	}

	function getTaskById(
		taskId: string
	): { lane: LaneKey; index: number; task: OverdueTask } | null {
		for (const lane of LANE_ORDER) {
			const index = laneTasks[lane].findIndex((task) => task.id === taskId);
			if (index >= 0) {
				const task = laneTasks[lane][index];
				if (!task) return null;
				return { lane, index, task };
			}
		}
		return null;
	}

	function removeTask(taskId: string) {
		for (const lane of LANE_ORDER) {
			const next = laneTasks[lane].filter((task) => task.id !== taskId);
			if (next.length !== laneTasks[lane].length) {
				laneTasks[lane] = next;
				clampLaneIndex(lane);
			}
		}
		ensureActiveLaneHasTasks();
	}

	function replaceTask(taskId: string, nextTask: OverdueTask) {
		const found = getTaskById(taskId);
		if (!found) return;
		const { lane, index } = found;
		const nextLaneTasks = [...laneTasks[lane]];
		nextLaneTasks[index] = nextTask;
		laneTasks[lane] = nextLaneTasks;
		sortLane(lane);
		clampLaneIndex(lane);
	}

	function advanceInLane(lane: LaneKey) {
		const length = laneTasks[lane].length;
		if (length <= 1) {
			laneIndex = { ...laneIndex, [lane]: 0 };
			return;
		}
		const current = laneIndex[lane];
		laneIndex = { ...laneIndex, [lane]: (current + 1) % length };
	}

	function toIsoEndOfDay(date: Date): string {
		const local = new Date(date);
		local.setHours(23, 59, 0, 0);
		return local.toISOString();
	}

	function presetDueAt(preset: 'today' | 'tomorrow' | 'plus3' | 'nextWeek'): string {
		const base = new Date();
		if (preset === 'tomorrow') base.setDate(base.getDate() + 1);
		if (preset === 'plus3') base.setDate(base.getDate() + 3);
		if (preset === 'nextWeek') base.setDate(base.getDate() + 7);
		return toIsoEndOfDay(base);
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

	function formatAssignee(task: OverdueTask): string | null {
		const first = task.assignees?.[0];
		if (!first) return null;
		const name = first.name?.trim();
		if (name) return name;
		const email = first.email?.trim();
		if (!email) return null;
		return email.split('@')[0] ?? email;
	}

	async function loadOverdueTasks() {
		isLoading = true;
		error = null;
		try {
			const response = await fetch('/api/onto/tasks/overdue?limit=200');
			const payload = (await response.json()) as {
				success?: boolean;
				error?: string;
				data?: OverduePayload;
			};

			if (!response.ok || !payload.success) {
				throw new Error(payload.error || 'Failed to load overdue tasks');
			}

			const tasks = payload.data?.tasks ?? [];
			setLaneTasksFromList(tasks);
			initialCount = tasks.length;
			changedCount = 0;
			bulkScope = 'current_lane';
			activeReschedulePreset = null;
			loadingReschedulePreset = null;
			reschedulePlans = {};
			rescheduleError = null;
			rescheduleTaskId = null;
		} catch (err) {
			console.error('[Overdue Triage] Failed to load tasks:', err);
			error = err instanceof Error ? err.message : 'Failed to load overdue tasks';
		} finally {
			isLoading = false;
		}
	}

	$effect(() => {
		if (!browser) return;

		if (isOpen && !wasOpen) {
			wasOpen = true;
			void loadOverdueTasks();
			return;
		}

		if (!isOpen && wasOpen) {
			wasOpen = false;
			pendingTaskIds = new Set<string>();
			activeReschedulePreset = null;
			loadingReschedulePreset = null;
			reschedulePlans = {};
			rescheduleError = null;
			rescheduleTaskId = null;
		}
	});

	$effect(() => {
		const nextTaskId = currentTask?.id ?? null;
		if (nextTaskId === rescheduleTaskId) return;
		rescheduleTaskId = nextTaskId;
		activeReschedulePreset = null;
		loadingReschedulePreset = null;
		reschedulePlans = {};
		rescheduleError = null;
	});

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
			data?: { task?: OverdueTask };
		} | null;

		if (!response.ok) {
			throw new Error(payload?.error || 'Failed to update task');
		}

		return payload?.data?.task ?? null;
	}

	async function mutateTask(
		taskId: string,
		updates: Record<string, unknown>,
		options: {
			advanceWhenStillOverdue?: boolean;
			silent?: boolean;
		} = {}
	): Promise<boolean> {
		const found = getTaskById(taskId);
		if (!found) return false;
		const { lane, task } = found;
		if (pendingTaskIds.has(taskId)) return false;

		pendingTaskIds = new Set([...pendingTaskIds, taskId]);
		try {
			const patched = await patchTask(taskId, updates);
			const merged = {
				...task,
				...(patched ?? {}),
				assignees: task.assignees,
				project_name: task.project_name,
				lane: task.lane
			} as OverdueTask;

			if (isOverdue(merged)) {
				replaceTask(taskId, merged);
				if (options.advanceWhenStillOverdue) {
					advanceInLane(lane);
				}
			} else {
				removeTask(taskId);
			}

			changedCount += 1;
			if (!options.silent) {
				toastService.success('Task updated');
			}
			return true;
		} catch (err) {
			console.error('[Overdue Triage] Failed to update task:', err);
			toastService.error(err instanceof Error ? err.message : 'Failed to update task');
			return false;
		} finally {
			const nextPending = new Set(pendingTaskIds);
			nextPending.delete(taskId);
			pendingTaskIds = nextPending;
		}
	}

	async function handleSetState(state: 'done' | 'in_progress' | 'blocked') {
		if (!currentTask) return;
		if (state === 'blocked') {
			// Blocked items should leave overdue triage but come back for review later.
			await mutateTask(
				currentTask.id,
				{
					state_key: 'blocked',
					due_at: presetDueAt(BLOCKED_REVISIT_PRESET)
				},
				{ advanceWhenStillOverdue: true }
			);
			return;
		}

		await mutateTask(currentTask.id, { state_key: state }, { advanceWhenStillOverdue: true });
	}

	function handleSkip() {
		if (!currentTask) return;
		const found = getTaskById(currentTask.id);
		if (!found) return;
		const { lane, index } = found;
		const laneCopy = [...laneTasks[lane]];
		const skipped = laneCopy.splice(index, 1)[0];
		if (!skipped) return;
		laneCopy.push(skipped);
		laneTasks[lane] = laneCopy;
		advanceInLane(lane);
	}

	async function fetchReschedulePlan(
		taskId: string,
		preset: ReschedulePreset
	): Promise<ReschedulePlan | null> {
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

	function storeReschedulePlan(
		taskId: string,
		preset: ReschedulePreset,
		plan: ReschedulePlan
	): ReschedulePlan | null {
		if (currentTask?.id !== taskId) return null;
		reschedulePlans = {
			...reschedulePlans,
			[preset]: plan
		};
		activeReschedulePreset = preset;
		return plan;
	}

	async function handleShowRescheduleOptions(preset: ReschedulePreset) {
		if (!currentTask) return;
		const taskId = currentTask.id;
		loadingReschedulePreset = preset;
		activeReschedulePreset = preset;
		rescheduleError = null;
		try {
			const plan = await fetchReschedulePlan(taskId, preset);
			if (!plan) return;
			storeReschedulePlan(taskId, preset, plan);
		} catch (err) {
			console.error('[Overdue Triage] Failed to load reschedule options:', err);
			if (currentTask?.id !== taskId) return;
			rescheduleError =
				err instanceof Error ? err.message : 'Failed to load reschedule options';
			reschedulePlans = {
				...reschedulePlans,
				[preset]: undefined
			};
			toastService.error(rescheduleError);
		} finally {
			if (currentTask?.id === taskId && loadingReschedulePreset === preset) {
				loadingReschedulePreset = null;
			}
		}
	}

	async function applyRescheduleSlot(slot: RescheduleSlot) {
		if (!currentTask) return;
		await mutateTask(
			currentTask.id,
			{
				start_at: slot.start_at,
				due_at: slot.due_at
			},
			{ advanceWhenStillOverdue: true }
		);
	}

	async function handleAutoReschedule(preset: ReschedulePreset) {
		if (!currentTask) return;
		const taskId = currentTask.id;
		loadingReschedulePreset = preset;
		activeReschedulePreset = preset;
		rescheduleError = null;
		try {
			const plan = await fetchReschedulePlan(taskId, preset);
			if (!plan) return;
			storeReschedulePlan(taskId, preset, plan);
			const firstSlot = plan.slots[0];
			if (!firstSlot) {
				const message = plan.note || 'No available slots found in this window';
				rescheduleError = message;
				toastService.error(message);
				return;
			}
			await applyRescheduleSlot(firstSlot);
		} catch (err) {
			console.error('[Overdue Triage] Failed to auto-schedule task:', err);
			if (currentTask?.id !== taskId) return;
			const message = err instanceof Error ? err.message : 'Failed to auto-schedule task';
			rescheduleError = message;
			toastService.error(message);
		} finally {
			if (currentTask?.id === taskId && loadingReschedulePreset === preset) {
				loadingReschedulePreset = null;
			}
		}
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

	function tasksForBulkScope(): OverdueTask[] {
		if (bulkScope === 'all_lanes') {
			return [...laneTasks.assigned_collab, ...laneTasks.assigned_other, ...laneTasks.other];
		}
		return [...laneTasks[activeLane]];
	}

	async function runBulkAction(action: 'tomorrow' | 'plus3' | 'in_progress' | 'done') {
		const tasks = tasksForBulkScope();
		if (tasks.length === 0) return;
		if (action === 'done' && browser) {
			const confirmed = window.confirm(
				`Mark ${tasks.length} overdue tasks as done? This updates task completion state.`
			);
			if (!confirmed) return;
		}

		isBulkRunning = true;
		let succeeded = 0;
		let failed = 0;

		try {
			for (const task of tasks) {
				const updates =
					action === 'tomorrow'
						? { due_at: presetDueAt('tomorrow') }
						: action === 'plus3'
							? { due_at: presetDueAt('plus3') }
							: action === 'in_progress'
								? { state_key: 'in_progress' }
								: { state_key: 'done' };

				const ok = await mutateTask(task.id, updates, { silent: true });
				if (ok) succeeded += 1;
				else failed += 1;
			}
		} finally {
			isBulkRunning = false;
		}

		if (succeeded > 0 && failed === 0) {
			toastService.success(`Updated ${succeeded} tasks`);
			return;
		}
		if (succeeded > 0 && failed > 0) {
			toastService.error(`Updated ${succeeded} tasks (${failed} failed)`);
			return;
		}
		toastService.error('No tasks were updated');
	}

	function closeModal() {
		onClose?.({
			hasChanges: changedCount > 0,
			changedCount
		});
	}

	function switchLane(lane: LaneKey) {
		activeLane = lane;
		clampLaneIndex(lane);
	}
</script>

<Modal {isOpen} onClose={closeModal} title="Overdue Task Triage" size="xl">
	<div class="p-3 space-y-3">
		<div class="flex flex-wrap items-center gap-2 text-xs">
			<span
				class="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1"
			>
				<TriangleAlert class="h-3 w-3 text-accent" />
				{totalRemaining} remaining
			</span>
			<span
				class="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1"
			>
				<CircleCheck class="h-3 w-3 text-success" />
				{resolvedCount} resolved
			</span>
		</div>

		{#if isLoading}
			<div
				class="rounded-lg border border-border bg-card p-4 text-center text-sm text-muted-foreground shadow-ink"
			>
				<LoaderCircle class="mx-auto mb-2 h-5 w-5 animate-spin" />
				Loading overdue tasks...
			</div>
		{:else if error}
			<div
				class="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2 tx tx-static tx-weak shadow-ink"
			>
				<p class="text-sm text-destructive">{error}</p>
				<Button variant="outline" size="sm" onclick={loadOverdueTasks}>Retry</Button>
			</div>
		{:else if totalRemaining === 0}
			<div
				class="rounded-lg border border-success/30 bg-success/5 p-4 text-center space-y-2 tx tx-bloom tx-weak shadow-ink"
			>
				<CircleCheck class="mx-auto h-6 w-6 text-success" />
				<p class="text-sm font-semibold text-foreground">You cleared your overdue queue</p>
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
			<div class="space-y-2">
				<div class="grid gap-2 sm:grid-cols-3">
					{#each LANE_ORDER as lane}
						<button
							type="button"
							onclick={() => switchLane(lane)}
							class="rounded-md border px-2.5 py-2 text-left transition-colors shadow-ink pressable {activeLane ===
							lane
								? 'border-accent/40 bg-accent/10 tx tx-pulse tx-weak'
								: 'border-border bg-card hover:bg-muted/40'}"
						>
							<p class="text-[11px] font-semibold text-foreground truncate">
								{laneLabels[lane]}
							</p>
							<p class="text-[11px] text-muted-foreground mt-0.5">
								{laneCounts[lane]} tasks
							</p>
						</button>
					{/each}
				</div>

				<div
					class="rounded-lg border border-border bg-card p-3 space-y-2 tx tx-pulse tx-weak shadow-ink"
				>
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="text-sm font-semibold text-foreground truncate">
								{currentTask?.title}
							</p>
							<p class="text-xs text-muted-foreground truncate mt-0.5">
								{currentTask?.project_name}
							</p>
						</div>
						<div class="flex items-center gap-1.5 shrink-0">
							{#if currentTask?.project_is_collaborative}
								<span
									class="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent"
								>
									<Users class="h-2.5 w-2.5" />
									Collaborative
								</span>
							{/if}
							{#if currentTask?.is_assigned_to_me}
								<span
									class="inline-flex items-center rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success"
								>
									Assigned to me
								</span>
							{/if}
						</div>
					</div>

					{#if currentTask}
						<div
							class="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"
						>
							<span class="inline-flex items-center gap-1">
								<CalendarDays class="h-3 w-3" />
								Due {formatDueDate(currentTask.due_at)}
							</span>
							<span class="text-border">&middot;</span>
							<span class="inline-flex items-center gap-1">
								<Clock3 class="h-3 w-3" />
								{overdueLabel(currentTask.due_at)}
							</span>
							<span class="text-border">&middot;</span>
							<span>{formatStateLabel(currentTask.state_key)}</span>
							{#if currentTask.priority !== null}
								<span class="text-border">&middot;</span>
								<span>P{currentTask.priority}</span>
							{/if}
							{#if currentTaskAssigneeLabel}
								<span class="text-border">&middot;</span>
								<span>@{currentTaskAssigneeLabel}</span>
							{/if}
						</div>

						<div class="grid gap-2 sm:grid-cols-3">
							<Button
								size="sm"
								variant="success"
								disabled={pendingTaskIds.has(currentTask.id)}
								onclick={() => handleSetState('done')}
							>
								Done
							</Button>
							<Button
								size="sm"
								variant="outline"
								disabled={pendingTaskIds.has(currentTask.id)}
								onclick={() => handleSetState('in_progress')}
							>
								In progress
							</Button>
							<Button
								size="sm"
								variant="outline"
								disabled={pendingTaskIds.has(currentTask.id)}
								onclick={() => handleSetState('blocked')}
							>
								Blocked + revisit
							</Button>
						</div>

						<div class="space-y-2">
							<p class="text-[11px] font-semibold text-muted-foreground">
								Reschedule
							</p>
							<div class="space-y-2">
								{#each RESCHEDULE_PRESETS as preset}
									{@const plan = reschedulePlans[preset]}
									<div
										class="rounded-md border border-border bg-background/60 p-2.5 space-y-2"
									>
										<div
											class="flex flex-wrap items-center justify-between gap-2"
										>
											<div class="min-w-0">
												<p class="text-xs font-medium text-foreground">
													{reschedulePresetLabels[preset]}
												</p>
												{#if activeReschedulePreset === preset && plan?.note}
													<p
														class="mt-0.5 text-[11px] text-muted-foreground"
													>
														{plan.note}
													</p>
												{/if}
											</div>
											<div class="flex flex-wrap items-center gap-2">
												<Button
													size="sm"
													variant="outline"
													disabled={pendingTaskIds.has(currentTask.id) ||
														loadingReschedulePreset === preset}
													onclick={() => handleAutoReschedule(preset)}
												>
													Auto schedule
												</Button>
												<Button
													size="sm"
													variant="ghost"
													disabled={pendingTaskIds.has(currentTask.id) ||
														loadingReschedulePreset === preset}
													onclick={() =>
														handleShowRescheduleOptions(preset)}
												>
													Show slots
												</Button>
											</div>
										</div>

										{#if loadingReschedulePreset === preset}
											<div
												class="flex items-center gap-2 text-[11px] text-muted-foreground"
											>
												<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
												Finding open time...
											</div>
										{:else if activeReschedulePreset === preset}
											{#if plan?.slots?.length}
												<div class="grid gap-2">
													{#each plan.slots as slot}
														<button
															type="button"
															class="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-left transition-colors shadow-ink hover:bg-muted/40"
															disabled={pendingTaskIds.has(
																currentTask.id
															)}
															onclick={() =>
																applyRescheduleSlot(slot)}
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
												<p class="text-[11px] text-muted-foreground">
													{rescheduleError ||
														plan?.note ||
														'No open time found in this window.'}
												</p>
											{/if}
										{/if}
									</div>
								{/each}
							</div>
						</div>

						<div class="flex flex-wrap items-center gap-2 pt-1">
							<Button size="sm" variant="ghost" onclick={handleSkip}>
								<SkipForward class="mr-1 h-3.5 w-3.5" />
								Skip
							</Button>
							<a
								href="/projects/{currentTask.project_id}/tasks/{currentTask.id}"
								class="text-xs font-medium text-accent hover:underline underline-offset-2"
							>
								Open full task &rarr;
							</a>
						</div>
					{/if}
				</div>

				<div
					class="rounded-lg border border-border bg-card p-3 space-y-2 tx tx-frame tx-weak shadow-ink"
				>
					<div class="flex items-center justify-between gap-2">
						<p class="text-xs font-semibold text-foreground">Bulk actions</p>
						<select
							bind:value={bulkScope}
							class="h-8 rounded-md border border-border bg-background px-2 text-xs shadow-ink-inner focus:border-accent focus:ring-1 focus:ring-ring"
						>
							<option value="current_lane">Current lane</option>
							<option value="all_lanes">All lanes</option>
						</select>
					</div>
					<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
						<Button
							size="sm"
							variant="outline"
							disabled={isBulkRunning}
							onclick={() => runBulkAction('tomorrow')}
						>
							All due tomorrow
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={isBulkRunning}
							onclick={() => runBulkAction('plus3')}
						>
							All due +3d
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={isBulkRunning}
							onclick={() => runBulkAction('in_progress')}
						>
							All in progress
						</Button>
						<Button
							size="sm"
							variant="danger"
							disabled={isBulkRunning}
							onclick={() => runBulkAction('done')}
						>
							Mark all done
						</Button>
					</div>
				</div>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<div class="flex items-center justify-end">
			<Button size="sm" variant="outline" onclick={closeModal}>Close</Button>
		</div>
	{/snippet}
</Modal>
