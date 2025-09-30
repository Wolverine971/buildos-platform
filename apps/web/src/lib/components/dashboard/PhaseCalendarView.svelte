<!-- apps/web/src/lib/components/dashboard/PhaseCalendarView.svelte -->
<script lang="ts">
	import {
		Calendar,
		FolderOpen,
		ChevronLeft,
		ChevronRight,
		Layers,
		Clock,
		ArrowRight,
		ExternalLink
	} from 'lucide-svelte';
	import {
		format,
		addDays,
		isSameDay,
		isWithinInterval,
		parseISO,
		startOfDay,
		endOfDay,
		differenceInDays
	} from 'date-fns';
	import Button from '$lib/components/ui/Button.svelte';
	import { DEFAULT_CALENDAR_COLOR, GOOGLE_CALENDAR_COLORS } from '$lib/config/calendar-colors';
	import { getProjectColor } from '$lib/utils/project-colors';

	// Props - Accept data from dashboard
	export let data: any = {};

	// Extract phases data properly
	$: phases = data?.phases || [];

	const DEFAULT_PHASE_COLOR = GOOGLE_CALENDAR_COLORS[DEFAULT_CALENDAR_COLOR];
	const PHASE_ROW_HEIGHT = 36;
	const PHASE_ROW_GAP = 8;

	// Calendar navigation
	const today = new Date();
	let startDate = today;
	let mobileView: 'list' | 'week' = 'list';

	// Generate calendar days
	$: calendarDays = (() => {
		const days = [];
		const totalDays = 21; // 3 weeks

		for (let i = 0; i < totalDays; i++) {
			const date = addDays(startDate, i);
			days.push({
				date,
				dateStr: format(date, 'yyyy-MM-dd'),
				isToday: isSameDay(date, today),
				dayNumber: format(date, 'd'),
				monthName: format(date, 'MMM'),
				dayName: format(date, 'EEE'),
				fullDate: format(date, 'MMM d')
			});
		}

		return days;
	})();

	// Group calendar days into weeks
	$: weekRows = (() => {
		const weeks = [];
		for (let i = 0; i < calendarDays.length; i += 7) {
			weeks.push(calendarDays.slice(i, i + 7));
		}
		return weeks;
	})();

	// Get all active and upcoming phases for mobile list view
	$: sortedPhases = phases
		.filter((phase) => {
			if (!phase.start_date || !phase.end_date) return false;
			try {
				const end = parseISO(phase.end_date);
				return end >= today; // Show current and future phases
			} catch {
				return false;
			}
		})
		.sort((a, b) => {
			try {
				const dateA = parseISO(a.start_date);
				const dateB = parseISO(b.start_date);
				return dateA.getTime() - dateB.getTime();
			} catch {
				return 0;
			}
		});

	function getPhasesForDate(dateStr: string): any[] {
		const targetDate = startOfDay(parseISO(dateStr));

		return phases.filter((phase) => {
			if (!phase.start_date || !phase.end_date) return false;

			try {
				const phaseStart = startOfDay(parseISO(phase.start_date));
				const phaseEnd = endOfDay(parseISO(phase.end_date));

				return isWithinInterval(targetDate, { start: phaseStart, end: phaseEnd });
			} catch {
				return false;
			}
		});
	}

	function getPhaseColorConfig(phase: any) {
		const projectColor = phase?.projects ? getProjectColor(phase.projects) : null;
		const color = projectColor ?? DEFAULT_PHASE_COLOR;
		return {
			hex: color?.hex ?? DEFAULT_PHASE_COLOR.hex,
			textClass: color?.text ?? DEFAULT_PHASE_COLOR.text,
			bgClass: color?.bg ?? DEFAULT_PHASE_COLOR.bg
		};
	}

	function getPhasePosition(phase: any, dateStr: string): 'start' | 'middle' | 'end' | 'single' {
		const targetDate = parseISO(dateStr);
		const phaseStart = parseISO(phase.start_date);
		const phaseEnd = parseISO(phase.end_date);

		const isStartDay = isSameDay(targetDate, phaseStart);
		const isEndDay = isSameDay(targetDate, phaseEnd);
		const isSingleDay = isSameDay(phaseStart, phaseEnd);

		if (isSingleDay) return 'single';
		if (isStartDay) return 'start';
		if (isEndDay) return 'end';
		return 'middle';
	}

	// Get continuous phase bars that span across multiple days with proper stacking
	function getContinuousPhases(weekDays: any[]): { bars: any[]; laneCount: number } {
		const phaseBars: any[] = [];
		const processedPhases = new Set();
		const weekStart = startOfDay(parseISO(weekDays[0]?.dateStr));
		const weekEnd = endOfDay(parseISO(weekDays[weekDays.length - 1]?.dateStr));

		// Get all unique phases for this week
		const allPhases = new Set();
		weekDays.forEach((day) => {
			getPhasesForDate(day.dateStr).forEach((phase) => allPhases.add(phase.id));
		});

		Array.from(allPhases).forEach((phaseId) => {
			if (processedPhases.has(phaseId)) return;

			const phase = phases.find((p) => p.id === phaseId);
			if (!phase) return;

			const phaseStart = startOfDay(parseISO(phase.start_date));
			const phaseEnd = endOfDay(parseISO(phase.end_date));

			// Find the span of this phase within the current week
			let startCol = -1;
			let endCol = -1;

			weekDays.forEach((day, index) => {
				const dayDate = parseISO(day.dateStr);
				if (isWithinInterval(dayDate, { start: phaseStart, end: phaseEnd })) {
					if (startCol === -1) startCol = index;
					endCol = index;
				}
			});

			if (startCol !== -1) {
				phaseBars.push({
					...phase,
					startCol,
					endCol,
					span: endCol - startCol + 1,
					isStart: isSameDay(phaseStart, parseISO(weekDays[startCol]?.dateStr)),
					isEnd: isSameDay(phaseEnd, parseISO(weekDays[endCol]?.dateStr)),
					phaseStart,
					phaseEnd
				});
				processedPhases.add(phaseId);
			}
		});

		// Sort by start date to ensure consistent stacking order
		const sortedBars = phaseBars.sort((a, b) => {
			const dateA = parseISO(a.start_date);
			const dateB = parseISO(b.start_date);
			return dateA.getTime() - dateB.getTime();
		});

		const laneEndDates: Date[] = [];
		sortedBars.forEach((bar) => {
			const normalizedStart = bar.phaseStart < weekStart ? weekStart : bar.phaseStart;
			const normalizedEnd = bar.phaseEnd > weekEnd ? weekEnd : bar.phaseEnd;
			const availableLane = laneEndDates.findIndex((end) => normalizedStart > end);
			const laneIndex = availableLane === -1 ? laneEndDates.length : availableLane;
			laneEndDates[laneIndex] = normalizedEnd;
			bar.lane = laneIndex;
		});

		return {
			bars: sortedBars,
			laneCount: laneEndDates.length
		};
	}

	function navigateCalendar(direction: 'prev' | 'next') {
		const days = direction === 'next' ? 7 : -7;
		startDate = addDays(startDate, days);
	}

	function resetToToday() {
		startDate = today;
	}

	function formatPhaseDate(dateStr: string): string {
		try {
			return format(parseISO(dateStr), 'MMM d');
		} catch {
			return dateStr;
		}
	}

	function getPhaseDuration(phase: any): string {
		try {
			const start = parseISO(phase.start_date);
			const end = parseISO(phase.end_date);
			const days = differenceInDays(end, start) + 1;
			return `${days} day${days === 1 ? '' : 's'}`;
		} catch {
			return '';
		}
	}

	function isPhaseActive(phase: any): boolean {
		try {
			const now = new Date();
			const start = parseISO(phase.start_date);
			const end = parseISO(phase.end_date);
			return isWithinInterval(now, { start, end });
		} catch {
			return false;
		}
	}

	function handlePhaseClick(phase: any) {
		if (phase.projects?.slug) {
			window.open(`/projects/${phase.projects.slug}`, '_blank');
		}
	}

	$: totalPhases = phases.length;
	$: activePhases = phases.filter(isPhaseActive).length;
