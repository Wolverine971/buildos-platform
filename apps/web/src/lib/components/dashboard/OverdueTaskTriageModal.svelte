<!-- apps/web/src/lib/components/dashboard/OverdueTaskTriageModal.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { fly, slide } from 'svelte/transition';
	import {
		ArrowRight,
		CalendarDays,
		CheckCircle2,
		ChevronsUpDown,
		CircleCheck,
		Clock3,
		ExternalLink,
		Inbox,
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
	type BatchRescheduleAssignment = RescheduleSlot & {
		task_id: string;
	};
	type BatchReschedulePlan = {
		preset: ReschedulePreset;
		timezone: string;
		window_start_at: string;
		window_end_at: string;
		target_window_end_at: string;
		note: string | null;
		assignments: BatchRescheduleAssignment[];
		unscheduled_task_ids: string[];
		overflow_count: number;
		scheduled_day_count: number;
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
	type ProjectReviewContext = {
		operation_id: string;
		origin: 'overdue_triage';
		operation_kind: 'single_backlog' | 'bulk_backlog';
		review_policy: 'debounced';
		entity_count: number;
	};
	type TaskMutationOptions = {
		silent?: boolean;
		successMessage?: string;
		projectReviewContext?: ProjectReviewContext | null;
	};
	type ProjectBatchAction = 'tomorrow' | 'plus3' | 'in_progress' | 'done' | 'backlog';
	type LocatedTask = {
		batch: OverdueProjectBatch;
		batchIndex: number;
		task: OverdueTask;
		taskIndex: number;
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
	const BACKLOG_TASK_UPDATES = {
		state_key: 'todo',
		start_at: null,
		due_at: null
	} satisfies Record<string, unknown>;

	let { isOpen, initialProjectId = null, onClose }: Props = $props();

	function getInitialProjectId(): string | null {
		return initialProjectId;
	}

	function createReviewOperationId(): string {
		if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
			return crypto.randomUUID();
		}
		return `overdue-triage-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	}

	function createBacklogReviewContext(taskCount: number): ProjectReviewContext {
		return {
			operation_id: createReviewOperationId(),
			origin: 'overdue_triage',
			operation_kind: taskCount > 1 ? 'bulk_backlog' : 'single_backlog',
			review_policy: 'debounced',
			entity_count: taskCount
		};
	}

	let isLoading = $state(false);
	let runningProjectAction = $state<ProjectBatchAction | null>(null);
	let error = $state<string | null>(null);
	let changedCount = $state(0);
	let initialTaskCount = $state(0);
	let wasOpen = $state(false);
	let activeProjectId = $state<string | null>(getInitialProjectId());
	let batches = $state<OverdueProjectBatch[]>([]);
	let completedBatches = $state<CompletedBatch[]>([]);
	let pendingTaskIds = $state(new Set<string>());
	let schedulingTaskIds = $state(new Set<string>());
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
	const isProjectActionRunning = $derived(runningProjectAction !== null);
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
		schedulingTaskIds = new Set<string>();
	}

	function isTaskBusy(taskId: string): boolean {
		return pendingTaskIds.has(taskId) || schedulingTaskIds.has(taskId);
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

	function unrecordCompletedBatch(projectId: string) {
		completedBatches = completedBatches.filter((item) => item.project_id !== projectId);
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

	function findTask(taskId: string): LocatedTask | null {
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

		if (expandedTaskId === taskId) expandedTaskId = null;
		if (slotTaskId === taskId) slotTaskId = null;
		if (slotTaskId === null) activeSlotPreset = null;

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

	function restoreTaskToBatches(task: OverdueTask) {
		unrecordCompletedBatch(task.project_id);

		const existingBatchIndex = batches.findIndex(
			(batch) => batch.project_id === task.project_id
		);
		if (existingBatchIndex >= 0) {
			const existingBatch = batches[existingBatchIndex];
			if (!existingBatch) return;
			const existingTasks = ((existingBatch.tasks ?? []) as OverdueTask[]).filter(
				(item) => item.id !== task.id
			);
			const nextBatch = recomputeBatch([...existingTasks, task]);
			if (!nextBatch) return;
			const nextBatches = [...batches];
			nextBatches[existingBatchIndex] = nextBatch;
			setBatches(nextBatches, task.project_id);
			return;
		}

		const restoredBatch = recomputeBatch([task]);
		if (!restoredBatch) return;
		setBatches([...batches, restoredBatch], task.project_id);
	}

	async function patchTask(
		taskId: string,
		updates: Record<string, unknown>,
		options: Pick<TaskMutationOptions, 'projectReviewContext'> = {}
	) {
		const body = options.projectReviewContext
			? { ...updates, project_review_context: options.projectReviewContext }
			: updates;
		const response = await fetch(`/api/onto/tasks/${taskId}`, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
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

	async function mutateFoundTask(
		found: LocatedTask,
		updates: Record<string, unknown>,
		options: TaskMutationOptions = {}
	): Promise<boolean> {
		const taskId = found.task.id;
		if (pendingTaskIds.has(taskId)) return false;

		pendingTaskIds = new Set([...pendingTaskIds, taskId]);
		removeTaskFromBatches(taskId);
		try {
			await patchTask(taskId, updates, {
				projectReviewContext: options.projectReviewContext
			});

			changedCount += 1;
			if (!options.silent) {
				toastService.success(options.successMessage ?? 'Task updated');
			}
			return true;
		} catch (err) {
			console.error('[Overdue Project Batch Triage] Failed to update task:', err);
			restoreTaskToBatches(found.task);
			toastService.error(err instanceof Error ? err.message : 'Failed to update task');
			return false;
		} finally {
			const nextPending = new Set(pendingTaskIds);
			nextPending.delete(taskId);
			pendingTaskIds = nextPending;
		}
	}

	async function mutateTask(
		taskId: string,
		updates: Record<string, unknown>,
		options: TaskMutationOptions = {}
	): Promise<boolean> {
		const found = findTask(taskId);
		if (!found) return false;
		return mutateFoundTask(found, updates, options);
	}

	async function handleSetTaskState(taskId: string, state: 'done' | 'in_progress' | 'blocked') {
		if (isProjectActionRunning || isTaskBusy(taskId)) return;

		if (state === 'blocked') {
			await mutateTask(taskId, {
				state_key: 'blocked',
				due_at: presetDueAt(BLOCKED_REVISIT_PRESET)
			});
			return;
		}

		if (state === 'in_progress') {
			await smartScheduleTask(taskId, 'today', { state_key: 'in_progress' }, 'Task started');
			return;
		}

		await mutateTask(taskId, { state_key: state });
	}

	async function handleQuickReschedule(taskId: string, preset: 'tomorrow' | 'plus3') {
		await smartScheduleTask(taskId, preset, {}, 'Task scheduled');
	}

	async function handleMoveTaskToBacklog(taskId: string) {
		if (isProjectActionRunning || isTaskBusy(taskId)) return;
		await mutateTask(taskId, BACKLOG_TASK_UPDATES, {
			successMessage: 'Task moved to backlog',
			projectReviewContext: createBacklogReviewContext(1)
		});
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

	async function fetchBatchReschedulePlan(
		taskIds: string[],
		preset: ReschedulePreset
	): Promise<BatchReschedulePlan> {
		const response = await fetch('/api/onto/tasks/batch-reschedule-options', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				task_ids: taskIds,
				preset
			})
		});

		const payload = (await response.json().catch(() => null)) as {
			success?: boolean;
			error?: string;
			data?: BatchReschedulePlan;
		} | null;

		if (!response.ok || !payload?.success || !payload.data) {
			throw new Error(payload?.error || 'Failed to plan task schedule');
		}

		return payload.data;
	}

	async function smartScheduleTask(
		taskId: string,
		preset: ReschedulePreset,
		additionalUpdates: Record<string, unknown> = {},
		successMessage = 'Task scheduled'
	): Promise<boolean> {
		const found = findTask(taskId);
		if (!found || isTaskBusy(taskId) || isProjectActionRunning) return false;

		schedulingTaskIds = new Set([...schedulingTaskIds, taskId]);
		try {
			const plan = await fetchBatchReschedulePlan([taskId], preset);
			const assignment = plan.assignments.find((item) => item.task_id === taskId);
			if (!assignment) {
				throw new Error(plan.note || 'No open working time was found for this task');
			}
			const resolvedSuccessMessage =
				plan.overflow_count > 0
					? `${successMessage} in a later working day because the selected window was full`
					: successMessage;

			return await mutateFoundTask(
				found,
				{
					...additionalUpdates,
					start_at: assignment.start_at,
					due_at: assignment.due_at
				},
				{ successMessage: resolvedSuccessMessage }
			);
		} catch (err) {
			console.error('[Overdue Project Batch Triage] Failed to schedule task:', err);
			toastService.error(err instanceof Error ? err.message : 'Failed to schedule task');
			return false;
		} finally {
			const nextScheduling = new Set(schedulingTaskIds);
			nextScheduling.delete(taskId);
			schedulingTaskIds = nextScheduling;
		}
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
		if (isProjectActionRunning || isTaskBusy(taskId)) return;
		await mutateTask(taskId, {
			start_at: slot.start_at,
			due_at: slot.due_at
		});
	}

	function isSchedulingProjectAction(
		action: ProjectBatchAction
	): action is 'tomorrow' | 'plus3' | 'in_progress' {
		return action === 'tomorrow' || action === 'plus3' || action === 'in_progress';
	}

	function projectActionPreset(action: 'tomorrow' | 'plus3' | 'in_progress'): ReschedulePreset {
		return action === 'in_progress' ? 'today' : action;
	}

	function getProjectActionUpdates(action: 'done' | 'backlog'): Record<string, unknown> {
		return action === 'backlog' ? BACKLOG_TASK_UPDATES : { state_key: 'done' };
	}

	function formatProjectActionResult(action: ProjectBatchAction, succeeded: number, failed = 0) {
		const suffix = failed > 0 ? ` (${failed} failed)` : '';
		if (action === 'backlog') return `Moved ${succeeded} tasks to backlog${suffix}`;
		return `Updated ${succeeded} tasks${suffix}`;
	}

	function formatProjectScheduleResult(
		action: 'tomorrow' | 'plus3' | 'in_progress',
		succeeded: number,
		failed: number,
		plan: BatchReschedulePlan
	): string {
		const verb = action === 'in_progress' ? 'Started and scheduled' : 'Scheduled';
		const taskLabel = succeeded === 1 ? 'task' : 'tasks';
		const daySummary =
			plan.scheduled_day_count > 1
				? ` across ${plan.scheduled_day_count} working days`
				: ' in open calendar time';
		const overflowSummary =
			plan.overflow_count > 0
				? `; ${plan.overflow_count} carried into later working days`
				: '';
		const failedSummary = failed > 0 ? ` (${failed} not scheduled)` : '';
		return `${verb} ${succeeded} ${taskLabel}${daySummary}${overflowSummary}${failedSummary}`;
	}

	async function runProjectAction(action: ProjectBatchAction) {
		if (!activeBatch) return;
		const projectName = activeBatch.project_name;
		const locatedTasks = ((activeBatch.tasks ?? []) as OverdueTask[])
			.map((task) => findTask(task.id))
			.filter((task): task is LocatedTask => Boolean(task));
		if (locatedTasks.length === 0) return;

		if (action === 'done' && browser) {
			const confirmed = window.confirm(
				`Mark ${locatedTasks.length} overdue tasks as done in ${projectName}?`
			);
			if (!confirmed) return;
		}

		if (action === 'backlog' && browser) {
			const confirmed = window.confirm(
				`Move ${locatedTasks.length} overdue tasks to the backlog in ${projectName}? This will clear their start and due dates.`
			);
			if (!confirmed) return;
		}

		runningProjectAction = action;
		projectMenuOpen = false;
		let succeeded = 0;
		let failed = 0;
		let schedulePlan: BatchReschedulePlan | null = null;

		try {
			let results: boolean[];
			if (isSchedulingProjectAction(action)) {
				schedulePlan = await fetchBatchReschedulePlan(
					locatedTasks.map((task) => task.task.id),
					projectActionPreset(action)
				);
				const assignments = new Map(
					schedulePlan.assignments.map((assignment) => [assignment.task_id, assignment])
				);
				const schedulableTasks = locatedTasks.filter((task) =>
					assignments.has(task.task.id)
				);
				failed += locatedTasks.length - schedulableTasks.length;
				if (schedulableTasks.length === 0) {
					throw new Error(
						schedulePlan.note || 'No open working time was found for these tasks'
					);
				}

				results = await Promise.all(
					schedulableTasks.map((task) => {
						const assignment = assignments.get(task.task.id)!;
						return mutateFoundTask(
							task,
							{
								...(action === 'in_progress' ? { state_key: 'in_progress' } : {}),
								start_at: assignment.start_at,
								due_at: assignment.due_at
							},
							{ silent: true }
						);
					})
				);
			} else {
				const updates = getProjectActionUpdates(action);
				const projectReviewContext =
					action === 'backlog' ? createBacklogReviewContext(locatedTasks.length) : null;
				results = await Promise.all(
					locatedTasks.map((task) =>
						mutateFoundTask(task, updates, { silent: true, projectReviewContext })
					)
				);
			}
			for (const ok of results) {
				if (ok) succeeded += 1;
				else failed += 1;
			}
		} catch (err) {
			console.error('[Overdue Project Batch Triage] Project action failed:', err);
			toastService.error(err instanceof Error ? err.message : 'Project action failed');
			return;
		} finally {
			runningProjectAction = null;
		}

		if (schedulePlan && isSchedulingProjectAction(action)) {
			const message = formatProjectScheduleResult(action, succeeded, failed, schedulePlan);
			if (succeeded > 0 && failed === 0) {
				toastService.success(`${message} in ${projectName}`);
			} else {
				toastService.error(message);
			}
			return;
		}

		if (succeeded > 0 && failed === 0) {
			toastService.success(
				`${formatProjectActionResult(action, succeeded)} in ${projectName}`
			);
			return;
		}
		if (succeeded > 0 && failed > 0) {
			toastService.error(formatProjectActionResult(action, succeeded, failed));
			return;
		}
		toastService.error(action === 'backlog' ? 'No tasks were moved' : 'No tasks were updated');
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
	<div class="space-y-3 p-2 sm:p-3">
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
			<div class="grid min-h-0 gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
				<div class="space-y-3 lg:max-h-[calc(85dvh-7rem)] lg:overflow-y-auto lg:pr-1">
					<div class="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
						{#each batches as batch (batch.project_id)}
							<button
								type="button"
								onclick={() => setActiveProject(batch.project_id)}
								animate:flip={{ duration: 180 }}
								out:fly={{ x: -48, duration: 160, easing: cubicOut }}
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
					<div
						class="flex max-h-[calc(100dvh-9rem)] min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-ink sm:max-h-[calc(85dvh-7rem)]"
					>
						<div class="shrink-0 space-y-3 border-b border-border px-3 py-3">
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

							<div
								class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center"
							>
								<Button
									size="sm"
									variant="outline"
									class="w-full justify-center sm:w-auto"
									disabled={isProjectActionRunning}
									onclick={() => runProjectAction('tomorrow')}
								>
									{#if runningProjectAction === 'tomorrow'}
										<LoaderCircle
											class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
										/>
										Scheduling...
									{:else}
										Schedule from tomorrow
									{/if}
								</Button>
								<Button
									size="sm"
									variant="outline"
									class="w-full justify-center sm:w-auto"
									disabled={isProjectActionRunning}
									onclick={() => runProjectAction('plus3')}
								>
									{#if runningProjectAction === 'plus3'}
										<LoaderCircle
											class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
										/>
										Scheduling...
									{:else}
										Schedule from +3d
									{/if}
								</Button>
								<Button
									size="sm"
									variant="outline"
									class="col-span-2 w-full justify-center sm:col-span-1 sm:w-auto"
									disabled={isProjectActionRunning}
									onclick={() => runProjectAction('in_progress')}
								>
									{#if runningProjectAction === 'in_progress'}
										<LoaderCircle
											class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
										/>
										Scheduling...
									{:else}
										Start & schedule all
									{/if}
								</Button>
								<div class="relative" bind:this={projectMenuRef}>
									<button
										type="button"
										class="inline-flex min-h-[44px] w-full items-center justify-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground shadow-ink transition-colors hover:bg-muted sm:w-auto"
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
											<button
												type="button"
												class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
												role="menuitem"
												onclick={() => runProjectAction('backlog')}
											>
												<Inbox class="h-4 w-4 text-muted-foreground" />
												Move all to backlog
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
							<p class="text-2xs text-muted-foreground">
								Tasks use separate open slots; overflow moves to later working days.
							</p>
						</div>

						<div
							class="min-h-0 flex-1 divide-y divide-border overflow-y-auto overscroll-contain"
						>
							{#each activeTasks as task (task.id)}
								<div
									class="px-3 py-3"
									animate:flip={{ duration: 180 }}
									out:fly={{ x: '100%', duration: 180, easing: cubicOut }}
								>
									<div
										class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
									>
										<div class="min-w-0 flex-1">
											<div class="flex flex-wrap items-center gap-2">
												<a
													href="/projects/{task.project_id}/tasks/{task.id}"
													target="_blank"
													rel="noopener noreferrer"
													class="text-sm font-semibold text-foreground break-words hover:text-accent hover:underline underline-offset-2"
												>
													{task.title}
												</a>
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

										<div
											class="grid grid-cols-4 gap-1.5 sm:flex sm:shrink-0 sm:flex-wrap sm:items-center sm:gap-2"
										>
											<button
												type="button"
												class="min-h-9 rounded-md border border-success/30 bg-success/10 px-2 py-1.5 text-[11px] font-semibold text-success transition-colors hover:bg-success/15 disabled:opacity-50"
												disabled={isProjectActionRunning ||
													isTaskBusy(task.id)}
												onclick={() => handleSetTaskState(task.id, 'done')}
											>
												Done
											</button>
											<button
												type="button"
												class="min-h-9 rounded-md border border-border bg-card px-2 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
												disabled={isProjectActionRunning ||
													isTaskBusy(task.id)}
												onclick={() =>
													handleQuickReschedule(task.id, 'tomorrow')}
											>
												Tomorrow
											</button>
											<button
												type="button"
												class="min-h-9 rounded-md border border-border bg-card px-2 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
												disabled={isProjectActionRunning ||
													isTaskBusy(task.id)}
												onclick={() =>
													handleQuickReschedule(task.id, 'plus3')}
											>
												+3d
											</button>
											<button
												type="button"
												class="min-h-9 rounded-md border border-border bg-card px-2 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted"
												disabled={isProjectActionRunning ||
													isTaskBusy(task.id)}
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
											transition:slide={{ duration: 140 }}
										>
											<div class="flex flex-wrap items-center gap-2">
												<Button
													size="sm"
													variant="outline"
													disabled={isProjectActionRunning ||
														isTaskBusy(task.id)}
													onclick={() =>
														handleSetTaskState(task.id, 'in_progress')}
												>
													In progress
												</Button>
												<Button
													size="sm"
													variant="outline"
													disabled={isProjectActionRunning ||
														isTaskBusy(task.id)}
													onclick={() =>
														handleSetTaskState(task.id, 'blocked')}
												>
													Blocked + revisit
												</Button>
												<Button
													size="sm"
													variant="ghost"
													disabled={isProjectActionRunning ||
														isTaskBusy(task.id)}
													onclick={() => toggleSlotFinder(task.id)}
												>
													Find slot
												</Button>
												<Button
													size="sm"
													variant="outline"
													icon={Inbox}
													disabled={isProjectActionRunning ||
														isTaskBusy(task.id)}
													onclick={() => handleMoveTaskToBacklog(task.id)}
												>
													Move to backlog
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
																		disabled={isProjectActionRunning ||
																			isTaskBusy(task.id)}
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
