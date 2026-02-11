// apps/web/src/lib/constants/brain-dump-thresholds.ts

/**
 * Content length thresholds for brain dump validation
 * SHORT_MAX: Maximum length for short brain dumps (quick task capture)
 * MAX: Absolute maximum to prevent abuse
 */
export const CONTENT_LENGTH = {
	SHORT_MAX: 500, // Maximum for short brain dumps
	LONG_MIN: 50, // Minimum for long brain dumps
	MAX: 100000 // Absolute maximum to prevent abuse
} as const;
