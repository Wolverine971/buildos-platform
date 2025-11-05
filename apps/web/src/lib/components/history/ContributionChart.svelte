<!-- apps/web/src/lib/components/history/ContributionChart.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { format, parseISO, startOfWeek, addDays } from 'date-fns';
	import Button from '$lib/components/ui/Button.svelte';

	export let contributions: Array<{ date: string; count: number; level: number }> = [];
	export let searchMatchDates: string[] = [];
	export let selectedDay: string = '';
	export let onDayClick: (date: string) => void;
	export let isLoading: boolean = false;

	let chartContainer: HTMLElement;
	let tooltipElement: HTMLElement;
	let hoveredDay: { date: string; count: number; x: number; y: number } | null = null;

	// Group contributions by week
	$: weeks = groupByWeeks(contributions);
	$: monthLabels = getMonthLabels(weeks);

	function groupByWeeks(contribs: typeof contributions) {
		if (!contribs.length) return [];

		// Find first and last dates with actual contributions (count > 0)
		const activeContribs = contribs.filter((c) => c.count > 0);
		if (activeContribs.length === 0) {
			// No contributions yet - show empty state
			return [];
		}

		// Sort active contributions and get first/last dates
		const sortedActive = [...activeContribs].sort((a, b) => a.date.localeCompare(b.date));
		const firstDate = parseISO(sortedActive[0].date);
		const lastDate = parseISO(sortedActive[sortedActive.length - 1].date);

		// Extend to today if today is later than last contribution
		const today = new Date();
		const endDate = today > lastDate ? today : lastDate;

		// Build weeks starting from the week containing first contribution
		const weeks: Array<Array<(typeof contribs)[0] | null>> = [];
		const startWeek = startOfWeek(firstDate, { weekStartsOn: 0 });

		let currentDate = new Date(startWeek);

		while (currentDate <= endDate) {
			const week: Array<(typeof contribs)[0] | null> = [];

			// Build one week (7 days)
			for (let day = 0; day < 7; day++) {
				const dateStr = format(currentDate, 'yyyy-MM-dd');

				// Only include dates from first contribution onwards
				if (currentDate >= firstDate && currentDate <= endDate) {
					const contrib = contribs.find((c) => c.date === dateStr);
					week.push(contrib || { date: dateStr, count: 0, level: 0 });
				} else {
					week.push(null);
				}

				currentDate = addDays(currentDate, 1);
			}

			// Only add weeks that have at least one valid day
			if (week.some((day) => day !== null)) {
				weeks.push(week);
			}
		}

		return weeks;
	}

	function getMonthLabels(
		weeks: Array<Array<{ date: string; count: number; level: number } | null>>
	) {
		if (!weeks.length) return [];

		const months: Array<{ name: string; weekIndex: number }> = [];
		let currentMonth = -1;

		weeks.forEach((week, weekIndex) => {
			// Get the first non-null day of the week
			const firstDayWithDate = week.find((day) => day !== null);
			if (!firstDayWithDate) return;

			const date = parseISO(firstDayWithDate.date);
			const month = date.getMonth();

			if (month !== currentMonth) {
				months.push({
					name: format(date, 'MMM'),
					weekIndex
				});
				currentMonth = month;
			}
		});

		return months;
	}

	function getContributionColor(level: number, isSearchMatch: boolean, isSelected: boolean) {
		if (isSelected) {
			return 'rgb(168, 85, 247)'; // Purple-500 for selected
		}

		if (isSearchMatch && level > 0) {
			// Orange tones for search matches
			const orangeColors = [
				'rgb(254, 215, 170)', // orange-200
				'rgb(253, 186, 116)', // orange-300
				'rgb(251, 146, 60)', // orange-400
				'rgb(249, 115, 22)', // orange-500
				'rgb(234, 88, 12)' // orange-600
			];
			return orangeColors[Math.min(level, 4)];
		}

		// Default purple/gray tones
		const colors = [
			'rgb(243, 244, 246)', // gray-100 for 0
			'rgb(196, 181, 253)', // purple-200 for 1
			'rgb(167, 139, 250)', // purple-300 for 2-3
			'rgb(139, 92, 246)', // purple-400 for 4-6
			'rgb(124, 58, 237)' // purple-500 for 7+
		];

		return colors[Math.min(level, 4)];
	}

	function handleDayClick(day: (typeof contributions)[0] | null) {
		if (day && onDayClick) {
			onDayClick(day.date);
		}
	}

	function handleDayMouseEnter(event: MouseEvent, day: (typeof contributions)[0] | null) {
		if (!day) return;

		const rect = (event.target as HTMLElement).getBoundingClientRect();
		const containerRect = chartContainer.getBoundingClientRect();

		hoveredDay = {
			date: day.date,
			count: day.count,
			x: rect.left - containerRect.left + rect.width / 2,
			y: rect.top - containerRect.top - 10
		};
	}

	function handleDayMouseLeave() {
		hoveredDay = null;
	}

	function formatTooltipDate(dateStr: string): string {
		const date = parseISO(dateStr);
		return format(date, 'EEEE, MMMM d, yyyy');
	}

	// Day labels
	const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
</script>

<div
	bind:this={chartContainer}
	class="relative bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6"
