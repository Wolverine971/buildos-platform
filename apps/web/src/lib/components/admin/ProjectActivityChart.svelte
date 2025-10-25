<!-- apps/web/src/lib/components/admin/ProjectActivityChart.svelte -->
<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';

	// Using $props() for Svelte 5 runes mode
	let { projects = [] }: { projects?: any[] } = $props();

	// Reactive state using $state() - required in runes mode for reactivity
	let hoveredBar = $state<any>(null);

	// Transform projects data for the chart - Using $derived for automatic memoization
	let chartData = $derived(
		projects
			.filter((project) => project.name)
			.slice(0, 8) // Show top 8 projects to fit better
			.map((project) => ({
				name: project.name.length > 12 ? project.name.substring(0, 12) + '...' : project.name,
				fullName: project.name,
				tasks: project.task_count || 0,
				notes: project.notes_count || 0,
				completed_tasks: project.completed_task_count || 0,
				status: project.status || 'unknown'
			}))
			.sort((a, b) => b.tasks + b.notes - (a.tasks + a.notes))
	);

	// Calculate max value for chart scaling - Using $derived
	let maxValue = $derived(
		Math.max(
			...chartData.map((d) => Math.max(d.tasks, d.notes, d.completed_tasks)),
			1
		)
	);

	// Calculate bar width based on number of items - Using $derived
	let barWidth = $derived(
		chartData?.length
			? Math.max(80, (400 - (chartData.length - 1) * 10) / chartData.length)
			: 80
	);
</script>

{#if chartData?.length}
	<Card variant="default">
		<CardBody padding="md" class="w-full">
			<!-- Legend -->
			<div class="flex justify-center space-x-6 mb-4">
				<div class="flex items-center">
					<div class="w-4 h-4 bg-blue-500 rounded mr-2"></div>
					<span class="text-sm text-gray-600 dark:text-gray-400">Tasks</span>
				</div>
				<div class="flex items-center">
					<div class="w-4 h-4 bg-green-500 rounded mr-2"></div>
					<span class="text-sm text-gray-600 dark:text-gray-400">Notes</span>
				</div>
				<div class="flex items-center">
					<div class="w-4 h-4 bg-purple-500 rounded mr-2"></div>
					<span class="text-sm text-gray-600 dark:text-gray-400">Completed</span>
				</div>
			</div>

			<!-- Chart Container -->
			<div class="relative">
				<svg class="w-full h-64" viewBox="0 0 500 250">
					<!-- Grid lines -->
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

					<!-- Bars -->
					{#each chartData as project, i}
						{@const x = 70 + i * (barWidth + 10)}
						{@const tasksHeight = (project.tasks / maxValue) * 175}
						{@const notesHeight = (project.notes / maxValue) * 175}
						{@const completedHeight = (project.completed_tasks / maxValue) * 175}

						<!-- Tasks bar -->
						<rect
							{x}
							y={215 - tasksHeight}
							width={barWidth / 3 - 2}
							height={tasksHeight}
							fill="#3b82f6"
							rx="2"
							class="hover:opacity-80 cursor-pointer"
							on:mouseenter={() =>
								(hoveredBar = { type: 'tasks', project, value: project.tasks })}
							on:mouseleave={() => (hoveredBar = null)}
						/>

						<!-- Notes bar -->
						<rect
							x={x + barWidth / 3}
							y={215 - notesHeight}
							width={barWidth / 3 - 2}
							height={notesHeight}
							fill="#10b981"
							rx="2"
							class="hover:opacity-80 cursor-pointer"
							on:mouseenter={() =>
								(hoveredBar = { type: 'notes', project, value: project.notes })}
							on:mouseleave={() => (hoveredBar = null)}
						/>

						<!-- Completed bar -->
						<rect
							x={x + (barWidth / 3) * 2}
							y={215 - completedHeight}
							width={barWidth / 3 - 2}
							height={completedHeight}
							fill="#8b5cf6"
							rx="2"
							class="hover:opacity-80 cursor-pointer"
							on:mouseenter={() =>
								(hoveredBar = {
									type: 'completed',
									project,
									value: project.completed_tasks
								})}
							on:mouseleave={() => (hoveredBar = null)}
						/>

						<!-- Project name -->
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

				<!-- Tooltip -->
				{#if hoveredBar}
					<div
						class="absolute bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-3 pointer-events-none z-10"
						style="top: 10px; left: 10px;"
					>
						<p class="font-medium text-gray-900 dark:text-white">
							{hoveredBar.project.fullName}
						</p>
						<p class="text-sm text-gray-600 dark:text-gray-400 capitalize">
							Status: {hoveredBar.project.status}
						</p>
						<p class="text-sm font-medium capitalize">
							{hoveredBar.type}: {hoveredBar.value}
						</p>
					</div>
				{/if}
			</div>

			<!-- Summary Stats -->
			<div class="grid grid-cols-3 gap-4 mt-4">
				<div class="text-center">
					<div class="text-lg font-bold text-blue-600">
						{chartData.reduce((sum, p) => sum + p.tasks, 0)}
					</div>
					<div class="text-xs text-gray-600 dark:text-gray-400">Total Tasks</div>
				</div>
				<div class="text-center">
					<div class="text-lg font-bold text-green-600">
						{chartData.reduce((sum, p) => sum + p.notes, 0)}
					</div>
					<div class="text-xs text-gray-600 dark:text-gray-400">Total Notes</div>
				</div>
				<div class="text-center">
					<div class="text-lg font-bold text-purple-600">
						{chartData.reduce((sum, p) => sum + p.completed_tasks, 0)}
					</div>
					<div class="text-xs text-gray-600 dark:text-gray-400">Completed</div>
				</div>
			</div>
		</CardBody>
	</Card>
{:else}
	<Card variant="default">
		<CardBody
			padding="md"
			class="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400"
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
			<p class="text-sm text-center">This user hasn't created any projects yet</p>
		</CardBody>
	</Card>
{/if}
