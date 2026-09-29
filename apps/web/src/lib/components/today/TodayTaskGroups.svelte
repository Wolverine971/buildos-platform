<!-- apps/web/src/lib/components/today/TodayTaskGroups.svelte -->
<script lang="ts">
	import { FolderKanban } from '$lib/icons/lucide';
	import type { TodayTask, TodayTaskBucket } from '$lib/types/today';
	import TodayAgendaRow from './TodayAgendaRow.svelte';

	let {
		tasks,
		doneIds,
		onOpenTask,
		onToggleDone,
		onChat
	}: {
		tasks: TodayTask[];
		doneIds: Set<string>;
		onOpenTask: (task: TodayTask) => void;
		onToggleDone: (task: TodayTask) => void;
		onChat: (task: TodayTask) => void;
	} = $props();

	const buckets: { key: TodayTaskBucket; label: string }[] = [
		{ key: 'due_today', label: 'Due today' },
		{ key: 'starts_today', label: 'Starting today' },
		{ key: 'in_progress', label: 'In progress' }
	];

	const groups = $derived.by(() => {
		// Preserve urgency before grouping by project. IDs keep equally named projects
		// separate; insertion order preserves the agenda's ordering within each group.
		const byBucket = new Map(
			buckets.map((bucket) => [bucket.key, new Map<string, TodayTask[]>()])
		);
		for (const task of tasks) {
			const projects = byBucket.get(task.bucket)!;
			const projectTasks = projects.get(task.project_id);
			if (projectTasks) projectTasks.push(task);
			else projects.set(task.project_id, [task]);
		}
		return buckets
			.map((bucket) => ({
				...bucket,
				projects: Array.from(byBucket.get(bucket.key)!, ([id, items]) => ({
					id,
					name: items[0]!.project_name,
					tasks: items
				}))
			}))
			.filter((bucket) => bucket.projects.length > 0);
	});
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
										stateKey={task.state_key}
										showProgressState={bucket.key !== 'in_progress'}
										done={doneIds.has(task.id)}
										onChat={() => onChat(task)}
										onOpenTask={() => onOpenTask(task)}
										onToggleDone={() => onToggleDone(task)}
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