>
	{#if isLoading}
		<div class="flex items-center justify-center py-20">
			<div class="animate-pulse flex space-x-1">
				{#each Array(53) as _, i}
					<div class="flex flex-col space-y-1">
						{#each Array(7) as _, j}
							<div class="w-3 h-3 bg-gray-200 dark:bg-gray-700 rounded-sm"></div>
						{/each}
					</div>
				{/each}
			</div>
		</div>
	{:else if weeks.length === 0}
		<div class="text-center py-20">
			<div class="text-gray-400 mb-2">No activity data</div>
			<div class="text-sm text-gray-500 dark:text-gray-400">
				Contribution chart will appear once you start creating braindumps
			</div>
		</div>
	{:else}
		<!-- Chart header with months -->
		<div class="mb-4">
			<div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-3">
				<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">
					Braindump Activity
				</h4>
				<div
					class="flex items-center justify-center sm:justify-end space-x-2 text-xs text-gray-500 dark:text-gray-400"
				>
					<span class="hidden sm:inline">Less</span>
					<div class="flex space-x-1">
						{#each [0, 1, 2, 3, 4] as level}
							<div
								class="w-2.5 h-2.5 sm:w-2.5 sm:h-2.5 rounded-sm"
								style="background-color: {getContributionColor(
									level,
									false,
									false
								)}"
							></div>
						{/each}
					</div>
					<span class="hidden sm:inline">More</span>
				</div>
			</div>

			<!-- Month labels - responsive -->
			<div class="relative h-4 mb-2 overflow-x-auto">
				<div class="flex space-x-1 min-w-max">
					{#each weeks as week, weekIndex}
						<div class="w-2.5 sm:w-3 h-4 relative flex-shrink-0">
							{#each monthLabels as month}
								{#if month.weekIndex === weekIndex}
									<div
										class="absolute -top-1 left-0 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap"
									>
										{month.name}
									</div>
								{/if}
							{/each}
						</div>
					{/each}
				</div>
			</div>
		</div>

		<!-- Chart grid - responsive with horizontal scroll -->
		<div class="contribution-chart-wrapper relative">
			<div
				class="contribution-chart-scroll flex overflow-x-auto {weeks.length > 20
					? 'can-scroll'
					: ''}"
			>
				<!-- Day labels -->
				<div
					class="flex flex-col justify-between items-center text-xs text-gray-500 dark:text-gray-400 mr-2 sm:mr-3 flex-shrink-0"
				>
					{#each dayLabels as label, index}
						<!-- Only show Mon, Wed, Fri for space -->
						<div class="h-3 sm:h-3 flex items-center text-xs">
							<span class="hidden sm:inline">{label}</span>
							<span class="sm:hidden">{label.charAt(0)}</span>
						</div>
					{/each}
				</div>

				<!-- Contribution grid -->
				<div class="flex space-x-1 min-w-max">
					{#each weeks as week, weekIndex}
						<div class="contribution-week flex flex-col space-y-1">
							{#each week as day, dayIndex}
								{@const isSearchMatch = searchMatchDates.includes(day?.date || '')}
								{@const isSelected = selectedDay === day?.date}
								<Button
									variant="ghost"
									btnType="container"
									class="contribution-square w-3 h-3 sm:w-3 sm:h-3 rounded-sm transition-all duration-200 hover:ring-2 hover:ring-purple-300 hover:ring-opacity-50 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 touch-manipulation p-0 min-h-0"
									style="background-color: {getContributionColor(
										day?.level || 0,
										isSearchMatch,
										isSelected
									)}; --level: {day?.level || 0}"
									data-level={day?.level || 0}
									title={day
										? `${day.count} braindump${day.count !== 1 ? 's' : ''} on ${formatTooltipDate(day.date)}`
										: ''}
									aria-label={day
										? `${formatTooltipDate(day.date)}: ${day.count} braindump${day.count !== 1 ? 's' : ''}`
										: 'No data'}
									disabled={!day}
									onclick={() => handleDayClick(day)}
									onmouseenter={(e) => handleDayMouseEnter(e, day)}
									onmouseleave={handleDayMouseLeave}
								></Button>
							{/each}
						</div>
					{/each}
				</div>
			</div>
			<!-- Scroll indicator -->
			<div class="scroll-indicator"></div>
		</div>

		<!-- Legend - responsive -->
		<div
			class="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-gray-500 dark:text-gray-400"
		>
			<div class="flex items-center justify-center sm:justify-start space-x-4">
				{#if searchMatchDates.length > 0}
					<div class="flex items-center space-x-1">
						<div class="w-2.5 h-2.5 rounded-sm bg-orange-400"></div>
						<span>Search matches</span>
					</div>
				{/if}
				{#if selectedDay}
					<div class="flex items-center space-x-1">
						<div class="w-2.5 h-2.5 rounded-sm bg-purple-500"></div>
						<span>Selected day</span>
					</div>
				{/if}
			</div>
			<div class="text-center sm:text-right text-xs text-gray-400">
				Tip: Tap any square to view that day's braindumps
			</div>
		</div>
	{/if}

	<!-- Tooltip -->
	{#if hoveredDay}
		<div
			bind:this={tooltipElement}
			class="contribution-tooltip absolute z-10 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-full"
			style="left: {hoveredDay.x}px; top: {hoveredDay.y}px;"
		>
			<div class="font-medium">{formatTooltipDate(hoveredDay.date)}</div>
			<div class="text-gray-300">
				{hoveredDay.count} braindump{hoveredDay.count !== 1 ? 's' : ''}
			</div>

			<!-- Tooltip arrow -->
			<div class="tooltip-arrow absolute top-full left-1/2 transform -translate-x-1/2">
				<div
					class="border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"
				></div>
			</div>
		</div>
	{/if}
</div>
