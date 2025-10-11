<!-- apps/web/src/lib/components/dashboard/BraindumpWeekView.svelte -->
<script lang="ts">
	import { Brain, Plus, ChevronRight } from 'lucide-svelte';
	import { format, addDays, isSameDay, parseISO } from 'date-fns';
	import { createEventDispatcher } from 'svelte';
	import BraindumpModal from '$lib/components/history/BraindumpModalHistory.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { getProjectColor } from '$lib/utils/project-colors';

	// Props - Accept data from dashboard
	export let data: any = {};

	const dispatch = createEventDispatcher();

	// Extract braindumps data properly
	$: braindumpsByDate = data?.braindumpsByDate || {};
	$: braindumps = data?.braindumps || [];

	// Modal state
	let selectedBraindump: any = null;
	let showBraindumpModal = false;

	// Generate the last 7 days
	const today = new Date();
	$: weekDays = Array.from({ length: 7 }, (_, i) => {
		const date = addDays(today, -6 + i);
		return {
			date,
			dateStr: format(date, 'yyyy-MM-dd'),
			isToday: isSameDay(date, today),
			dayName: format(date, 'EEE'),
			dayNumber: format(date, 'd'),
			monthName: format(date, 'MMM'),
			fullDate: format(date, 'MMM d')
		};
	});

	function getBraindumpsForDate(dateStr: string): any[] {
		return braindumpsByDate[dateStr] || [];
	}

	function handleBraindumpClick(braindump: any) {
		selectedBraindump = braindump;
		showBraindumpModal = true;
	}

	function handleCloseModal() {
		showBraindumpModal = false;
		selectedBraindump = null;
	}

	function formatTime(dateString: string): string {
		try {
			return format(parseISO(dateString), 'h:mm a');
		} catch {
			return '';
		}
	}

	function getTotalBraindumps(): number {
		return Object.values(braindumpsByDate).reduce((total, day: any) => total + day.length, 0);
	}

	// Group braindumps by day for mobile view
	$: mobileBraindumpDays = weekDays
		.map((day) => ({
			...day,
			braindumps: getBraindumpsForDate(day.dateStr)
		}))
		.filter((day) => day.braindumps.length > 0 || day.isToday);
</script>

<div
	class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700"
