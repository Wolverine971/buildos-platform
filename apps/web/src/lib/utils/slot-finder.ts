// apps/web/src/lib/utils/slot-finder.ts

import type { TimeBlockWithProject } from '@buildos/shared-types';
import type { CalendarEvent } from '$lib/services/calendar-service';
import type { AvailableSlot, SlotFinderConfig, OccupiedTimeSlot } from '$lib/types/time-play';

/**
 * Calculates available time slots based on calendar events, time blocks, and configuration
 *
 * @param blocks - Existing time blocks
 * @param calendarEvents - Google Calendar events
 * @param config - Slot finder configuration
 * @param days - Array of days to analyze
 * @returns Array of available slots
 */
export function calculateAvailableSlots(
	blocks: TimeBlockWithProject[],
	calendarEvents: CalendarEvent[],
	config: SlotFinderConfig,
	days: Date[]
): AvailableSlot[] {
	if (!config.enabled) {
		return [];
	}

	const slots: AvailableSlot[] = [];

	for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
		const dayDate = days[dayIndex];
		if (!dayDate) continue;

		// 1. Define day boundaries based on config
		const dayStart = new Date(dayDate);
		dayStart.setHours(config.earliestStart, 0, 0, 0);

		const dayEnd = new Date(dayDate);
		dayEnd.setHours(config.latestEnd, 0, 0, 0);

		// 2. Get all occupied slots for this day (with buffer applied)
		const occupied = getOccupiedSlotsForDay(dayDate, blocks, calendarEvents, config.bufferTime);

		// DEBUG: Log Saturday processing
		const dayName = dayDate.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
		console.log(`[SlotFinder] ${dayName}:`, {
			dayStart: dayStart.toLocaleTimeString(),
			dayEnd: dayEnd.toLocaleTimeString(),
			occupiedCount: occupied.length,
			occupied: occupied.map((o) => ({
				type: o.type,
				start: o.start.toLocaleTimeString(),
				end: o.end.toLocaleTimeString()
			}))
		});

		// 3. Clip occupied slots to day boundaries (buffer might extend beyond)
		const clippedOccupied = clipSlotsToBoundaries(occupied, dayStart, dayEnd, dayName);

		console.log(`[SlotFinder] ${dayName} after clipping:`, {
			clippedCount: clippedOccupied.length,
			clipped: clippedOccupied.map((o) => ({
				type: o.type,
				start: o.start.toLocaleTimeString(),
				end: o.end.toLocaleTimeString()
			}))
		});

		// 4. Sort by start time for gap detection
		clippedOccupied.sort((a, b) => a.start.getTime() - b.start.getTime());

		// 5. Merge overlapping occupied slots
		const mergedOccupied = mergeOverlappingSlots(clippedOccupied);

		console.log(`[SlotFinder] ${dayName} after merging:`, {
			mergedCount: mergedOccupied.length,
			merged: mergedOccupied.map((o) => ({
				start: o.start.toLocaleTimeString(),
				end: o.end.toLocaleTimeString()
			}))
		});

		// 6. Find gaps between occupied slots
		const gaps = findGaps(mergedOccupied, dayStart, dayEnd);
		if (dayName === 'Sat, Oct 18') {
			console.log(dayName);
		}

		console.log(`[SlotFinder] ${dayName} gaps found:`, {
			gapCount: gaps.length,
			gaps: gaps.map((g) => ({
				start: g.start.toLocaleTimeString(),
				end: g.end.toLocaleTimeString(),
				minutes: Math.round((g.end.getTime() - g.start.getTime()) / (1000 * 60))
			}))
		});

		// 7. Filter gaps that are at least minDuration
		const validGaps = gaps.filter((gap) => {
			const duration = (gap.end.getTime() - gap.start.getTime()) / (1000 * 60);
			return duration >= config.minDuration;
		});

		// 8. Subdivide gaps into multiple slots of minDuration
		// This allows a 5-hour gap to create five 1-hour slots, for example
		validGaps.forEach((gap, gapIndex) => {
			let currentStart = new Date(gap.start);
			let slotIndex = 0;

			while (currentStart < gap.end) {
				const remainingMs = gap.end.getTime() - currentStart.getTime();
				const remainingMinutes = remainingMs / (1000 * 60);

				// If remaining time is less than minDuration, stop
				if (remainingMinutes < config.minDuration) {
					break;
				}

				// Calculate slot duration (use minDuration, but cap at maxDuration and remaining time)
				// This ensures we don't create slots larger than maxDuration
				const slotDurationMinutes = Math.min(
					config.minDuration,
					config.maxDuration,
					remainingMinutes
				);

				const slotEnd = new Date(currentStart.getTime() + slotDurationMinutes * 60 * 1000);
				const dateStr = dayDate.toISOString().split('T')[0];
				const timeStr = currentStart.toTimeString().slice(0, 5).replace(':', '');

				slots.push({
					id: `slot-${dateStr}-${timeStr}-gap${gapIndex}-${slotIndex}`,
					startTime: new Date(currentStart),
					endTime: new Date(slotEnd),
					duration: Math.round(slotDurationMinutes),
					dayIndex,
					dayDate: new Date(dayDate)
				});

				slotIndex++;
				currentStart = new Date(slotEnd);
			}
		});
	}

	return slots;
}

/**
 * Gets all occupied time slots for a specific day
 * Applies buffer time around each occupied slot
 */
