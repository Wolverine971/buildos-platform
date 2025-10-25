<!-- apps/web/src/lib/components/admin/BrainDumpChart.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';

	// Using $props() for Svelte 5 runes mode
	let { brainDumps = [] }: { brainDumps?: any[] } = $props();

	// Reactive state using $state() - required in runes mode for reactivity
	let hoveredPoint = $state<any>(null);
	let timeZone = $state(Intl.DateTimeFormat().resolvedOptions().timeZone);

	onMount(() => {
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});

	// Process brain dumps data into monthly buckets - Using $derived for automatic memoization
	let processedData = $derived.by(() => {
		if (!brainDumps.length) return [];

		// Group by month
		const monthlyData = new Map();

		brainDumps.forEach((dump) => {
			const date = new Date(dump.created_at);
			const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
			const monthName = date.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'short',
				timeZone
			});

			if (!monthlyData.has(monthKey)) {
				monthlyData.set(monthKey, {
					month: monthName,
					count: 0,
					dumps: []
				});
			}

			const existing = monthlyData.get(monthKey);
			existing.count++;
			existing.dumps.push(dump);
		});

		// Convert to array and sort by date
		return Array.from(monthlyData.values())
			.sort((a, b) => new Date(a.month + ' 1').getTime() - new Date(b.month + ' 1').getTime())
			.slice(-12); // Last 12 months
	});

	// Compute max count for chart scaling - Using $derived for automatic updates
	let maxCount = $derived(Math.max(...processedData.map((d) => d.count), 1));

	// Calculate point spacing for chart - Using $derived
	let pointSpacing = $derived(processedData.length > 1 ? 350 / (processedData.length - 1) : 0);

	// Generate SVG path for the line - Using $derived for automatic recalculation
	let linePath = $derived(
		processedData.length > 1
			? processedData
					.map((point, index) => {
						const x = 60 + index * pointSpacing;
						const y = 200 - (point.count / maxCount) * 140;
						return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
					})
					.join(' ')
			: ''
	);

	// Generate path for area fill - Using $derived that depends on linePath
	let areaPath = $derived(
		processedData.length > 1
			? `${linePath} L ${60 + (processedData.length - 1) * pointSpacing} 200 L 60 200 Z`
			: ''
	);
</script>

{#if processedData?.length}
	<Card variant="default">
		<CardBody padding="md" class="w-full">
			<!-- Chart Container -->
			<div class="relative">
				<svg class="w-full h-60" viewBox="0 0 450 240">
					<!-- Grid lines -->
					{#each Array(6) as _, i}
						<line
							x1="60"
							y1={40 + i * 28}
							x2="410"
							y2={40 + i * 28}
							stroke="#e5e7eb"
							stroke-width="1"
							stroke-dasharray="2,2"
						/>
						<text
							x="55"
							y={45 + i * 28}
							text-anchor="end"
							font-size="10"
							fill="#6b7280"
						>
							{Math.round(((5 - i) * maxCount) / 5)}
						</text>
					{/each}

					<!-- Area fill -->
					{#if areaPath}
						<path d={areaPath} fill="rgba(139, 92, 246, 0.2)" stroke="none" />
					{/if}

					<!-- Line -->
					{#if linePath}
						<path
							d={linePath}
							fill="none"
							stroke="#8b5cf6"
							stroke-width="3"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					{/if}

					<!-- Data points -->
					{#each processedData as point, index}
						{@const x = 60 + index * pointSpacing}
						{@const y = 200 - (point.count / maxCount) * 140}

						<circle
							cx={x}
							cy={y}
							r="5"
							fill="#8b5cf6"
							stroke="white"
							stroke-width="2"
							class="hover:r-6 cursor-pointer transition-all"
							on:mouseenter={() => (hoveredPoint = { point, x, y })}
							on:mouseleave={() => (hoveredPoint = null)}
						/>

						<!-- Month labels -->
						<text
							{x}
							y="220"
							text-anchor="middle"
							font-size="10"
							fill="#6b7280"
							transform="rotate(-45, {x}, 220)"
						>
							{point.month}
						</text>
					{/each}
				</svg>

				<!-- Tooltip -->
				{#if hoveredPoint}
					<div
						class="absolute bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-3 pointer-events-none z-10"
						style="top: {hoveredPoint.y - 80}px; left: {Math.min(
							hoveredPoint.x - 50,
							300
						)}px;"
					>
						<p class="font-medium text-gray-900 dark:text-white">
							{hoveredPoint.point.month}
						</p>
						<p class="text-sm text-purple-600 font-medium">
							{hoveredPoint.point.count} brain dumps
						</p>
						{#if hoveredPoint.point.dumps?.length}
							<p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
								Latest: {hoveredPoint.point.dumps[
									hoveredPoint.point.dumps.length - 1
								].title || 'Untitled'}
							</p>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Stats Summary -->
			<div class="grid grid-cols-3 gap-4 mt-4">
				<div class="text-center">
					<div class="text-lg font-bold text-purple-600">{brainDumps.length}</div>
					<div class="text-xs text-gray-600 dark:text-gray-400">Total Dumps</div>
				</div>
				<div class="text-center">
					<div class="text-lg font-bold text-purple-600">
						{processedData?.length
							? Math.round((brainDumps.length / processedData.length) * 10) / 10
							: 0}
					</div>
					<div class="text-xs text-gray-600 dark:text-gray-400">Avg/Month</div>
				</div>
				<div class="text-center">
					<div class="text-lg font-bold text-purple-600">
						{processedData?.length ? Math.max(...processedData.map((d) => d.count)) : 0}
					</div>
					<div class="text-xs text-gray-600 dark:text-gray-400">Peak Month</div>
				</div>
			</div>

			<!-- Recent Brain Dumps -->
			{#if brainDumps?.length}
				<div class="mt-4">
					<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
						Recent Brain Dumps
					</h4>
					<div class="space-y-2 max-h-32 overflow-y-auto">
						{#each brainDumps.slice(0, 5) as dump}
							<div
								class="flex items-center justify-between p-2 bg-purple-50 dark:bg-purple-900/20 rounded"
							>
								<div class="flex-1 min-w-0">
									<p
										class="text-sm font-medium text-gray-900 dark:text-white truncate"
									>
										{dump.title || 'Untitled'}
									</p>
									<p class="text-xs text-gray-600 dark:text-gray-400">
										{dump.status || 'pending'}
									</p>
								</div>
								<span class="text-xs text-gray-500 ml-2">
									{new Date(dump.created_at).toLocaleDateString()}
								</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</CardBody>
	</Card>
{:else}
	<Card variant="default">
		<CardBody
			padding="md"
			class="flex flex-col items-center justify-center h-60 text-gray-500 dark:text-gray-400"
		>
			<svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
				></path>
			</svg>
			<p class="text-lg font-medium">No Brain Dump Data</p>
			<p class="text-sm text-center">This user hasn't created any brain dumps yet</p>
		</CardBody>
	</Card>
{/if}
