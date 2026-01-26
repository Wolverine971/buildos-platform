<!-- apps/web/src/lib/components/time-blocks/AvailableSlotList.svelte -->
<script lang="ts">
	import type { AvailableSlot } from '$lib/types/time-blocks';
	import { formatSlotDuration, formatTimeRange } from '$lib/utils/slot-finder';

	let {
		availableSlots = [],
		onSlotClick
	}: {
		availableSlots?: AvailableSlot[];
		onSlotClick?: (slot: AvailableSlot) => void;
	} = $props();

	let isExpanded = $state(true);

	// Group slots by day
	let slotsByDay = $derived.by(() => {
		const grouped = new Map<string, AvailableSlot[]>();

		availableSlots.forEach((slot) => {
			const dateKey = slot.dayDate.toISOString().split('T')[0];
			if (!grouped.has(dateKey)) {
				grouped.set(dateKey, []);
			}
			grouped.get(dateKey)!.push(slot);
		});

		// Sort slots within each day by start time
		grouped.forEach((slots) => {
			slots.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
		});

		// Convert to array and sort by date
		return Array.from(grouped.entries())
			.sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
			.map(([dateKey, slots]) => ({
				dateKey,
				date: slots[0].dayDate,
				slots
			}));
	});

	function formatDayHeader(date: Date): string {
		const today = new Date();
		const tomorrow = new Date(today);
		tomorrow.setDate(tomorrow.getDate() + 1);

		if (isSameDay(date, today)) {
			return 'Today';
		} else if (isSameDay(date, tomorrow)) {
			return 'Tomorrow';
		} else {
			return date.toLocaleDateString('en-US', {
				weekday: 'short',
				month: 'short',
				day: 'numeric'
			});
		}
	}

	function isSameDay(date1: Date, date2: Date): boolean {
		return (
			date1.getFullYear() === date2.getFullYear() &&
			date1.getMonth() === date2.getMonth() &&
			date1.getDate() === date2.getDate()
		);
	}

	function handleSlotClick(slot: AvailableSlot) {
		if (onSlotClick) {
			onSlotClick(slot);
		}
	}
</script>

{#if availableSlots.length > 0}
	<div class="available-slot-list">
		<!-- Section Header -->
		<button
			type="button"
			class="section-header"
			onclick={() => (isExpanded = !isExpanded)}
			aria-expanded={isExpanded}
		>
			<div class="flex items-center gap-2">
				<svg
					class="h-5 w-5 transition-transform duration-200 {isExpanded
						? 'rotate-0'
						: '-rotate-90'}"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M19 9l-7 7-7-7"
					/>
				</svg>
				<span class="font-semibold">Available Time Slots</span>
				<span class="count-badge">{availableSlots.length}</span>
			</div>
		</button>

		<!-- Slots List (collapsible) -->
		{#if isExpanded}
			<div class="slots-content">
				{#each slotsByDay as { date, slots }}
					<div class="day-group">
						<!-- Day Header -->
						<div class="day-header">
							<svg
								class="h-4 w-4 text-emerald-600 dark:text-emerald-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
								/>
							</svg>
							<span>{formatDayHeader(date)}</span>
						</div>

						<!-- Slots for this day -->
						<div class="day-slots">
							{#each slots as slot}
								<button
									type="button"
									class="slot-item group"
									onclick={() => handleSlotClick(slot)}
								>
									<div class="slot-info">
										<div class="slot-time">
											{formatTimeRange(slot.startTime, slot.endTime)}
										</div>
										<div class="slot-duration">
											{formatSlotDuration(slot.duration)}
										</div>
									</div>
									<div class="slot-action">
										Create Block
										<svg
											class="h-4 w-4 transition-transform group-hover:translate-x-1"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M13 7l5 5m0 0l-5 5m5-5H6"
											/>
										</svg>
									</div>
								</button>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{:else}
	<!-- Empty state -->
	<div class="empty-state">
		<div class="empty-icon">
			<svg
				class="h-12 w-12 text-muted-foreground"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
				/>
			</svg>
		</div>
		<p class="empty-title">No available slots found</p>
		<p class="empty-description">
			Adjust the slot finder settings below to find more time slots
		</p>
	</div>
{/if}

<style lang="postcss">
	.available-slot-list {
		@apply rounded-2xl border border-emerald-200 bg-emerald-50 shadow-ink;
		@apply dark:border-emerald-500 dark:bg-emerald-900;
	}

	.section-header {
		@apply w-full px-6 py-4 text-left transition-colors;
		@apply text-emerald-900 dark:text-emerald-100;
		@apply hover:bg-emerald-100 dark:hover:bg-emerald-900;
		@apply focus:outline-none focus:ring-2 focus:ring-emerald-500/40;
		border-radius: 1rem 1rem 0 0;
	}

	.count-badge {
		@apply inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-2 text-xs font-bold;
		@apply bg-emerald-500 text-white;
		@apply dark:bg-emerald-600;
	}

	.slots-content {
		@apply space-y-4 px-6 py-4;
	}

	.day-group {
		@apply space-y-2;
	}

	.day-header {
		@apply flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300;
	}

	.day-slots {
		@apply space-y-2 pl-6;
	}

	.slot-item {
		@apply flex w-full items-center justify-between rounded-lg border border-emerald-200 bg-card px-4 py-3 text-left transition-all shadow-ink;
		@apply hover:border-emerald-400 hover:bg-emerald-50 hover:shadow-ink-strong;
		@apply dark:border-emerald-700 dark:bg-card;
		@apply dark:hover:border-emerald-500 dark:hover:bg-emerald-900;
		@apply focus:outline-none focus:ring-2 focus:ring-emerald-500/40;
	}

	.slot-info {
		@apply flex-1;
	}

	.slot-time {
		@apply text-sm font-medium text-foreground;
	}

	.slot-duration {
		@apply mt-1 text-xs text-muted-foreground;
	}

	.slot-action {
		@apply flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400;
	}

	.empty-state {
		@apply flex flex-col items-center justify-center rounded-2xl border border-border bg-muted px-8 py-12 text-center shadow-ink-inner;
		@apply dark:border-border dark:bg-muted;
	}

	.empty-icon {
		@apply mb-4;
	}

	.empty-title {
		@apply mb-2 text-base font-semibold text-foreground;
	}

	.empty-description {
		@apply text-sm text-muted-foreground;
	}
</style>
