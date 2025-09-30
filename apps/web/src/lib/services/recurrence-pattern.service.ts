// apps/web/src/lib/services/recurrence-pattern.service.ts
import { addDays, addWeeks, addMonths, addYears, setDate } from 'date-fns';

export interface RecurrencePattern {
	type:
		| 'daily'
		| 'weekdays'
		| 'weekly'
		| 'biweekly'
		| 'monthly'
		| 'quarterly'
		| 'yearly'
		| 'custom';
	interval?: number;
	daysOfWeek?: number[]; // 0 = Sunday, 6 = Saturday
	dayOfMonth?: number;
	monthOfYear?: number;
	weekOfMonth?: number; // For "2nd Tuesday" type patterns
}

export interface RecurrenceEndOption {
	type: 'never' | 'date' | 'count';
	value?: string | number;
}

export interface RecurrenceConfig {
	pattern: RecurrencePattern;
	endOption: RecurrenceEndOption;
	startDate: string;
	rrule?: string;
	customRRule?: string;
}

export interface ValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

export class RecurrencePatternBuilder {
	private static instance: RecurrencePatternBuilder;

	private constructor() {}

	static getInstance(): RecurrencePatternBuilder {
		if (!RecurrencePatternBuilder.instance) {
			RecurrencePatternBuilder.instance = new RecurrencePatternBuilder();
		}
		return RecurrencePatternBuilder.instance;
	}

	/**
	 * Build an RRULE string from a recurrence configuration
	 */
	buildRRule(config: RecurrenceConfig): string {
		const { pattern, endOption, startDate } = config;

		// Handle custom RRULE
		if (pattern.type === 'custom' && config.customRRule) {
			return config.customRRule.startsWith('RRULE:')
				? config.customRRule
				: `RRULE:${config.customRRule}`;
		}

		let rrule = 'RRULE:';

		// Determine frequency
		switch (pattern.type) {
			case 'daily':
				rrule += 'FREQ=DAILY';
				break;
			case 'weekdays':
				rrule += 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
				break;
			case 'weekly':
				rrule += 'FREQ=WEEKLY';
				if (pattern.daysOfWeek && pattern.daysOfWeek.length > 0) {
					const dayAbbreviations = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
					const days = pattern.daysOfWeek.map((d) => dayAbbreviations[d]).join(',');
					rrule += `;BYDAY=${days}`;
				} else if (startDate) {
					// Use the day of the start date
					const dayIndex = new Date(startDate).getDay();
					const dayAbbreviations = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
					rrule += `;BYDAY=${dayAbbreviations[dayIndex]}`;
				}
				break;
			case 'biweekly':
				rrule += 'FREQ=WEEKLY;INTERVAL=2';
				if (startDate) {
					const dayIndex = new Date(startDate).getDay();
					const dayAbbreviations = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
					rrule += `;BYDAY=${dayAbbreviations[dayIndex]}`;
				}
				break;
			case 'monthly':
				rrule += 'FREQ=MONTHLY';
				if (pattern.dayOfMonth) {
					rrule += `;BYMONTHDAY=${pattern.dayOfMonth}`;
				} else if (
					pattern.weekOfMonth &&
					pattern.daysOfWeek &&
					pattern.daysOfWeek.length > 0
				) {
					// Handle "2nd Tuesday" type patterns
					const dayAbbreviations = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
					const dayCode = dayAbbreviations[pattern.daysOfWeek[0]];
					rrule += `;BYDAY=${pattern.weekOfMonth}${dayCode}`;
				} else if (startDate) {
					// Use the day of month from start date
					const dayOfMonth = new Date(startDate).getDate();
					rrule += `;BYMONTHDAY=${dayOfMonth}`;
				}
				break;
			case 'quarterly':
				rrule += 'FREQ=MONTHLY;INTERVAL=3';
				if (startDate) {
					const dayOfMonth = new Date(startDate).getDate();
					rrule += `;BYMONTHDAY=${dayOfMonth}`;
				}
				break;
			case 'yearly':
				rrule += 'FREQ=YEARLY';
				if (pattern.monthOfYear && pattern.dayOfMonth) {
					rrule += `;BYMONTH=${pattern.monthOfYear};BYMONTHDAY=${pattern.dayOfMonth}`;
				}
				break;
			default:
				return '';
		}

		// Add interval if specified and not already added
		if (pattern.interval && pattern.type !== 'biweekly' && pattern.type !== 'quarterly') {
			rrule += `;INTERVAL=${pattern.interval}`;
		}

		// Add end condition
		switch (endOption.type) {
			case 'date':
				if (endOption.value) {
					const endDate = new Date(endOption.value as string);
					const until = endDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
					rrule += `;UNTIL=${until}`;
				}
				break;
			case 'count':
				if (endOption.value) {
					rrule += `;COUNT=${endOption.value}`;
				}
				break;
			// 'never' has no additional parameters
		}

		return rrule;
	}