>
	<!-- Header -->
	<div class="p-2 sm:p-4 border-b border-gray-200 dark:border-gray-700">
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
			<h2
				class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white flex items-center"
			>
				<Brain class="mr-2 h-5 w-5 text-purple-600 dark:text-purple-400" />
				Recent Braindumps
			</h2>
			<div class="flex items-center justify-between sm:justify-end gap-4">
				<div class="flex items-center gap-2">
					<span class="text-2xl font-bold text-purple-600 dark:text-purple-400">
						{getTotalBraindumps()}
					</span>
					<span class="text-sm text-gray-500 dark:text-gray-400">Last 7 days</span>
				</div>
				<!-- Brain dump button removed - now using modal instead -->
			</div>
		</div>
	</div>

	<!-- Content -->
	<div class="p-2 sm:p-4">
		{#if getTotalBraindumps() === 0}
			<!-- Empty state -->
			<div class="text-center py-8 sm:py-12">
				<Brain
					class="h-10 w-10 sm:h-12 sm:w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4"
				/>
				<h3 class="text-base sm:text-lg font-medium text-gray-900 dark:text-white mb-2">
					No recent braindumps
				</h3>
				<p class="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
					Start capturing your thoughts and ideas. Your braindumps will appear here.
				</p>
				<Button variant="primary" size="md" on:click={() => dispatch('openBrainDump')}>
					<Plus class="h-4 w-4 mr-2" />
					Create your first braindump
				</Button>
			</div>
		{:else}
			<!-- Mobile View: Vertical List -->
			<div class="block sm:hidden space-y-4">
				{#each mobileBraindumpDays as day}
					<div
						class="border-l-2 {day.isToday
							? 'border-purple-500'
							: 'border-gray-200 dark:border-gray-700'} pl-4"
					>
						<!-- Day header -->
						<div class="flex items-center justify-between mb-2">
							<div class="flex items-center gap-2">
								<span
									class="text-sm font-medium {day.isToday
										? 'text-purple-600 dark:text-purple-400'
										: 'text-gray-700 dark:text-gray-300'}"
								>
									{day.fullDate}
								</span>
								<span class="text-xs text-gray-500 dark:text-gray-400">
									{day.dayName}
								</span>
								{#if day.isToday}
									<span
										class="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full"
									>
										Today
									</span>
								{/if}
							</div>
							{#if day.braindumps.length > 0}
								<span class="text-xs text-gray-500 dark:text-gray-400">
									{day.braindumps.length}
									{day.braindumps.length === 1 ? 'entry' : 'entries'}
								</span>
							{/if}
						</div>

						<!-- Braindumps for this day -->
						{#if day.braindumps.length > 0}
							<div class="space-y-2">
								{#each day.braindumps as braindump}
									<button
										on:click={() => handleBraindumpClick(braindump)}
										class="w-full text-left p-3 rounded-lg border transition-all hover:shadow-md
											{braindump.projects
											? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30'
											: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/30'}"
									>
										<div class="flex items-start justify-between mb-1">
											<h4
												class="font-medium text-sm text-gray-900 dark:text-white flex-1 mr-2"
											>
												{braindump.title || 'Untitled'}
											</h4>
											<span class="text-xs text-gray-500 dark:text-gray-400">
												{formatTime(braindump.created_at)}
											</span>
										</div>
										{#if braindump.ai_summary}
											<p
												class="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-2"
											>
												{braindump.ai_summary}
											</p>
										{:else if braindump.content}
											<p
												class="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-2"
											>
												{braindump.content.substring(0, 100)}...
											</p>
										{/if}
										{#if braindump.projects}
											<div
												class="flex items-center text-xs text-blue-600 dark:text-blue-400"
											>
												<div
													class="w-2 h-2 bg-current rounded-full mr-1.5"
												></div>
												<span>{braindump.projects.name}</span>
											</div>
										{/if}
									</button>
								{/each}
							</div>
						{:else}
							<div class="text-xs text-gray-400 dark:text-gray-500 italic">
								No braindumps
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<!-- Desktop View: Week Grid -->
			<div class="hidden sm:grid sm:grid-cols-7 gap-3 lg:gap-4">
				{#each weekDays as day}
					{@const dayBraindumps = getBraindumpsForDate(day.dateStr)}
					<div class="flex flex-col">
						<!-- Day header -->
						<div
							class="text-center mb-2 pb-2 border-b border-gray-200 dark:border-gray-700"
						>
							<div class="text-xs font-medium text-gray-600 dark:text-gray-400">
								{day.dayName}
							</div>
							<div class="flex items-center justify-center mt-1">
								<span
									class="text-base font-semibold {day.isToday
										? 'text-purple-600 dark:text-purple-400'
										: 'text-gray-900 dark:text-white'}"
								>
									{day.dayNumber}
								</span>
								<span class="text-xs text-gray-500 dark:text-gray-400 ml-1">
									{day.monthName}
								</span>
							</div>
							{#if day.isToday}
								<div
									class="w-1.5 h-1.5 bg-purple-600 dark:bg-purple-400 rounded-full mx-auto mt-1"
								></div>
							{/if}
						</div>

						<!-- Braindumps for this day -->
						<div class="space-y-2 min-h-[120px]">
							{#if dayBraindumps.length > 0}
								{#each dayBraindumps.slice(0, 3) as braindump}
									<button
										on:click={() => handleBraindumpClick(braindump)}
										class="w-full text-left p-2 rounded-lg border text-xs transition-all hover:shadow-md hover:scale-105
											{braindump.projects
											? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30'
											: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/30'}"
									>
										<div
											class="font-medium truncate mb-1 text-gray-900 dark:text-white"
										>
											{braindump.title || 'Untitled'}
										</div>
										<div class="text-gray-500 dark:text-gray-400 mb-1">
											{formatTime(braindump.created_at)}
										</div>
										{#if braindump.projects}
											{@const projectColor = getProjectColor(
												braindump.projects
											)}
											<div
												class="flex items-center"
												style="color: {projectColor.hex};"
											>
												<div
													class="w-1.5 h-1.5 rounded-full mr-1"
													style="background-color: {projectColor.hex};"
												></div>
												<span class="truncate"
													>{braindump.projects.name}</span
												>
											</div>
										{/if}
									</button>
								{/each}
								{#if dayBraindumps.length > 3}
									<div class="text-center">
										<span class="text-xs text-gray-500 dark:text-gray-400">
											+{dayBraindumps.length - 3} more
										</span>
									</div>
								{/if}
							{:else}
								<div class="flex items-center justify-center h-full min-h-[80px]">
									<div class="text-center">
										<Brain
											class="w-5 h-5 text-gray-300 dark:text-gray-600 mx-auto mb-1"
										/>
										<span class="text-xs text-gray-400 dark:text-gray-500"
											>Empty</span
										>
									</div>
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Footer actions -->
		<div
			class="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
		>
			<div class="flex flex-wrap items-center gap-3 sm:gap-4 text-xs">
				<div class="flex items-center gap-1.5">
					<div
						class="w-3 h-3 bg-blue-500 dark:bg-blue-400 rounded border border-blue-300 dark:border-blue-600"
					></div>
					<span class="text-gray-600 dark:text-gray-400">Project-linked</span>
				</div>
				<div class="flex items-center gap-1.5">
					<div
						class="w-3 h-3 bg-purple-500 dark:bg-purple-400 rounded border border-purple-300 dark:border-purple-600"
					></div>
					<span class="text-gray-600 dark:text-gray-400">General notes</span>
				</div>
			</div>

			<div class="flex items-center gap-3">
				<a
					href="/history"
					class="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
				>
					View all
					<ChevronRight class="w-4 h-4 ml-1" />
				</a>
				<Button
					variant="primary"
					size="sm"
					class="hidden sm:block"
					on:click={() => dispatch('openBrainDump')}
				>
					New braindump
					<Plus class="h-4 w-4 ml-2" />
				</Button>
			</div>
		</div>
	</div>
</div>

<!-- Braindump detail modal -->
{#if showBraindumpModal && selectedBraindump}
	<BraindumpModal
		braindump={selectedBraindump}
		isOpen={showBraindumpModal}
		onClose={handleCloseModal}
	/>
{/if}

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
