<!-- src/lib/components/analytics/VisitorContributionChart.svelte -->
<script lang="ts">
	import { format, parseISO, startOfWeek, addDays, subDays, startOfDay } from 'date-fns';
	import Button from '$lib/components/ui/Button.svelte';

	export let visitors: Array<{ date: string; visitor_count: number }> = [];
	export let signups: Array<{ date: string; signup_count: number }> = [];
	export let isLoading: boolean = false;

	let chartContainer: HTMLElement;
	let hoveredDay: { date: string; count: number; x: number; y: number } | null = null;
	let hoveredPoint: { date: string; count: number; x: number; y: number; type?: string } | null =
		null;
	let hoveredSignup: { date: string; count: number; x: number; y: number } | null = null;
	let viewMode: 'chart' | 'graph' = 'graph';

	// Generate last 30 days and group by weeks
	$: weeks = generateVisitorGrid(visitors);
	$: monthLabels = getMonthLabels();
	$: graphData = generateGraphData(visitors);
	$: signupGraphData = generateSignupGraphData(signups);

	function generateVisitorGrid(visitorData: typeof visitors) {
		// Generate the last 30 days
		const today = startOfDay(new Date());
		const thirtyDaysAgo = subDays(today, 29); // 30 days total including today

		// Create array of all 30 days
		const allDays: Array<{ date: string; visitor_count: number; level: number }> = [];

		for (let i = 0; i < 30; i++) {
			const currentDate = addDays(thirtyDaysAgo, i);
			const dateStr = format(currentDate, 'yyyy-MM-dd');

			// Find visitor data for this date
			const visitorDay = visitorData.find((v) => v.date === dateStr);
			const count = visitorDay?.visitor_count || 0;

			allDays.push({
				date: dateStr,
				visitor_count: count,
				level: getVisitorLevel(count, visitorData)
			});
		}

		// Group into weeks starting from Sunday
		const weeks: Array<Array<(typeof allDays)[0] | null>> = [];
		const startDate = parseISO(allDays[0].date);
		const weekStart = startOfWeek(startDate, { weekStartsOn: 0 }); // Start on Sunday

		// Calculate how many days before our start date to fill the first week
		const daysBefore = Math.floor(
			(startDate.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)
		);

		// Create the grid
		let dayIndex = 0;
		let currentWeek: Array<(typeof allDays)[0] | null> = [];

		// Fill empty days at the beginning of first week
		for (let i = 0; i < daysBefore; i++) {
			currentWeek.push(null);
		}

		// Add our actual days
		while (dayIndex < allDays.length) {
			currentWeek.push(allDays[dayIndex]);
			dayIndex++;

			// If week is complete (7 days) or we're done with data
			if (currentWeek.length === 7) {
				weeks.push([...currentWeek]);
				currentWeek = [];
			}
		}

		// Add final week if it has data
		if (currentWeek.length > 0) {
			// Fill remaining days in the week with null
			while (currentWeek.length < 7) {
				currentWeek.push(null);
			}
			weeks.push(currentWeek);
		}

		return weeks;
	}

	function generateGraphData(visitorData: typeof visitors) {
		const today = startOfDay(new Date());
		const thirtyDaysAgo = subDays(today, 29);

		const data: Array<{ date: string; visitor_count: number; formattedDate: string }> = [];

		for (let i = 0; i < 30; i++) {
			const currentDate = addDays(thirtyDaysAgo, i);
			const dateStr = format(currentDate, 'yyyy-MM-dd');

			const visitorDay = visitorData.find((v) => v.date === dateStr);
			const count = visitorDay?.visitor_count || 0;

			data.push({
				date: dateStr,
				visitor_count: count,
				formattedDate: format(currentDate, 'MMM d')
			});
		}

		return data;
	}

	function generateSignupGraphData(signupData: typeof signups) {
		const today = startOfDay(new Date());
		const thirtyDaysAgo = subDays(today, 29);

		const data: Array<{ date: string; signup_count: number; formattedDate: string }> = [];

		for (let i = 0; i < 30; i++) {
			const currentDate = addDays(thirtyDaysAgo, i);
			const dateStr = format(currentDate, 'yyyy-MM-dd');

			const signupDay = signupData.find((s) => s.date === dateStr);
			const count = signupDay?.signup_count || 0;

			data.push({
				date: dateStr,
				signup_count: count,
				formattedDate: format(currentDate, 'MMM d')
			});
		}

		return data;
	}

	function getVisitorLevel(count: number, allData: typeof visitors): number {
		if (count === 0) return 0;

		// Calculate levels based on data distribution
		const counts = allData.map((d) => d.visitor_count).filter((c) => c > 0);
		if (counts.length === 0) return 0;

		const max = Math.max(...counts);
		const quartile = max / 4;

		if (count >= quartile * 3) return 4; // Highest
		if (count >= quartile * 2) return 3; // High
		if (count >= quartile) return 2; // Medium
		return 1; // Low (but > 0)
	}

	function getMonthLabels() {
		if (weeks.length === 0) return [];

		const months: Array<{ name: string; weekIndex: number }> = [];
		let currentMonth = -1;

		weeks.forEach((week, weekIndex) => {
			week.forEach((day) => {
				if (!day) return;

				const date = parseISO(day.date);
				const month = date.getMonth();

				if (month !== currentMonth) {
					months.push({
						name: format(date, 'MMM'),
						weekIndex
					});
					currentMonth = month;
				}
			});
		});

		return months;
	}

	function getVisitorColor(level: number) {
		// Blue color scheme for visitors
		const colors = [
			'rgb(243, 244, 246)', // gray-100 for 0
			'rgb(219, 234, 254)', // blue-100 for 1
			'rgb(147, 197, 253)', // blue-300 for 2
			'rgb(59, 130, 246)', // blue-500 for 3
			'rgb(29, 78, 216)' // blue-700 for 4
		];

		return colors[Math.min(level, 4)];
	}

	function handleDayMouseEnter(event: MouseEvent, day: any) {
		if (!day) return;

		const rect = (event.target as HTMLElement).getBoundingClientRect();
		const containerRect = chartContainer.getBoundingClientRect();

		hoveredDay = {
			date: day.date,
			count: day.visitor_count,
			x: rect.left - containerRect.left + rect.width / 2,
			y: rect.top - containerRect.top - 10
		};
	}

	function handleDayMouseLeave() {
		hoveredDay = null;
	}

	function handlePointMouseEnter(event: MouseEvent, point: any) {
		const rect = chartContainer.getBoundingClientRect();
		const target = event.target as HTMLElement;

		hoveredPoint = {
			date: point.date,
			count: point.visitor_count,
			x: event.clientX - rect.left,
			y: event.clientY - rect.top - 10,
			type: 'visitor'
		};
	}

	function handlePointMouseLeave() {
		hoveredPoint = null;
	}

	function handleSignupMouseEnter(event: MouseEvent, point: any) {
		const rect = chartContainer.getBoundingClientRect();

		hoveredSignup = {
			date: point.date,
			count: point.signup_count,
			x: event.clientX - rect.left,
			y: event.clientY - rect.top - 10
		};
	}

	function handleSignupMouseLeave() {
		hoveredSignup = null;
	}

	function formatTooltipDate(dateStr: string): string {
		const date = parseISO(dateStr);
		return format(date, 'EEEE, MMMM d, yyyy');
	}

	function toggleView() {
		viewMode = viewMode === 'chart' ? 'graph' : 'chart';
		hoveredDay = null;
		hoveredPoint = null;
	}

	// Day labels - only show Mon, Wed, Fri for space
	const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	// Calculate total visitors and signups
	$: totalVisitors = visitors.reduce((sum, day) => sum + day.visitor_count, 0);
	$: totalSignups = signups.reduce((sum, day) => sum + day.signup_count, 0);
	$: averageDaily = visitors.length > 0 ? (totalVisitors / visitors.length).toFixed(1) : '0';
	$: averageSignups = signups.length > 0 ? (totalSignups / signups.length).toFixed(1) : '0';
	$: maxVisitors = Math.max(...visitors.map((v) => v.visitor_count), 1);
	$: maxSignups = Math.max(...signups.map((s) => s.signup_count), 1);
	$: maxValue = Math.max(maxVisitors, maxSignups, 1);