function getOccupiedSlotsForDay(
	dayDate: Date,
	blocks: TimeBlockWithProject[],
	calendarEvents: CalendarEvent[],
	bufferTime: number
): OccupiedTimeSlot[] {
	const occupied: OccupiedTimeSlot[] = [];

	// Add time blocks with buffer
	blocks.forEach((block) => {
		const blockStart = new Date(block.start_time);
		if (isSameDay(blockStart, dayDate)) {
			const blockEnd = new Date(block.end_time);
			const start = new Date(blockStart.getTime() - bufferTime * 60 * 1000);
			const end = new Date(blockEnd.getTime() + bufferTime * 60 * 1000);
			occupied.push({ start, end, type: 'block', id: block.id });
		}
	});

	// Add calendar events with buffer
	calendarEvents.forEach((event) => {
		const eventStartStr = event.start.dateTime || event.start.date;
		const eventEndStr = event.end.dateTime || event.end.date;

		if (!eventStartStr || !eventEndStr) return;

		const eventStart = new Date(eventStartStr);
		const eventEnd = new Date(eventEndStr);

		if (isSameDay(eventStart, dayDate)) {
			// Handle all-day events - they occupy the entire configured time range
			if (event.start.date && !event.start.dateTime) {
				// All-day event - mark entire day as occupied (no buffer for all-day events)
				const start = new Date(dayDate);
				start.setHours(0, 0, 0, 0);
				const end = new Date(dayDate);
				end.setHours(23, 59, 59, 999);
				occupied.push({ start, end, type: 'event', id: event.id });
			} else {
				// Timed event - apply buffer
				const start = new Date(eventStart.getTime() - bufferTime * 60 * 1000);
				const end = new Date(eventEnd.getTime() + bufferTime * 60 * 1000);
				occupied.push({ start, end, type: 'event', id: event.id });
			}
		}
	});

	return occupied;
}

/**
 * Clips occupied slots to day boundaries
 * This ensures buffer times don't extend beyond the configured time window
 */
function clipSlotsToBoundaries(
	slots: OccupiedTimeSlot[],
	dayStart: Date,
	dayEnd: Date,
	dayName: string
): OccupiedTimeSlot[] {
	const clipped: OccupiedTimeSlot[] = [];
	if (dayName === 'Sat, Oct 18') {
		console.log(dayName);
	}

	for (const slot of slots) {
		// Skip slots completely outside day boundaries
		if (slot.end <= dayStart || slot.start >= dayEnd) {
			continue;
		}

		// Clip slot to fit within day boundaries
		const clippedSlot: OccupiedTimeSlot = {
			start: new Date(Math.max(slot.start.getTime(), dayStart.getTime())),
			end: new Date(Math.min(slot.end.getTime(), dayEnd.getTime())),
			type: slot.type,
			id: slot.id
		};

		clipped.push(clippedSlot);
	}

	return clipped;
}

/**
 * Merges overlapping occupied time slots
 * This prevents false gaps when events overlap
 */
function mergeOverlappingSlots(slots: OccupiedTimeSlot[]): OccupiedTimeSlot[] {
	if (slots.length === 0) return [];

	const merged: OccupiedTimeSlot[] = [];
	let current = { ...slots[0] };

	for (let i = 1; i < slots.length; i++) {
		const next = slots[i];

		// If current overlaps with next, merge them
		if (current.end >= next.start) {
			current.end = new Date(Math.max(current.end.getTime(), next.end.getTime()));
			current.id = `${current.id}+${next.id}`; // Combine IDs
		} else {
			// No overlap, save current and move to next
			merged.push(current);
			current = { ...next };
		}
	}

	// Don't forget the last slot
	merged.push(current);

	return merged;
}

/**
 * Finds gaps (available time) between occupied slots
 */
function findGaps(
	occupied: OccupiedTimeSlot[],
	dayStart: Date,
	dayEnd: Date
): Array<{ start: Date; end: Date }> {
	const gaps: Array<{ start: Date; end: Date }> = [];

	if (occupied.length === 0) {
		// Entire day is available
		return [{ start: dayStart, end: dayEnd }];
	}

	// Gap before first occupied slot
	const firstSlot = occupied[0];
	if (firstSlot.start > dayStart) {
		gaps.push({
			start: new Date(dayStart),
			end: new Date(firstSlot.start)
		});
	}

	// Gaps between occupied slots
	for (let i = 0; i < occupied.length - 1; i++) {
		const currentEnd = occupied[i].end;
		const nextStart = occupied[i + 1].start;

		if (currentEnd < nextStart) {
			gaps.push({
				start: new Date(currentEnd),
				end: new Date(nextStart)
			});
		}
	}

	// Gap after last occupied slot
	const lastSlot = occupied[occupied.length - 1];
	if (lastSlot.end < dayEnd) {
		gaps.push({
			start: new Date(lastSlot.end),
			end: new Date(dayEnd)
		});
	}

	return gaps;
}

/**
 * Checks if two dates are on the same day
 */
function isSameDay(date1: Date, date2: Date): boolean {
	return (
		date1.getFullYear() === date2.getFullYear() &&
		date1.getMonth() === date2.getMonth() &&
		date1.getDate() === date2.getDate()
	);
}

/**
 * Formats duration in minutes to human-readable string
 * Examples: "30 min", "90 min", "2 hrs", "3.5 hrs"
 */
export function formatSlotDuration(minutes: number): string {
	if (minutes < 60) {
		return `${minutes} min`;
	}

	const hours = minutes / 60;
	if (hours === Math.floor(hours)) {
		return `${hours} hr${hours > 1 ? 's' : ''}`;
	}

	return `${hours.toFixed(1)} hrs`;
}

/**
 * Formats time range for display
 * Example: "9:00 AM - 10:30 AM"
 */
export function formatTimeRange(start: Date, end: Date): string {
	const formatTime = (date: Date) => {
		return date.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		});
	};

	return `${formatTime(start)} - ${formatTime(end)}`;
}