	/**
	 * Parse an RRULE string back into a RecurrenceConfig
	 */
	parseRRule(rrule: string): RecurrenceConfig | null {
		if (!rrule) return null;

		// Remove RRULE: prefix if present
		const ruleString = rrule.replace(/^RRULE:/i, '');
		const parts = ruleString.split(';');
		const params: Record<string, string> = {};

		for (const part of parts) {
			const [key, value] = part.split('=');
			if (key && value) {
				params[key.toUpperCase()] = value;
			}
		}

		// Determine pattern type
		let patternType: RecurrencePattern['type'] = 'daily';
		const pattern: RecurrencePattern = { type: 'daily' };

		if (params.FREQ === 'DAILY') {
			pattern.type = 'daily';
		} else if (params.FREQ === 'WEEKLY') {
			if (params.BYDAY === 'MO,TU,WE,TH,FR') {
				pattern.type = 'weekdays';
			} else if (params.INTERVAL === '2') {
				pattern.type = 'biweekly';
			} else {
				pattern.type = 'weekly';
				if (params.BYDAY) {
					const dayMap: Record<string, number> = {
						SU: 0,
						MO: 1,
						TU: 2,
						WE: 3,
						TH: 4,
						FR: 5,
						SA: 6
					};
					pattern.daysOfWeek = params.BYDAY.split(',')
						.map((day) => dayMap[day])
						.filter((day) => day !== undefined);
				}
			}
		} else if (params.FREQ === 'MONTHLY') {
			if (params.INTERVAL === '3') {
				pattern.type = 'quarterly';
			} else {
				pattern.type = 'monthly';
				if (params.BYMONTHDAY) {
					pattern.dayOfMonth = parseInt(params.BYMONTHDAY);
				}
			}
		} else if (params.FREQ === 'YEARLY') {
			pattern.type = 'yearly';
			if (params.BYMONTH) {
				pattern.monthOfYear = parseInt(params.BYMONTH);
			}
			if (params.BYMONTHDAY) {
				pattern.dayOfMonth = parseInt(params.BYMONTHDAY);
			}
		}

		// Parse interval
		if (params.INTERVAL && pattern.type !== 'biweekly' && pattern.type !== 'quarterly') {
			pattern.interval = parseInt(params.INTERVAL);
		}

		// Parse end condition
		const endOption: RecurrenceEndOption = { type: 'never' };
		if (params.UNTIL) {
			endOption.type = 'date';
			// Parse YYYYMMDDTHHMMSSZ format
			const year = params.UNTIL.substring(0, 4);
			const month = params.UNTIL.substring(4, 6);
			const day = params.UNTIL.substring(6, 8);
			endOption.value = `${year}-${month}-${day}`;
		} else if (params.COUNT) {
			endOption.type = 'count';
			endOption.value = parseInt(params.COUNT);
		}

		return {
			pattern,
			endOption,
			startDate: new Date().toISOString(), // Default, should be overridden
			rrule
		};
	}

	/**
	 * Calculate future instances based on a recurrence pattern
	 */
	calculateInstances(config: RecurrenceConfig, limit: number = 100, startAfter?: Date): Date[] {
		const instances: Date[] = [];
		const { pattern, endOption, startDate } = config;

		if (!startDate) return instances;

		let currentDate = new Date(startDate);
		const startAfterDate = startAfter || new Date();

		// If we have a start after date, find the first occurrence after it
		if (startAfter && currentDate <= startAfter) {
			currentDate = this.findNextOccurrenceAfter(config, startAfter) || currentDate;
		}

		// Set up end constraint
		let endDate: Date | null = null;
		let maxCount = limit;

		if (endOption.type === 'date' && endOption.value) {
			endDate = new Date(endOption.value as string);
		} else if (endOption.type === 'count' && endOption.value) {
			maxCount = Math.min(endOption.value as number, limit);
		}

		let iterations = 0;
		const maxIterations = 1000; // Safety limit

		while (instances.length < maxCount && iterations < maxIterations) {
			iterations++;

			// Check end date constraint
			if (endDate && currentDate > endDate) break;

			// Check if this date matches the pattern
			if (this.dateMatchesPattern(currentDate, pattern)) {
				instances.push(new Date(currentDate));
			}

			// Move to next potential date
			currentDate = this.getNextPotentialDate(currentDate, pattern);
		}

		return instances;
	}

	/**
	 * Get the next occurrence after a given date
	 */
	getNextOccurrence(config: RecurrenceConfig, after: Date): Date | null {
		const instances = this.calculateInstances(config, 1, after);
		return instances.length > 0 ? instances[0] : null;
	}