</script>

<div
	bind:this={chartContainer}
	class="relative bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6"
>
	{#if isLoading}
		<div class="flex items-center justify-center py-8 sm:py-12">
			<div class="animate-pulse flex space-x-1">
				{#each Array(5) as _, i}
					<div class="flex flex-col space-y-1">
						{#each Array(7) as _, j}
							<div
								class="w-2 h-2 sm:w-3 sm:h-3 bg-gray-200 dark:bg-gray-700 rounded-sm"
							></div>
						{/each}
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<!-- Chart header - Mobile Responsive -->
		<div class="mb-4">
			<div
				class="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-3 space-y-3 sm:space-y-0"
			>
				<div class="flex-1">
					<div class="flex flex-col sm:flex-row sm:items-center">
						<h4
							class="text-base sm:text-lg font-semibold text-gray-900 dark:!text-white flex items-center mb-2 sm:mb-0"
						>
							<svg
								class="mr-2 h-4 w-4 sm:h-5 sm:w-5 text-blue-600"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							<span class="hidden sm:inline">Daily Visitors (Last 30 Days)</span>
							<span class="sm:hidden">Daily Visitors</span>
						</h4>
						<!-- View Toggle -->
						<div
							class="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1 sm:ml-4"
						>
							<Button
								variant={viewMode === 'graph' ? 'primary' : 'ghost'}
								size="sm"
								class="px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-md"
								on:click={() => (viewMode = 'graph')}
							>
								<svg
									class="w-3 h-3 sm:w-4 sm:h-4 mr-1 inline"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
									/>
								</svg>
								<span class="hidden sm:inline">Graph</span>
							</Button>
							<Button
								variant={viewMode === 'chart' ? 'primary' : 'ghost'}
								size="sm"
								class="px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-md"
								on:click={() => (viewMode = 'chart')}
							>
								<svg
									class="w-3 h-3 sm:w-4 sm:h-4 mr-1 inline"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
									/>
								</svg>
								<span class="hidden sm:inline">Chart</span>
							</Button>
						</div>
					</div>
					<p class="text-xs sm:text-sm text-gray-600 dark:!text-gray-400 mt-1">
						{totalVisitors} total visitors • {averageDaily} avg per day • {totalSignups}
						signups
					</p>
				</div>
				{#if viewMode === 'chart'}
					<div
						class="flex items-center space-x-1 sm:space-x-2 text-xs text-gray-500 dark:!text-gray-400"
					>
						<span class="hidden sm:inline">Less</span>
						<div class="flex space-x-1">
							{#each [0, 1, 2, 3, 4] as level}
								<div
									class="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-sm"
									style="background-color: {getVisitorColor(level)}"
								></div>
							{/each}
						</div>
						<span class="hidden sm:inline">More</span>
					</div>
				{/if}
			</div>
		</div>

		{#if visitors.length === 0}
			<div class="text-center py-8 sm:py-12">
				<div class="text-gray-400 mb-2">No visitor data</div>
				<div class="text-xs sm:text-sm text-gray-500 dark:!text-gray-400">
					Visitor activity will appear here once tracking begins
				</div>
			</div>
		{:else if viewMode === 'chart'}
			<!-- Month labels for chart view - Mobile Responsive -->
			{#if weeks.length > 0}
				<div class="relative h-3 sm:h-4 mb-2">
					<div class="flex space-x-0.5 sm:space-x-1">
						{#each weeks as week, weekIndex}
							<div class="w-2 sm:w-3 h-3 sm:h-4 relative">
								{#each monthLabels as month}
									{#if month.weekIndex === weekIndex}
										<div
											class="absolute -top-1 left-0 text-xs text-gray-500 dark:!text-gray-400 whitespace-nowrap"
										>
											{month.name}
										</div>
									{/if}
								{/each}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Chart grid - Mobile Responsive -->
			<div class="flex overflow-x-auto">
				<!-- Day labels -->
				<div
					class="flex flex-col justify-between text-xs text-gray-500 dark:!text-gray-400 mr-2 sm:mr-3 py-0.5 flex-shrink-0"
				>
					{#each dayLabels as label, index}
						{#if index % 2 === 1}
							<!-- Only show Mon, Wed, Fri for space -->
							<div class="h-2 sm:h-3 flex items-center">{label}</div>
						{:else}
							<div class="h-2 sm:h-3"></div>
						{/if}
					{/each}
				</div>

				<!-- Contribution grid -->
				<div class="flex space-x-0.5 sm:space-x-1 min-w-0">
					{#each weeks as week, weekIndex}
						<div class="flex flex-col space-y-0.5 sm:space-y-1">
							{#each week as day, dayIndex}
								<div
									class="w-2 h-2 sm:w-3 sm:h-3 rounded-sm transition-all duration-200 hover:ring-1 sm:hover:ring-2 hover:ring-blue-300 hover:ring-opacity-50 hover:scale-110 cursor-pointer"
									style="background-color: {getVisitorColor(day?.level || 0)}"
									title={day
										? `${day.visitor_count} visitor${day.visitor_count !== 1 ? 's' : ''} on ${formatTooltipDate(day.date)}`
										: 'No data'}
									on:mouseenter={(e) => handleDayMouseEnter(e, day)}
									on:mouseleave={handleDayMouseLeave}
									role="button"
									tabindex="0"
								></div>
							{/each}
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<!-- Graph view - Mobile Responsive -->
			<div class="mt-4">
				<!-- Legend -->
				<div class="flex items-center space-x-4 mb-4 text-xs sm:text-sm">
					<div class="flex items-center">
						<div class="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
						<span class="text-gray-600 dark:text-gray-400">Visitors (Line)</span>
					</div>
					<div class="flex items-center">
						<div class="w-3 h-3 bg-green-500 rounded-sm mr-2 opacity-60"></div>
						<span class="text-gray-600 dark:text-gray-400">Signups (Bars)</span>
					</div>
				</div>

				<div class="overflow-x-auto">
					<svg class="w-full min-w-[300px] h-48 sm:h-64" viewBox="0 0 800 200">
						<!-- Grid lines -->
						{#each Array(6) as _, i}
							<line
								x1="50"
								y1={30 + i * 28}
								x2="750"
								y2={30 + i * 28}
								stroke="rgb(229, 231, 235)"
								stroke-width="1"
								class="dark:stroke-gray-600"
							/>
							<text
								x="45"
								y={35 + i * 28}
								fill="rgb(107, 114, 128)"
								font-size="10"
								text-anchor="end"
								class="dark:fill-gray-400"
							>
								{Math.round(maxValue - (i * maxValue) / 5)}
							</text>
						{/each}

						<!-- Signups bars -->
						{#if signupGraphData.length > 0}
							{#each signupGraphData as point, index}
								<rect
									x={45 + index * (700 / (signupGraphData.length - 1))}
									y={170 - (point.signup_count / maxValue) * 140}
									width="10"
									height={(point.signup_count / maxValue) * 140}
									fill="rgb(34, 197, 94)"
									fill-opacity="0.6"
									class="hover:fill-opacity-100 cursor-pointer transition-all duration-200"
									on:mouseenter={(e) => handleSignupMouseEnter(e, point)}
									on:mouseleave={handleSignupMouseLeave}
								/>
							{/each}
						{/if}

						<!-- Visitors line -->
						{#if graphData.length > 1}
							<path
								d="M {graphData
									.map(
										(point, index) =>
											`${50 + index * (700 / (graphData.length - 1))},${170 - (point.visitor_count / maxValue) * 140}`
									)
									.join(' L ')}"
								fill="none"
								stroke="rgb(59, 130, 246)"
								stroke-width="2"
								class="transition-all duration-300"
							/>

							<!-- Visitors data points -->
							{#each graphData as point, index}
								<circle
									cx={50 + index * (700 / (graphData.length - 1))}
									cy={170 - (point.visitor_count / maxValue) * 140}
									r="3"
									fill="rgb(59, 130, 246)"
									class="hover:r-5 cursor-pointer transition-all duration-200"
									on:mouseenter={(e) => handlePointMouseEnter(e, point)}
									on:mouseleave={handlePointMouseLeave}
								/>
							{/each}

							<!-- X-axis labels -->
							{#each graphData as point, index}
								{#if index % Math.max(1, Math.floor(graphData.length / 6)) === 0 || index === graphData.length - 1}
									<text
										x={50 + index * (700 / (graphData.length - 1))}
										y="190"
										fill="rgb(107, 114, 128)"
										font-size="9"
										text-anchor="middle"
										class="dark:fill-gray-400"
									>
										{point.formattedDate}
									</text>
								{/if}
							{/each}
						{/if}
					</svg>
				</div>
			</div>
		{/if}

		<!-- Summary stats - Mobile Responsive -->
		<div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
			<div
				class="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs sm:text-sm space-y-2 sm:space-y-0"
			>
				<div
					class="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-1 sm:space-y-0 text-gray-600 dark:!text-gray-400"
				>
					<span
						>📈 Peak day: {Math.max(...visitors.map((v) => v.visitor_count))} visitors</span
					>
					<span
						>📅 Active days: {visitors.filter((v) => v.visitor_count > 0)
							.length}/30</span
					>
				</div>
			</div>
		</div>
	{/if}

	<!-- Chart view tooltip - Mobile Responsive -->
	{#if hoveredDay}
		<div
			class="absolute z-10 px-2 sm:px-3 py-1 sm:py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-full"
			style="left: {hoveredDay.x}px; top: {hoveredDay.y}px;"
		>
			<div class="font-medium text-xs sm:text-sm">{formatTooltipDate(hoveredDay.date)}</div>
			<div class="text-gray-300 text-xs">
				{hoveredDay.count} visitor{hoveredDay.count !== 1 ? 's' : ''}
			</div>

			<!-- Tooltip arrow -->
			<div class="absolute top-full left-1/2 transform -translate-x-1/2">
				<div
					class="border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"
				></div>
			</div>
		</div>
	{/if}

	<!-- Graph view tooltip - Mobile Responsive -->
	{#if hoveredPoint}
		<div
			class="absolute z-10 px-2 sm:px-3 py-1 sm:py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-full"
			style="left: {hoveredPoint.x}px; top: {hoveredPoint.y}px;"
		>
			<div class="font-medium text-xs sm:text-sm">{formatTooltipDate(hoveredPoint.date)}</div>
			<div class="text-gray-300 text-xs">
				{hoveredPoint.count} visitor{hoveredPoint.count !== 1 ? 's' : ''}
			</div>

			<!-- Tooltip arrow -->
			<div class="absolute top-full left-1/2 transform -translate-x-1/2">
				<div
					class="border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"
				></div>
			</div>
		</div>
	{/if}

	<!-- Signup tooltip - Mobile Responsive -->
	{#if hoveredSignup}
		<div
			class="absolute z-10 px-2 sm:px-3 py-1 sm:py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-full"
			style="left: {hoveredSignup.x}px; top: {hoveredSignup.y}px;"
		>
			<div class="font-medium text-xs sm:text-sm">
				{formatTooltipDate(hoveredSignup.date)}
			</div>
			<div class="text-gray-300 text-xs">
				{hoveredSignup.count} signup{hoveredSignup.count !== 1 ? 's' : ''}
			</div>

			<!-- Tooltip arrow -->
			<div class="absolute top-full left-1/2 transform -translate-x-1/2">
				<div
					class="border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"
				></div>
			</div>
		</div>
	{/if}
</div>