</script>

<div
	class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700"
>
	<!-- Header -->
	<div class="p-6 sm:p-8 border-b border-gray-100 dark:border-gray-700">
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
			<div class="flex items-center gap-4">
				<div
					class="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg"
				>
					<Layers class="h-6 w-6 text-white" />
				</div>
				<div>
					<h2 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
						Project Phases
					</h2>
					<p class="text-sm text-gray-600 dark:text-gray-400 font-medium">
						Track your project timeline and milestones
					</p>
				</div>
			</div>

			<div class="flex items-center justify-between sm:justify-end gap-6">
				<div class="flex items-center gap-6">
					<div class="text-center">
						<div class="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
							{activePhases}
						</div>
						<div class="text-sm text-gray-500 dark:text-gray-400 font-medium">
							Active
						</div>
					</div>

					<!-- Mobile view toggle -->
					<div
						class="sm:hidden flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-1"
					>
						<button
							on:click={() => (mobileView = 'list')}
							class="px-4 py-2 text-sm font-medium rounded-lg transition-all {mobileView ===
							'list'
								? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white'
								: 'text-gray-600 dark:text-gray-400'}"
						>
							List
						</button>
						<button
							on:click={() => (mobileView = 'week')}
							class="px-4 py-2 text-sm font-medium rounded-lg transition-all {mobileView ===
							'week'
								? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white'
								: 'text-gray-600 dark:text-gray-400'}"
						>
							Week
						</button>
					</div>
				</div>

				<!-- Desktop calendar navigation -->
				<div
					class="hidden sm:flex items-center gap-3 bg-gray-100 dark:bg-gray-800 rounded-xl p-1"
				>
					<Button
						on:click={() => navigateCalendar('prev')}
						variant="ghost"
						size="md"
						class="w-10 h-10 rounded-lg"
						title="Previous week"
					>
						<ChevronLeft class="h-5 w-5" />
					</Button>

					<button
						on:click={resetToToday}
						class="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
					>
						{format(startDate, 'MMM yyyy')}
					</button>

					<Button
						on:click={() => navigateCalendar('next')}
						variant="ghost"
						size="md"
						class="w-10 h-10 rounded-lg"
						title="Next week"
					>
						<ChevronRight class="h-5 w-5" />
					</Button>
				</div>
			</div>
		</div>
	</div>

	<!-- Content -->
	<div class="p-4 sm:p-6">
		{#if totalPhases === 0}
			<!-- Empty state -->
			<div class="text-center py-8 sm:py-12">
				<Layers
					class="h-10 w-10 sm:h-12 sm:w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4"
				/>
				<h3 class="text-base sm:text-lg font-medium text-gray-900 dark:text-white mb-2">
					No project phases
				</h3>
				<p class="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
					Create projects with phases to break down large projects into manageable stages.
				</p>
				<a href="/projects">
					<Button variant="primary" size="md">
						<FolderOpen class="h-4 w-4 mr-2" />
						Create project
					</Button>
				</a>
			</div>
		{:else}
			<!-- Mobile List View -->
			{#if mobileView === 'list'}
				<div class="sm:hidden space-y-4">
					{#each sortedPhases as phase, index}
						{@const active = isPhaseActive(phase)}
						{@const colorConfig = getPhaseColorConfig(phase)}
						<button
							on:click={() => handlePhaseClick(phase)}
							class="w-full text-left p-5 rounded-2xl border-2 transition-all duration-200 hover:shadow-lg hover:scale-[1.02] min-h-[88px] bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700"
							style={active
								? `border-color: ${colorConfig.hex}; box-shadow: 0 0 0 1px ${colorConfig.hex}20;`
								: ''}
						>
							<div class="flex items-start justify-between mb-3">
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2 mb-1">
										<div
											class="w-3 h-3 rounded-full flex-shrink-0"
											style="background-color: {colorConfig.hex};"
											aria-label="Phase color indicator"
										></div>
										<h4
											class="font-semibold text-base text-gray-900 dark:text-white truncate"
										>
											{phase.name}
										</h4>
									</div>
									{#if phase.projects?.name}
										<p
											class="text-sm text-gray-600 dark:text-gray-400 font-medium"
										>
											{phase.projects.name}
										</p>
									{/if}
								</div>
								{#if active}
									<span
										class="flex-shrink-0 text-sm px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full font-medium"
									>
										Active
									</span>
								{/if}
							</div>
							<div
								class="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400"
							>
								<div class="flex items-center gap-2">
									<Calendar class="h-4 w-4 text-gray-400" />
									<span class="font-medium">
										{formatPhaseDate(phase.start_date)} - {formatPhaseDate(
											phase.end_date
										)}
									</span>
								</div>
								<div class="flex items-center gap-2">
									<Clock class="h-4 w-4 text-gray-400" />
									<span class="font-medium">{getPhaseDuration(phase)}</span>
								</div>
							</div>
							<div class="mt-2 flex items-center justify-end">
								<ExternalLink class="h-4 w-4 text-gray-400" />
							</div>
						</button>
					{/each}
				</div>
			{/if}

			<!-- Mobile Week View (Scrollable) -->
			{#if mobileView === 'week'}
				<div class="sm:hidden">
					<!-- Week navigation -->
					<div class="flex items-center justify-between mb-6">
						<Button
							on:click={() => navigateCalendar('prev')}
							variant="ghost"
							size="md"
							class="w-12 h-12 rounded-xl"
						>
							<ChevronLeft class="h-5 w-5" />
						</Button>
						<button
							on:click={resetToToday}
							class="px-4 py-2 text-sm font-semibold rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
						>
							{format(startDate, 'MMM d')} - {format(addDays(startDate, 6), 'MMM d')}
						</button>
						<Button
							on:click={() => navigateCalendar('next')}
							variant="ghost"
							size="md"
							class="w-12 h-12 rounded-xl"
						>
							<ChevronRight class="h-5 w-5" />
						</Button>
					</div>

					<!-- Scrollable week view -->
					<div class="overflow-x-auto -mx-4 px-4 pb-4">
						<div class="inline-flex gap-3 min-w-full">
							{#each calendarDays.slice(0, 7) as day}
								{@const dayPhases = getPhasesForDate(day.dateStr)}
								<div class="min-w-[140px] flex-shrink-0">
									<!-- Day header -->
									<div
										class="text-center mb-4 pb-3 border-b-2 border-gray-100 dark:border-gray-700"
									>
										<div
											class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1"
										>
											{day.dayName}
										</div>
										<div
											class="text-xl font-bold {day.isToday
												? 'text-indigo-600 dark:text-indigo-400'
												: 'text-gray-900 dark:text-white'}"
										>
											{day.dayNumber}
										</div>
										{#if day.isToday}
											<div
												class="w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-full mx-auto mt-2"
											></div>
										{/if}
									</div>

									<!-- Phases -->
									<div class="space-y-2 min-h-[120px]">
										{#each dayPhases as phase, index}
											{@const colorConfig = getPhaseColorConfig(phase)}
											<button
												on:click={() => handlePhaseClick(phase)}
												class={`w-full p-3 text-sm rounded-xl transition-all duration-200 hover:shadow-md hover:scale-105 min-h-[48px] flex items-center justify-center ${colorConfig.textClass}`}
												style={`background-color: ${colorConfig.hex};`}
											>
												<div class="font-medium leading-tight text-center">
													{phase.name}
												</div>
											</button>
										{/each}
										{#if dayPhases.length === 0}
											<div
												class="text-center py-8 text-sm text-gray-400 dark:text-gray-500 font-medium"
											>
												No phases
											</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<!-- Desktop Calendar View -->
			<div class="hidden sm:block">
				<!-- Days header -->
				<div class="grid grid-cols-7 gap-3 mb-6">
					{#each ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as dayName, index}
						<div
							class="text-center text-sm font-semibold text-gray-600 dark:text-gray-400 py-3"
						>
							<span class="hidden lg:inline">{dayName}</span>
							<span class="lg:hidden">{dayName.slice(0, 3)}</span>
						</div>
					{/each}
				</div>

				<!-- Calendar weeks -->
				<div class="space-y-6">
					{#each weekRows as week}
						{@const { bars: phaseBars, laneCount } = getContinuousPhases(week)}
						{@const phaseAreaHeight = Math.max(
							laneCount * (PHASE_ROW_HEIGHT + PHASE_ROW_GAP) + 24,
							120
						)}
						<div class="relative">
							<!-- Day headers -->
							<div class="grid grid-cols-7 gap-3 mb-4">
								{#each week as day}
									<div
										class="text-center p-3 border-2 border-gray-100 dark:border-gray-700 rounded-t-2xl bg-gray-50 dark:bg-gray-800/50"
									>
										<span
											class="text-sm font-bold {day.isToday
												? 'text-white bg-indigo-600 dark:bg-indigo-500 w-7 h-7 rounded-full flex items-center justify-center mx-auto'
												: 'text-gray-800 dark:text-gray-200'}"
										>
											{day.dayNumber}
										</span>
									</div>
								{/each}
							</div>

							<div class="relative" style={`height: ${phaseAreaHeight}px;`}>
								<!-- Calendar grid background -->
								<div class="grid grid-cols-7 gap-3 h-full">
									{#each week as day}
										<div
											class="h-full border-2 border-gray-100 dark:border-gray-700 rounded-b-2xl bg-white dark:bg-gray-800"
										></div>
									{/each}
								</div>

								<!-- Continuous phase bars overlay -->
								<div class="absolute inset-0">
									<div
										class="grid grid-cols-7 gap-x-3 gap-y-2 h-full"
										style={`grid-auto-rows: ${PHASE_ROW_HEIGHT}px;`}
									>
										{#each phaseBars as phaseBar}
											{@const colorConfig = getPhaseColorConfig(phaseBar)}
											{@const radiusClasses =
												phaseBar.isStart && phaseBar.isEnd
													? 'rounded-xl'
													: `${phaseBar.isStart ? 'rounded-l-xl' : 'rounded-l-md'} ${phaseBar.isEnd ? 'rounded-r-xl' : 'rounded-r-md'}`}
											<button
												on:click={() => handlePhaseClick(phaseBar)}
												class={`w-full h-full px-3 text-sm font-semibold transition-all duration-200 hover:shadow-lg hover:scale-[1.01] flex items-center justify-center shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900/0 ${colorConfig.textClass} ${radiusClasses}`}
												style={`grid-column: ${phaseBar.startCol + 1} / span ${phaseBar.span}; grid-row: ${phaseBar.lane + 1}; background-color: ${colorConfig.hex};`}
												title="{phaseBar.name} • {phaseBar.projects?.name ||
													'No Project'} • ({formatPhaseDate(
													phaseBar.start_date
												)} - {formatPhaseDate(phaseBar.end_date)})"
											>
												<div
													class="truncate text-center leading-tight font-semibold"
												>
													{phaseBar.name}
												</div>
											</button>
										{/each}
									</div>
								</div>
							</div>

							<!-- Phase overflow indicators -->
							<div class="grid grid-cols-7 gap-3 mt-2">
								{#each week as day}
									{@const dayPhases = getPhasesForDate(day.dateStr)}
									{@const overflowCount = Math.max(
										dayPhases.length - laneCount,
										0
									)}
									{#if overflowCount > 0}
										<div class="text-center">
											<span
												class="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-lg"
											>
												+{overflowCount}
											</span>
										</div>
									{:else}
										<div></div>
									{/if}
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Footer -->
		<div class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
			<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
				<div
					class="flex flex-wrap items-center gap-6 text-sm text-gray-600 dark:text-gray-400"
				>
					<div class="flex items-center gap-2">
						<div class="w-2 h-2 bg-gray-400 rounded-full"></div>
						<span class="font-medium">{totalPhases} total phases</span>
					</div>
					<div class="flex items-center gap-2">
						<div class="w-2 h-2 bg-green-500 rounded-full"></div>
						<span class="font-medium">{activePhases} active</span>
					</div>
					<div class="hidden sm:flex items-center gap-2">
						<div class="w-2 h-2 bg-indigo-500 rounded-full"></div>
						<span class="font-medium">Next 3 weeks view</span>
					</div>
				</div>

				<Button
					href="/projects"
					variant="ghost"
					size="sm"
					class="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
				>
					View all projects
					<ArrowRight class="w-4 h-4" />
				</Button>
			</div>
		</div>
	</div>
</div>
