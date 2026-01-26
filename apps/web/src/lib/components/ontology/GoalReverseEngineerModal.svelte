<!-- apps/web/src/lib/components/ontology/GoalReverseEngineerModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import { Calendar, ChevronDown, ChevronRight, Layers, Target } from 'lucide-svelte';
	import type {
		GoalReverseEngineeringResult,
		ReverseEngineeredMilestoneSpec,
		ReverseEngineeredTaskSpec
	} from '$lib/services/ontology/goal-reverse-engineering.service';

	type EditableTask = ReverseEngineeredTaskSpec & {
		tempId: string;
		state_key: string;
		priority?: number | null;
		description?: string | null;
	};

	type EditableMilestone = ReverseEngineeredMilestoneSpec & {
		tempId: string;
		due_at: string | null;
		summary?: string | null;
		target_window_days?: number | null;
		tasks: EditableTask[];
	};

	type ApprovePayload = {
		milestones: Array<{
			title: string;
			due_at: string | null;
			summary: string | null;
			type_key?: string | null;
			confidence?: number | null;
			tasks: Array<{
				title: string;
				description: string | null;
				state_key: string;
				priority: number | null;
			}>;
		}>;
	};

	interface Props {
		open?: boolean;
		goalName?: string;
		preview: GoalReverseEngineeringResult | null;
		loading?: boolean;
		onApprove?: (payload: ApprovePayload) => void;
		onCancel?: () => void;
	}

	const TASK_STATES = ['todo', 'in_progress', 'done', 'blocked'];

	function generateId() {
		return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 11);
	}

	let {
		open = $bindable(false),
		goalName = '',
		preview = null,
		loading = false,
		onApprove,
		onCancel
	}: Props = $props();

	let editableMilestones = $state<EditableMilestone[]>([]);
	let reasoning = $state('');
	let errorMessage = $state<string | null>(null);
	let expandedMilestones = $state<Record<string, boolean>>({});
	let expandedTasks = $state<Record<string, boolean>>({});

	$effect(() => {
		if (!preview) {
			editableMilestones = [];
			reasoning = '';
			expandedMilestones = {};
			expandedTasks = {};
			return;
		}

		reasoning = preview.reasoning ?? '';
		const initialMilestones: EditableMilestone[] = [];
		const milestoneExpansion: Record<string, boolean> = {};

		preview.milestones.forEach((milestone, index) => {
			const milestoneTempId = generateId();
			initialMilestones.push({
				tempId: milestoneTempId,
				title: milestone.title,
				summary: milestone.summary ?? '',
				type_key: milestone.type_key,
				confidence: milestone.confidence,
				due_at: milestone.due_date ?? null,
				target_window_days: milestone.target_window_days,
				tasks: (milestone.tasks ?? []).map((task) => ({
					tempId: generateId(),
					title: task.title,
					description: task.description ?? '',
					type_key: task.type_key,
					state_key: task.state_key ?? 'todo',
					priority: task.priority ?? null,
					effort_days: task.effort_days
				})) as EditableTask[]
			});
			milestoneExpansion[milestoneTempId] = index === 0;
		});

		editableMilestones = initialMilestones;
		expandedMilestones = milestoneExpansion;
		expandedTasks = {};
		errorMessage = null;
	});

	function updateMilestoneField<K extends keyof EditableMilestone>(
		id: string,
		field: K,
		value: EditableMilestone[K]
	) {
		editableMilestones = editableMilestones.map((milestone) =>
			milestone.tempId === id ? { ...milestone, [field]: value } : milestone
		);
	}

	function updateTaskField<K extends keyof EditableTask>(
		milestoneId: string,
		taskId: string,
		field: K,
		value: EditableTask[K]
	) {
		editableMilestones = editableMilestones.map((milestone) => {
			if (milestone.tempId !== milestoneId) return milestone;
			const updatedTasks = milestone.tasks.map((task) =>
				task.tempId === taskId ? { ...task, [field]: value } : task
			);
			return { ...milestone, tasks: updatedTasks };
		});
	}

	function addMilestone() {
		const tempId = generateId();
		const newMilestone: EditableMilestone = {
			tempId,
			title: 'New milestone',
			summary: '',
			type_key: 'milestone.standard',
			confidence: null,
			due_at: null,
			target_window_days: null,
			tasks: []
		};

		editableMilestones = [...editableMilestones, newMilestone];
		expandedMilestones = { ...expandedMilestones, [tempId]: true };
	}

	function removeMilestone(id: string) {
		editableMilestones = editableMilestones.filter((milestone) => milestone.tempId !== id);
		clearMilestoneExpansion(id);
		clearTaskExpansion(id);
	}

	function addTask(milestoneId: string) {
		const taskId = generateId();
		editableMilestones = editableMilestones.map((milestone) => {
			if (milestone.tempId !== milestoneId) return milestone;
			return {
				...milestone,
				tasks: [
					...milestone.tasks,
					{
						tempId: taskId,
						title: 'New task',
						description: '',
						type_key: 'task.execute',
						state_key: 'todo',
						priority: 3
					}
				]
			};
		});
		expandedTasks = { ...expandedTasks, [`${milestoneId}:${taskId}`]: true };
	}

	function removeTask(milestoneId: string, taskId: string) {
		editableMilestones = editableMilestones.map((milestone) => {
			if (milestone.tempId !== milestoneId) return milestone;
			return {
				...milestone,
				tasks: milestone.tasks.filter((task) => task.tempId !== taskId)
			};
		});
		clearTaskExpansion(milestoneId, taskId);
	}

	function toggleMilestoneExpansion(id: string) {
		expandedMilestones = { ...expandedMilestones, [id]: !expandedMilestones[id] };
	}

	function isMilestoneExpanded(id: string) {
		return Boolean(expandedMilestones[id]);
	}

	function toggleTaskExpansion(milestoneId: string, taskId: string) {
		const key = `${milestoneId}:${taskId}`;
		expandedTasks = { ...expandedTasks, [key]: !expandedTasks[key] };
	}

	function isTaskExpanded(milestoneId: string, taskId: string) {
		return Boolean(expandedTasks[`${milestoneId}:${taskId}`]);
	}

	function clearMilestoneExpansion(id: string) {
		const { [id]: _removed, ...rest } = expandedMilestones;
		expandedMilestones = rest;
	}

	function clearTaskExpansion(milestoneId: string, taskId?: string) {
		const next = { ...expandedTasks };
		const prefix = `${milestoneId}:`;

		if (taskId) {
			delete next[`${milestoneId}:${taskId}`];
		} else {
			Object.keys(next).forEach((key) => {
				if (key.startsWith(prefix)) delete next[key];
			});
		}

		expandedTasks = next;
	}

	function getTotalTaskCount() {
		return editableMilestones.reduce((total, milestone) => total + milestone.tasks.length, 0);
	}

	function formatDateForDisplay(value: string | null) {
		if (!value) return 'No due date';
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return value;
		return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function handleClose() {
		onCancel?.();
		open = false;
	}

	function handleApprove() {
		const sanitized = editableMilestones
			.map((milestone) => {
				const sanitizedTasks = milestone.tasks
					.map((task) => ({
						title: task.title.trim(),
						description: (task.description ?? '').trim() || null,
						state_key: task.state_key || 'todo',
						priority:
							typeof task.priority === 'number' && Number.isFinite(task.priority)
								? task.priority
								: null
					}))
					.filter((task) => task.title.length > 0);

				return {
					title: milestone.title.trim() || 'Milestone',
					due_at: milestone.due_at ? milestone.due_at : null,
					summary: (milestone.summary ?? '').trim() || null,
					type_key: milestone.type_key ?? 'milestone.standard',
					confidence: milestone.confidence,
					tasks: sanitizedTasks
				};
			})
			.filter((milestone) => milestone.tasks.length > 0);

		if (!sanitized.length) {
			errorMessage = 'Add at least one task before approving.';
			return;
		}

		errorMessage = null;
		onApprove?.({ milestones: sanitized });
	}
</script>

<Modal bind:isOpen={open} size="xl" onClose={handleClose} showCloseButton={false}>
	{#snippet header()}
		<!-- Compact Inkprint header -->
		<div
			class="flex-shrink-0 bg-muted border-b border-border px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div
					class="flex h-9 w-9 items-center justify-center rounded bg-accent/10 text-accent shrink-0"
				>
					<Target class="w-5 h-5" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						{goalName || 'Reverse Engineer Goal'}
					</h2>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
						{editableMilestones.length} milestone{editableMilestones.length === 1
							? ''
							: 's'} · {getTotalTaskCount()} task{getTotalTaskCount() === 1
							? ''
							: 's'}
					</p>
				</div>
			</div>
			<Button
				variant="ghost"
				size="sm"
				onclick={handleClose}
				class="text-muted-foreground hover:text-foreground shrink-0 !p-1 sm:!p-1.5"
				disabled={loading}
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
	{/snippet}

	{#snippet children()}
		<div class="space-y-4 px-3 py-3 sm:px-6 sm:py-6">
			<section class="rounded border border-border bg-card shadow-ink">
				<div
					class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
				>
					<div class="space-y-1">
						<p
							class="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2"
						>
							<span class="w-1.5 h-1.5 bg-accent rounded-full"></span>
							Proposed milestones overview
						</p>
						<p class="text-xl sm:text-2xl font-semibold text-foreground">
							{editableMilestones.length} milestone{editableMilestones.length === 1
								? ''
								: 's'}{' '}
							· {getTotalTaskCount()} task{getTotalTaskCount() === 1 ? '' : 's'}
						</p>
						<p class="text-sm text-muted-foreground">
							Reverse engineered for <span class="font-medium">{goalName}</span>
						</p>
					</div>
					<div class="flex flex-wrap gap-2 shrink-0">
						<Button variant="secondary" size="sm" onclick={addMilestone}
							>+ Add Milestone</Button
						>
						<Button variant="ghost" size="sm" onclick={handleClose}>Close</Button>
					</div>
				</div>
				{#if reasoning}
					<div class="border-t border-border px-4 pb-4 sm:px-5">
						<div
							class="rounded border border-border bg-muted p-3.5 tx tx-bloom tx-weak text-sm text-foreground"
						>
							<p
								class="text-xs font-semibold uppercase tracking-wide text-accent flex items-center gap-2"
							>
								<span class="text-base">🧠</span>
								Model reasoning
							</p>
							<p class="mt-2 whitespace-pre-wrap leading-relaxed text-sm">
								{reasoning}
							</p>
						</div>
					</div>
				{/if}
			</section>

			<div class="space-y-3 overflow-y-auto pr-1 max-h-[65vh]">
				{#if editableMilestones.length === 0}
					<div
						class="rounded border border-dashed border-border bg-muted p-10 text-center text-sm text-muted-foreground"
					>
						No milestones yet. Use "Add milestone" to capture the model's proposal.
					</div>
				{:else}
					{#each editableMilestones as milestone, index (milestone.tempId)}
						<div
							class="rounded border border-border bg-card shadow-ink transition-shadow hover:shadow-ink-strong"
						>
							<button
								type="button"
								class="w-full rounded p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
								onclick={() => toggleMilestoneExpansion(milestone.tempId)}
							>
								<div
									class="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground"
								>
									<Layers
										class="h-4 w-4 text-muted-foreground"
										aria-hidden="true"
									/>
									<span>Milestone {index + 1}</span>
								</div>
								<p class="mt-2 text-lg font-semibold text-foreground">
									{milestone.title || 'Untitled milestone'}
								</p>
								<p class="mt-1 text-sm text-muted-foreground">
									{milestone.summary || 'Add a summary to clarify scope'}
								</p>
								<div
									class="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground"
								>
									<span class="inline-flex items-center gap-1">
										<Calendar
											class="h-3.5 w-3.5 text-muted-foreground"
											aria-hidden="true"
										/>
										{formatDateForDisplay(milestone.due_at)}
									</span>
									<span class="inline-flex items-center gap-1">
										<Target
											class="h-3.5 w-3.5 text-muted-foreground"
											aria-hidden="true"
										/>
										{milestone.tasks.length} task{milestone.tasks.length === 1
											? ''
											: 's'}
									</span>
									<span
										class="ml-auto inline-flex items-center gap-1 text-muted-foreground"
									>
										{isMilestoneExpanded(milestone.tempId) ? 'Hide' : 'Expand'}
										<ChevronDown
											class={`h-4 w-4 transition-transform duration-200 ${isMilestoneExpanded(milestone.tempId) ? 'rotate-180' : ''}`}
											aria-hidden="true"
										/>
									</span>
								</div>
							</button>

							{#if isMilestoneExpanded(milestone.tempId)}
								<div
									class="rounded-b border-t border-border bg-muted px-4 pb-5 pt-4 tx tx-grain tx-weak sm:px-6"
								>
									<div class="grid gap-3 md:grid-cols-3">
										<label
											class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
										>
											<span class="mb-1 block">Title</span>
											<input
												class="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:ring-2 focus:ring-ring"
												value={milestone.title}
												oninput={(event) =>
													updateMilestoneField(
														milestone.tempId,
														'title',
														event.currentTarget.value
													)}
											/>
										</label>
										<label
											class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
										>
											<span class="mb-1 block">Due date</span>
											<input
												type="date"
												class="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:ring-2 focus:ring-ring"
												value={milestone.due_at ?? ''}
												oninput={(event) =>
													updateMilestoneField(
														milestone.tempId,
														'due_at',
														event.currentTarget.value || null
													)}
											/>
										</label>
										<label
											class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
										>
											<span class="mb-1 block">Type key</span>
											<input
												class="w-full rounded border border-border bg-background px-3 py-2 text-sm font-mono text-foreground focus:border-ring focus:ring-2 focus:ring-ring"
												value={milestone.type_key ?? ''}
												oninput={(event) =>
													updateMilestoneField(
														milestone.tempId,
														'type_key',
														event.currentTarget.value || null
													)}
											/>
										</label>
									</div>
									<label
										class="mt-3 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
									>
										<span class="mb-1 block">Summary</span>
										<Textarea
											class="w-full"
											rows={3}
											value={milestone.summary ?? ''}
											oninput={(event) =>
												updateMilestoneField(
													milestone.tempId,
													'summary',
													event.currentTarget.value
												)}
										/>
									</label>

									<div
										class="mt-4 space-y-4 rounded border border-border bg-muted p-4"
									>
										<div
											class="flex flex-wrap items-center justify-between gap-3"
										>
											<div>
												<p class="text-sm font-semibold text-foreground">
													Tasks
												</p>
												<p class="text-xs text-muted-foreground">
													Expand a task row to edit details inline.
												</p>
											</div>
											<div class="flex flex-wrap gap-2">
												<Button
													variant="secondary"
													size="sm"
													onclick={() => addTask(milestone.tempId)}
												>
													Add task
												</Button>
												<Button
													variant="ghost"
													size="sm"
													onclick={() =>
														removeMilestone(milestone.tempId)}
												>
													Remove milestone
												</Button>
											</div>
										</div>

										<div class="rounded-xl border border-border bg-card">
											{#if milestone.tasks.length === 0}
												<div
													class="p-6 text-center text-sm text-muted-foreground"
												>
													No tasks yet. Use "Add task" to break down the
													milestone.
												</div>
											{:else}
												{#each milestone.tasks as task, taskIndex (task.tempId)}
													<div
														class="border-b border-border last:border-b-0"
													>
														<button
															type="button"
															class="w-full px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
															onclick={() =>
																toggleTaskExpansion(
																	milestone.tempId,
																	task.tempId
																)}
														>
															<div
																class="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground"
															>
																<span>Task {taskIndex + 1}</span>
																<span
																	class="h-1 w-1 rounded-full bg-muted-foreground/30"
																/>
																<span class="capitalize"
																	>{task.state_key?.replace(
																		'_',
																		' '
																	)}</span
																>
															</div>
															<p
																class="mt-1 text-sm font-semibold text-foreground"
															>
																{task.title || 'Untitled task'}
															</p>
															<p
																class="text-xs text-muted-foreground"
															>
																{task.description ||
																	'Add description or acceptance criteria'}
															</p>
															<div
																class="mt-2 flex items-center gap-3 text-xs text-muted-foreground"
															>
																<span
																	class="rounded-full bg-muted px-2 py-0.5 capitalize"
																>
																	{task.state_key?.replace(
																		'_',
																		' '
																	) || 'todo'}
																</span>
																<span
																	class="rounded-full bg-muted px-2 py-0.5"
																>
																	Priority {task.priority ?? '—'}
																</span>
																<ChevronRight
																	class={`ml-auto h-4 w-4 text-muted-foreground transition-transform duration-200 ${isTaskExpanded(milestone.tempId, task.tempId) ? 'rotate-90' : ''}`}
																	aria-hidden="true"
																/>
															</div>
														</button>

														{#if isTaskExpanded(milestone.tempId, task.tempId)}
															<div
																class="space-y-3 border-t border-border bg-muted px-4 py-4"
															>
																<div
																	class="grid gap-3 md:grid-cols-2"
																>
																	<label
																		class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
																	>
																		<span class="mb-1 block"
																			>Title</span
																		>
																		<input
																			class="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:ring-2 focus:ring-ring"
																			value={task.title}
																			oninput={(event) =>
																				updateTaskField(
																					milestone.tempId,
																					task.tempId,
																					'title',
																					event
																						.currentTarget
																						.value
																				)}
																		/>
																	</label>
																	<label
																		class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
																	>
																		<span class="mb-1 block"
																			>State</span
																		>
																		<select
																			class="w-full rounded border border-border bg-background px-3 py-2 text-sm capitalize text-foreground focus:border-ring focus:ring-2 focus:ring-ring"
																			value={task.state_key}
																			onchange={(event) =>
																				updateTaskField(
																					milestone.tempId,
																					task.tempId,
																					'state_key',
																					event
																						.currentTarget
																						.value
																				)}
																		>
																			{#each TASK_STATES as stateOption}
																				<option
																					value={stateOption}
																				>
																					{stateOption.replace(
																						'_',
																						' '
																					)}
																				</option>
																			{/each}
																		</select>
																	</label>
																	<label
																		class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
																	>
																		<span class="mb-1 block"
																			>Priority (1-5)</span
																		>
																		<input
																			type="number"
																			min="1"
																			max="5"
																			class="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:ring-2 focus:ring-ring"
																			value={task.priority ??
																				''}
																			oninput={(event) =>
																				updateTaskField(
																					milestone.tempId,
																					task.tempId,
																					'priority',
																					event
																						.currentTarget
																						.value
																						? Number(
																								event
																									.currentTarget
																									.value
																							)
																						: null
																				)}
																		/>
																	</label>
																</div>
																<label
																	class="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
																>
																	<span class="mb-1 block"
																		>Description</span
																	>
																	<Textarea
																		class="w-full"
																		rows={3}
																		value={task.description ??
																			''}
																		oninput={(event) =>
																			updateTaskField(
																				milestone.tempId,
																				task.tempId,
																				'description',
																				event.currentTarget
																					.value
																			)}
																	/>
																</label>
																<div class="flex justify-end">
																	<Button
																		variant="ghost"
																		size="sm"
																		onclick={() =>
																			removeTask(
																				milestone.tempId,
																				task.tempId
																			)}
																	>
																		Remove task
																	</Button>
																</div>
															</div>
														{/if}
													</div>
												{/each}
											{/if}
										</div>
									</div>
								</div>
							{/if}
						</div>
					{/each}
				{/if}
			</div>

			{#if errorMessage}
				<p class="text-sm text-destructive">{errorMessage}</p>
			{/if}
		</div>
	{/snippet}

	{#snippet footer()}
		<div
			class="flex flex-row items-center justify-end gap-2 sm:gap-4 p-2 sm:p-6 border-t border-border bg-muted tx tx-grain tx-weak"
		>
			<Button
				variant="ghost"
				size="sm"
				onclick={handleClose}
				disabled={loading}
				class="text-xs sm:text-sm px-2 sm:px-4"
			>
				Cancel
			</Button>
			<Button
				variant="primary"
				size="sm"
				onclick={handleApprove}
				{loading}
				class="text-xs sm:text-sm px-2 sm:px-4"
			>
				<span class="hidden sm:inline">Approve & Create</span>
				<span class="sm:hidden">Create</span>
			</Button>
		</div>
	{/snippet}
</Modal>
