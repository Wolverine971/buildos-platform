// src/lib/constants/brain-dump-thresholds.ts

// Content length thresholds
export const CONTENT_LENGTH = {
	SHORT_MAX: 500, // Maximum chars for short braindump
	LONG_MIN: 500, // Minimum chars for long braindump
	MAX: 100000 // Absolute maximum to prevent abuse
} as const;
/**
 * Shared threshold constants for brain dump dual processing
 * These values determine when to use dual processing vs single processing
 */
export const BRAIN_DUMP_THRESHOLDS = {
	/**
	 * Minimum brain dump length to trigger dual processing
	 * regardless of existing project context
	 * Uses the same threshold as short/long distinction
	 */
	BRAIN_DUMP_THRESHOLD: CONTENT_LENGTH.SHORT_MAX,

	/**
	 * Combined threshold for brain dump + existing context
	 * If total length exceeds this, use dual processing
	 */
	COMBINED_THRESHOLD: 800,

	/**
	 * Re-export content length constants for convenience
	 */
	SHORT_MAX: CONTENT_LENGTH.SHORT_MAX,
	LONG_MIN: CONTENT_LENGTH.LONG_MIN,
	MAX: CONTENT_LENGTH.MAX
} as const;

/**
 * Determines if dual processing should be used based on content length
 */
export function shouldUseDualProcessing(
	brainDumpLength: number,
	existingContextLength: number = 0
): boolean {
	const totalLength = brainDumpLength + existingContextLength;

	return (
		brainDumpLength >= BRAIN_DUMP_THRESHOLDS.BRAIN_DUMP_THRESHOLD ||
		(existingContextLength > 0 && totalLength >= BRAIN_DUMP_THRESHOLDS.COMBINED_THRESHOLD)
	);
}

export interface DualProcessingDecision {
	brainDumpLength: number;
	existingContextLength: number;
	totalLength: number;
	shouldUseDualProcessing: boolean;
	reason?: string;
}