	/**
	 * Validate a recurrence pattern
	 */
	validatePattern(config: RecurrenceConfig): ValidationResult {
		const errors: string[] = [];
		const warnings: string[] = [];

		// Validate pattern
		if (!config.pattern || !config.pattern.type) {
			errors.push('Recurrence pattern type is required');
		}

		// Validate start date
		if (!config.startDate) {
			errors.push('Start date is required for recurrence');
		} else {
			const startDate = new Date(config.startDate);
			if (isNaN(startDate.getTime())) {
				errors.push('Invalid start date');
			}
		}

		// Validate end option
		if (config.endOption.type === 'date' && config.endOption.value) {
			const endDate = new Date(config.endOption.value as string);
			if (isNaN(endDate.getTime())) {
				errors.push('Invalid end date');
			} else if (config.startDate) {
				const startDate = new Date(config.startDate);
				if (endDate <= startDate) {
					errors.push('End date must be after start date');
				}
			}
		} else if (config.endOption.type === 'count') {
			const count = config.endOption.value as number;
			if (!count || count < 1) {
				errors.push('Occurrence count must be at least 1');
			} else if (count > 999) {
				warnings.push('Large occurrence counts may impact performance');
			}
		}

		// Pattern-specific validation
		if (config.pattern.type === 'custom' && !config.customRRule) {
			errors.push('Custom RRULE is required for custom pattern');
		}

		if (config.pattern.type === 'monthly' && config.pattern.dayOfMonth) {
			if (config.pattern.dayOfMonth > 31 || config.pattern.dayOfMonth < 1) {
				errors.push('Day of month must be between 1 and 31');
			} else if (config.pattern.dayOfMonth > 28) {
				warnings.push('Months with fewer days will use the last day of the month');
			}
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings
		};
	}

	/**
	 * Convert config to Google Calendar recurrence format
	 */
	toGoogleRecurrence(config: RecurrenceConfig): string[] {
		const rrule = this.buildRRule(config);
		return rrule ? [rrule] : [];
	}

	/**
	 * Convert from Google Calendar recurrence format
	 */
	fromGoogleRecurrence(recurrence: string[]): RecurrenceConfig | null {
		if (!recurrence || recurrence.length === 0) return null;

		// Google Calendar typically uses the first recurrence rule
		const rrule = recurrence[0];
		return this.parseRRule(rrule);
	}

	// Private helper methods

	private findNextOccurrenceAfter(config: RecurrenceConfig, after: Date): Date | null {
		const { pattern, startDate } = config;
		if (!startDate) return null;

		let current = new Date(startDate);
		const maxIterations = 1000;
		let iterations = 0;

		while (current <= after && iterations < maxIterations) {
			current = this.getNextPotentialDate(current, pattern);
			iterations++;
		}

		return iterations < maxIterations ? current : null;
	}

	private dateMatchesPattern(date: Date, pattern: RecurrencePattern): boolean {
		switch (pattern.type) {
			case 'weekdays':
				const day = date.getDay();
				return day >= 1 && day <= 5;
			case 'weekly':
			case 'biweekly':
				if (pattern.daysOfWeek && pattern.daysOfWeek.length > 0) {
					return pattern.daysOfWeek.includes(date.getDay());
				}
				return true;
			default:
				return true;
		}
	}

	private getNextPotentialDate(current: Date, pattern: RecurrencePattern): Date {
		const next = new Date(current);

		switch (pattern.type) {
			case 'daily':
			case 'weekdays':
				return addDays(next, 1);
			case 'weekly':
				return addWeeks(next, 1);
			case 'biweekly':
				return addWeeks(next, 2);
			case 'monthly':
				// Handle month-end dates properly
				const originalDay = current.getDate();
				const nextMonth = addMonths(next, 1);
				if (pattern.dayOfMonth && pattern.dayOfMonth > 28) {
					// Set to last day of month if needed
					const lastDay = new Date(
						nextMonth.getFullYear(),
						nextMonth.getMonth() + 1,
						0
					).getDate();
					return setDate(nextMonth, Math.min(pattern.dayOfMonth, lastDay));
				}
				return nextMonth;
			case 'quarterly':
				return addMonths(next, 3);
			case 'yearly':
				return addYears(next, 1);
			default:
				return addDays(next, 1);
		}
	}

	/**
	 * Get human-readable text for a recurrence pattern
	 */
	getRecurrenceText(pattern: RecurrencePattern): string {
		switch (pattern.type) {
			case 'daily':
				return 'Every day';
			case 'weekdays':
				return 'Every weekday (Mon-Fri)';
			case 'weekly':
				if (pattern.daysOfWeek && pattern.daysOfWeek.length > 0) {
					const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
					const days = pattern.daysOfWeek.map((d) => dayNames[d]).join(', ');
					return `Weekly on ${days}`;
				}
				return 'Every week';
			case 'biweekly':
				return 'Every 2 weeks';
			case 'monthly':
				if (pattern.dayOfMonth) {
					return `Monthly on day ${pattern.dayOfMonth}`;
				}
				return 'Every month';
			case 'quarterly':
				return 'Every 3 months';
			case 'yearly':
				return 'Every year';
			case 'custom':
				return 'Custom recurrence';
			default:
				return 'Custom';
		}
	}
}

// Export singleton instance
export const recurrencePatternBuilder = RecurrencePatternBuilder.getInstance();
