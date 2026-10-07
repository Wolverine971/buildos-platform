<!-- apps/web/src/lib/components/today/TodayTaskGroups.svelte -->
<script lang="ts">
	import { FolderKanban } from '$lib/icons/lucide';
	import type { TaskEntityRecord } from '@buildos/shared-agent-ops/task-entities';
	import type { TodayTask } from '$lib/types/today';
	import TodayAgendaRow from './TodayAgendaRow.svelte';
	import { groupTodayTasks } from './today-task-order';

	let {
		tasks,
		doneIds,
		selectedId = null,
		onOpenTask,
		onToggleDone,
		onChat,
		entitiesByTask = {}
	}: {
		tasks: TodayTask[];
		doneIds: Set<string>;
		/** The task open in the reader. */
		selectedId?: string | null;
		onOpenTask: (task: TodayTask) => void;
		onToggleDone: (task: TodayTask) => void;
		onChat: (task: TodayTask) => void;
		/** Stored entities per task id, loaded once for the page. */
		entitiesByTask?: Record<string, TaskEntityRecord[]>;
	} = $props();

	const groups = $derived(groupTodayTasks(tasks));
</script>

<div class="space-y-5">
	{#each groups as bucket (bucket.key)}
		<section aria-label={bucket.label}>
			<h3 class="micro-label border-b border-border/70 pb-2 text-muted-foreground">
				{bucket.label}
			</h3>
			<div class="space-y-2 pt-1">
				{#each bucket.projects as project (project.id)}
					<div>
						<div class="min-w-0 px-1 sm:px-2">
							<h4 class="min-w-0">
								<a
									href={`/projects/${project.id}`}
									class="inline-flex min-h-11 max-w-full items-center gap-2 rounded-md text-xs font-medium text-muted-foreground underline decoration-border-strong underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:fine)]:min-h-8"
									title={project.name}
								>
									<FolderKanban class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
									<span class="truncate">{project.name}</span>
								</a>
							</h4>
						</div>
						<ul>
							{#each project.tasks as task (task.id)}
								<li>
									<TodayAgendaRow
										kind="task"
										title={task.title}
										rowId={task.id}
										selected={task.id === selectedId}
										stateKey={task.state_key}
										showProgressState={bucket.key !== 'in_progress'}
										done={doneIds.has(task.id)}
										onChat={() => onChat(task)}
										onOpenTask={() => onOpenTask(task)}
										onToggleDone={() => onToggleDone(task)}
										entityTask={task}
										entities={entitiesByTask[task.id] ?? null}
									/>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		</section>
	{/each}
</div>
