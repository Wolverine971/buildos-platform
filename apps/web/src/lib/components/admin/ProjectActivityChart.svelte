<!-- apps/web/src/lib/components/admin/ProjectActivityChart.svelte -->
<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';

	let { projects = [] }: { projects?: any[] } = $props();

	let hoveredBar = $state<any>(null);

	let chartData = $derived(
		projects
			.filter((project) => project.name)
			.map((project) => {
				const completedTasks = project.completed_task_count || 0;
				const totalTasks = project.task_count || 0;
				const openTasks = Math.max(
					project.open_task_count ?? totalTasks - completedTasks,
					0
				);
				const chatSessions = project.chat_session_count || 0;

				return {
					name:
						project.name.length > 12
							? `${project.name.substring(0, 12)}...`
							: project.name,
					fullName: project.name,
					openTasks,
					completedTasks,
					chatSessions,
					status: project.status || 'unknown',
					totalSignal: openTasks + completedTasks + chatSessions
				};
			})
			.sort((a, b) => b.totalSignal - a.totalSignal)
			.slice(0, 8)
	);

	let maxValue = $derived(
		Math.max(
			...chartData.map((item) =>
				Math.max(item.openTasks, item.completedTasks, item.chatSessions)
			),
			1
		)
	);

	let barWidth = $derived(
		chartData.length ? Math.max(80, (400 - (chartData.length - 1) * 10) / chartData.length) : 80
	);
</script>

{#if chartData.length}
	<Card variant="default">
		<CardBody padding="md" class="w-full">
			<div class="flex flex-wrap justify-center gap-4 mb-4">
				<div class="flex items-center">
					<div class="w-4 h-4 bg-sky-500 rounded mr-2"></div>
					<span class="text-sm text-muted-foreground">Open Tasks</span>
				</div>
				<div class="flex items-center">
					<div class="w-4 h-4 bg-emerald-500 rounded mr-2"></div>
					<span class="text-sm text-muted-foreground">Done Tasks</span>
				</div>
				<div class="flex items-center">
					<div class="w-4 h-4 bg-amber-500 rounded mr-2"></div>
					<span class="text-sm text-muted-foreground">BuildOS Chats</span>
				</div>
			</div>

			<div class="relative">
				<svg class="w-full h-64" viewBox="0 0 500 250">
					{#each Array(6) as _, i}
						<line
							x1="50"
							y1={40 + i * 35}
							x2="450"
							y2={40 + i * 35}
							stroke="#e5e7eb"
							stroke-width="1"
							stroke-dasharray="2,2"
						/>
						<text
							x="45"
							y={45 + i * 35}
							text-anchor="end"
							font-size="10"
							fill="#6b7280"
						>
							{Math.round(((5 - i) * maxValue) / 5)}
						</text>
					{/each}

					{#each chartData as project, i}
						{@const x = 70 + i * (barWidth + 10)}
						{@const openTasksHeight = (project.openTasks / maxValue) * 175}
						{@const completedTasksHeight = (project.completedTasks / maxValue) * 175}
						{@const chatSessionsHeight = (project.chatSessions / maxValue) * 175}

						<rect
							{x}
							y={215 - openTasksHeight}
							width={barWidth / 3 - 2}
							height={openTasksHeight}
							fill="#0ea5e9"
							rx="2"
							class="hover:opacity-80 cursor-pointer"
							role="button"
							tabindex="0"
							aria-label="{project.openTasks} open tasks in {project.fullName}"
							onmouseenter={() =>
								(hoveredBar = {
									type: 'open tasks',
									project,
									value: project.openTasks
								})}
							onmouseleave={() => (hoveredBar = null)}
							onkeydown={(event) => {
								if (event.key === 'Enter' || event.key === ' ') {
									event.preventDefault();
									hoveredBar = {
										type: 'open tasks',
										project,
										value: project.openTasks
									};
								}
							}}
						/>

						<rect
							x={x + barWidth / 3}
							y={215 - completedTasksHeight}
							width={barWidth / 3 - 2}
							height={completedTasksHeight}
							fill="#10b981"
							rx="2"
							class="hover:opacity-80 cursor-pointer"
							role="button"
							tabindex="0"
							aria-label="{project.completedTasks} completed tasks in {project.fullName}"
							onmouseenter={() =>
								(hoveredBar = {
									type: 'done tasks',
									project,
									value: project.completedTasks
								})}
							onmouseleave={() => (hoveredBar = null)}
							onkeydown={(event) => {
								if (event.key === 'Enter' || event.key === ' ') {
									event.preventDefault();
									hoveredBar = {
										type: 'done tasks',
										project,
										value: project.completedTasks
									};
								}
							}}
						/>

						<rect
							x={x + (barWidth / 3) * 2}
							y={215 - chatSessionsHeight}
							width={barWidth / 3 - 2}
							height={chatSessionsHeight}
							fill="#f59e0b"
							rx="2"
							class="hover:opacity-80 cursor-pointer"
							role="button"
							tabindex="0"
							aria-label="{project.chatSessions} BuildOS chats in {project.fullName}"
							onmouseenter={() =>
								(hoveredBar = {
									type: 'BuildOS chats',
									project,
									value: project.chatSessions
								})}
							onmouseleave={() => (hoveredBar = null)}
							onkeydown={(event) => {
								if (event.key === 'Enter' || event.key === ' ') {
									event.preventDefault();
									hoveredBar = {
										type: 'BuildOS chats',
										project,
										value: project.chatSessions
									};
								}
							}}
						/>

						<text
							x={x + barWidth / 2}
							y="235"
							text-anchor="middle"
							font-size="10"
							fill="#6b7280"
							transform="rotate(-45, {x + barWidth / 2}, 235)"
						>
							{project.name}
						</text>
					{/each}
				</svg>

				{#if hoveredBar}
					<div
						class="absolute bg-card border border-border rounded-lg shadow-ink-strong p-3 pointer-events-none z-10"
						style="top: 10px; left: 10px;"
					>
						<p class="font-medium text-foreground">{hoveredBar.project.fullName}</p>
						<p class="text-sm text-muted-foreground capitalize">
							Status: {hoveredBar.project.status}
						</p>
						<p class="text-sm font-medium capitalize">
							{hoveredBar.type}: {hoveredBar.value}
						</p>
					</div>
				{/if}
			</div>

			<div class="grid grid-cols-3 gap-4 mt-4">
				<div class="text-center">
					<div class="text-lg font-bold text-sky-600">
						{chartData.reduce((sum, project) => sum + project.openTasks, 0)}
					</div>
					<div class="text-xs text-muted-foreground">Open Tasks</div>
				</div>
				<div class="text-center">
					<div class="text-lg font-bold text-emerald-600">
						{chartData.reduce((sum, project) => sum + project.completedTasks, 0)}
					</div>
					<div class="text-xs text-muted-foreground">Done Tasks</div>
				</div>
				<div class="text-center">
					<div class="text-lg font-bold text-amber-600">
						{chartData.reduce((sum, project) => sum + project.chatSessions, 0)}
					</div>
					<div class="text-xs text-muted-foreground">BuildOS Chats</div>
				</div>
			</div>
		</CardBody>
	</Card>
{:else}
	<Card variant="default">
		<CardBody
			padding="md"
			class="flex flex-col items-center justify-center h-64 text-muted-foreground"
		>
			<svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
				></path>
			</svg>
			<p class="text-lg font-medium">No Project Data</p>
			<p class="text-sm text-center">This user has not created any project activity yet</p>
		</CardBody>
	</Card>
{/if}
