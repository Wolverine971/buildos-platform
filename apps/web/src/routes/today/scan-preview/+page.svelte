<!-- apps/web/src/routes/today/scan-preview/+page.svelte -->
<script lang="ts">
	import TodayAgendaRow from '$lib/components/today/TodayAgendaRow.svelte';
	import TodayTaskGroups from '$lib/components/today/TodayTaskGroups.svelte';
	import WhatChangedSection from '$lib/components/today/WhatChangedSection.svelte';
	import type { TodayTask, WhatChangedFeed } from '$lib/types/today';

	// Synthetic data only. All interactions stay local; no chat or write APIs run.
	let doneIds = $state<Set<string>>(new Set());
	let narrow = $state(false);
	let feedback = $state('Try completing a task, opening its details, or chatting about it.');
	const tasks: TodayTask[] = [
		{
			id: 'one',
			project_id: 'launch',
			project_name: 'Website launch',
			title: 'Review the launch checklist',
			bucket: 'due_today',
			state_key: 'todo'
		},
		{
			id: 'two',
			project_id: 'book',
			project_name: 'Field notes',
			title: 'Send the chapter outline to the editor',
			bucket: 'due_today',
			state_key: 'blocked'
		},
		{
			id: 'three',
			project_id: 'launch',
			project_name: 'Website launch',
			title: 'Check the mobile navigation',
			bucket: 'due_today',
			state_key: 'in_progress'
		},
		{
			id: 'four',
			project_id: 'launch',
			project_name: 'Website launch',
			title: 'Draft the launch announcement',
			bucket: 'starts_today',
			state_key: 'todo'
		},
		{
			id: 'five',
			project_id: 'book',
			project_name: 'Field notes',
			title: 'Draft the opening chapter',
			bucket: 'in_progress',
			state_key: 'in_progress'
		},
		{
			id: 'six',
			project_id: 'launch',
			project_name: 'Website launch',
			title: 'Review the first-run experience with a very long task name that should stay readable on a small screen',
			bucket: 'in_progress',
			state_key: 'in_progress'
		},
		{
			id: 'seven',
			project_id: 'book',
			project_name: 'Field notes',
			title: 'Collect interview notes',
			bucket: 'in_progress',
			state_key: 'in_progress'
		}
	].map((task) => ({
		...task,
		description: null,
		due_at: null,
		start_at: null,
		priority: null,
		updated_at: '2026-09-29T12:00:00Z'
	})) as TodayTask[];
	const changes: WhatChangedFeed = {
		since: new Date(Date.now() - 86_400_000).toISOString(),
		totalLogCount: 2,
		truncated: false,
		entries: [
			{
				id: 'change-one',
				project_id: 'launch',
				project_name: 'Website launch',
				entity_type: 'task',
				entity_id: 'one',
				entity_name: 'Review the launch checklist',
				action: 'created',
				change_source: null,
				actor_kind: 'agent',
				actor_label: 'Agent chat',
				occurrences: 1,
				latest_at: new Date().toISOString()
			},
			{
				id: 'change-two',
				project_id: 'book',
				project_name: 'Field notes',
				entity_type: 'document',
				entity_id: 'outline',
				entity_name: 'Chapter outline',
				action: 'updated',
				change_source: null,
				actor_kind: 'you',
				actor_label: 'You',
				occurrences: 1,
				latest_at: new Date().toISOString()
			}
		]
	};
	function toggleDone(task: TodayTask) {
		const next = new Set(doneIds);
		if (next.has(task.id)) next.delete(task.id);
		else next.add(task.id);
		doneIds = next;
		feedback = `${task.title}: ${next.has(task.id) ? 'completed' : 'reopened'} in this preview.`;
	}
</script>

<svelte:head><title>Today design preview | BuildOS</title></svelte:head>

<div class="mx-auto max-w-3xl px-3 py-6 sm:px-5">
	<div class="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
		<div>
			<p class="micro-label text-muted-foreground">Design preview · sample data</p>
			<p class="mt-1 text-sm text-muted-foreground">
				Grouped work, shared edges, quieter defaults.
			</p>
		</div>
		<button
			onclick={() => (narrow = !narrow)}
			aria-pressed={narrow}
			class="min-h-11 rounded-md border border-border px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
			>{narrow ? 'Full width' : 'Narrow layout'}</button
		>
	</div>
	<p class="mb-4 text-xs text-muted-foreground" role="status">{feedback}</p>
	<!-- Link interception keeps fixture project IDs from navigating to real routes. -->
	<div
		class="mx-auto bg-background"
		style:max-width={narrow ? '360px' : '100%'}
		onclick={(event) => {
			const link = event.target instanceof Element ? event.target.closest('a') : null;
			if (link) {
				event.preventDefault();
				feedback = `Project link: ${link.getAttribute('href')}`;
			}
		}}
		role="presentation"
	>
		<header class="mb-5">
			<h1 class="text-2xl font-semibold tracking-tight">Today</h1>
			<p class="mt-1 text-xs text-muted-foreground">
				Tuesday, September 29 · 2 events · {tasks.length - doneIds.size} tasks
			</p>
		</header>
		<section aria-label="Today's schedule" class="mb-5">
			<h2 class="mb-2 text-sm font-semibold">Schedule</h2>
			<div class="border-y border-border/70">
				<TodayAgendaRow
					kind="event"
					title="Editorial review"
					timeLabel="9:00 AM"
					metaLabel="9:00 – 9:30 AM"
					past={true}
					onChat={() => (feedback = 'Chat about Editorial review')}
				/>
				<TodayAgendaRow
					kind="event"
					title="Launch walkthrough"
					timeLabel="2:00 PM"
					metaLabel="2:00 – 2:30 PM"
					current={true}
					projectName="Website launch"
					projectHref="/projects/launch"
					onChat={() => (feedback = 'Chat about Launch walkthrough')}
				/>
			</div>
		</section>
		<section aria-label="Tasks without a set time">
			<h2 class="mb-3 text-sm font-semibold">
				Anytime today <span class="stamp ml-2 text-xs font-normal text-muted-foreground"
					>{tasks.length}</span
				>
			</h2>
			<TodayTaskGroups
				{tasks}
				{doneIds}
				onToggleDone={toggleDone}
				onOpenTask={(task) => (feedback = `Open task details: ${task.title}`)}
				onChat={(task) => (feedback = `Chat about: ${task.title}`)}
			/>
		</section>
		<WhatChangedSection feed={changes} />
	</div>
</div>
