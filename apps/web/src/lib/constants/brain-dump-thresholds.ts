// apps/web/src/lib/constants/brain-dump-thresholds.ts

/**
 * Content length thresholds for brain dump validation
 * With preparatory analysis, we no longer need short/long distinction
 * The analysis intelligently determines what processing is needed
 */
export const CONTENT_LENGTH = {
	MAX: 100000 // Absolute maximum to prevent abuse
} as const;
