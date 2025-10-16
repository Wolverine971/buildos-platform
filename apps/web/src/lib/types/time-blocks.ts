// apps/web/src/lib/types/time-blocks.ts

/**
 * Represents an available time slot detected between calendar events and time blocks
 */
export interface AvailableSlot {
	/** Unique identifier for the slot (e.g., "slot-2025-10-14-0900-1030") */
	id: string;
	/** Start time of the available slot */
	startTime: Date;
	/** End time of the available slot */
	endTime: Date;
	/** Duration of the slot in minutes */
	duration: number;
	/** Index in the days array (for positioning in calendar grid) */
	dayIndex: number;
	/** The date this slot belongs to */
	dayDate: Date;
}

/**
 * Configuration for the available slot finder feature
 */
export interface SlotFinderConfig {
	/** Whether the slot finder is enabled/visible */
	enabled: boolean;
	/** Buffer time to add before and after each event/block (in minutes) */
	bufferTime: 0 | 15 | 30 | 60;
	/** Minimum slot duration to show (in minutes) */
	minDuration: number;
	/** Maximum slot duration to show (in minutes) */
	maxDuration: number;
	/** Earliest hour of day to consider for slots (0-23) */
	earliestStart: number;
	/** Latest hour of day to consider for slots (0-23) */
	latestEnd: number;
}

/**
 * Represents an occupied time slot (event or time block)
 * Used internally for slot detection algorithm
 */
export interface OccupiedTimeSlot {
	/** Start time (with buffer applied if applicable) */
	start: Date;
	/** End time (with buffer applied if applicable) */
	end: Date;
	/** Type of occupied slot */
	type: 'event' | 'block';
	/** ID of the event or block */
	id: string;
}

/**
 * Default configuration for slot finder
 * Feature enabled by default with sensible defaults
 */
export const DEFAULT_SLOT_FINDER_CONFIG: SlotFinderConfig = {
	enabled: true, // Enabled by default
	bufferTime: 30, // 30 minutes buffer
	minDuration: 30, // 30 minutes minimum
	maxDuration: 600, // 10 hours maximum
	earliestStart: 8, // 8 AM
	latestEnd: 20 // 8 PM
};
