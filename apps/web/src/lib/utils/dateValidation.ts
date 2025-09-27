// src/lib/utils/dateValidation.ts

export interface ValidationResult {
	isValid: boolean;
	error?: string;
	warning?: string;
}

export interface DateConflict {
	type: 'outside_project' | 'outside_phase' | 'calendar_conflict' | 'dependency_conflict';
	message: string;
	suggestedDate?: Date;
}

export interface PhaseCompatibilityResult {
	compatible: boolean;
	conflicts: DateConflict[];
	suggestedPhase?: {
		id: string;
		name: string;
		start_date: string;
		end_date: string;
	};
}

/**
 * Validates if a date falls within a date range
 */
export function isDateInRange(
	date: Date | string,
	startDate: Date | string | null,
	endDate: Date | string | null
): boolean {
	const checkDate = new Date(date);

	if (startDate) {
		const start = new Date(startDate);
		if (checkDate < start) return false;
	}

	if (endDate) {
		const end = new Date(endDate);
		end.setHours(23, 59, 59, 999); // End of day
		if (checkDate > end) return false;
	}

	return true;
}

/**
 * Validates task date against project timeline
 */
export function validateTaskDateAgainstProject(
	taskStartDate: string | null,
	projectStartDate: string | null,
	projectEndDate: string | null
): ValidationResult {
	if (!taskStartDate) {
		return { isValid: true };
	}

	const taskDate = new Date(taskStartDate);

	if (projectStartDate) {
		const projectStart = new Date(projectStartDate);
		if (taskDate < projectStart) {
			return {
				isValid: false,
				error: `Task start date (${taskDate.toLocaleDateString()}) is before project start date (${projectStart.toLocaleDateString()})`
			};
		}
	}

	if (projectEndDate) {
		const projectEnd = new Date(projectEndDate);
		if (taskDate > projectEnd) {
			return {
				isValid: false,
				error: `Task start date (${taskDate.toLocaleDateString()}) is after project end date (${projectEnd.toLocaleDateString()})`
			};
		}
	}

	return { isValid: true };
}

/**
 * Validates phase dates against project timeline
 */
export function validatePhaseDatesAgainstProject(
	phaseStartDate: string,
	phaseEndDate: string,
	projectStartDate: string | null,
	projectEndDate: string | null
): ValidationResult {
	const phaseStart = new Date(phaseStartDate);
	const phaseEnd = new Date(phaseEndDate);

	// Basic phase validation
	if (phaseStart >= phaseEnd) {
		return {
			isValid: false,
			error: 'Phase end date must be after start date'
		};
	}

	// Project boundary validation
	if (projectStartDate) {
		const projectStart = new Date(projectStartDate);
		if (phaseStart < projectStart) {
			return {
				isValid: false,
				error: `Phase cannot start before project start date (${projectStart.toLocaleDateString()})`
			};
		}
	}

	if (projectEndDate) {
		const projectEnd = new Date(projectEndDate);
		if (phaseEnd > projectEnd) {
			return {
				isValid: false,
				error: `Phase cannot end after project end date (${projectEnd.toLocaleDateString()})`
			};
		}
	}

	return { isValid: true };
}

/**
 * Find which phase a task should belong to based on its start date
 */
export function findPhaseForTaskDate(
	taskStartDate: string,
	phases: Array<{ id: string; name: string; start_date: string; end_date: string }>
): { id: string; name: string; start_date: string; end_date: string } | null {
	const taskDate = new Date(taskStartDate);

	for (const phase of phases) {
		if (isDateInRange(taskDate, phase.start_date, phase.end_date)) {
			return phase;
		}
	}

	return null;
}

/**
 * Check if moving a task to a phase would create date conflicts
 */
export function checkTaskPhaseCompatibility(
	task: { id: string; title: string | null; start_date: string | null },
	targetPhase: { id: string; name: string; start_date: string; end_date: string },
	projectStartDate: string | null,
	projectEndDate: string | null
): PhaseCompatibilityResult {
	const conflicts: DateConflict[] = [];

	// If task has no start date, it's compatible
	if (!task.start_date) {
		return { compatible: true, conflicts: [] };
	}

	const taskDate = new Date(task.start_date);
	const phaseStart = new Date(targetPhase.start_date);
	const phaseEnd = new Date(targetPhase.end_date);

	// Check if task date is within phase bounds
	if (!isDateInRange(taskDate, targetPhase.start_date, targetPhase.end_date)) {
		conflicts.push({
			type: 'outside_phase',
			message: `Task date (${taskDate.toLocaleDateString()}) is outside phase range (${phaseStart.toLocaleDateString()} - ${phaseEnd.toLocaleDateString()})`,
			suggestedDate: phaseStart
		});
	}

	// Check against project boundaries
	const projectValidation = validateTaskDateAgainstProject(
		task.start_date,
		projectStartDate,
		projectEndDate
	);
	if (!projectValidation.isValid) {
		conflicts.push({
			type: 'outside_project',
			message: projectValidation.error!
		});
	}

	return {
		compatible: conflicts.length === 0,
		conflicts
	};
}

/**
 * Calculate suggested start date for a task in a phase
 */
export function calculateSuggestedTaskDate(
	currentTaskDate: string | null,
	targetPhase: { start_date: string; end_date: string },
	preferences?: { prefer_morning?: boolean; timezone?: string },
	existingTaskDates: string[] = [] // pass ISO strings of task start dates in the phase
): Date {
	const now = new Date();
	const phaseStart = new Date(targetPhase.start_date);
	const phaseEnd = new Date(targetPhase.end_date);

	// Get user's timezone or default to system timezone
	const userTimezone = preferences?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

	// Helper: ensure date is not before now, not after phase end, and not overlapping
	function findNextAvailableDate(fromDate: Date): Date {
		let candidate = new Date(fromDate);

		// If preferring morning, set to 9 AM in user's timezone
		if (preferences?.prefer_morning) {
			// Get the date string in user's timezone
			const dateInUserTz = candidate.toLocaleDateString('en-US', { timeZone: userTimezone });
			// Create a new date at 9 AM in user's timezone
			candidate = new Date(new Date(`${dateInUserTz}`).setHours(9));

			// Adjust if this puts us before the original fromDate
			if (candidate < fromDate) {
				candidate = new Date(fromDate);
				candidate.setHours(candidate.getHours() + 1, 0, 0, 0);
			}
		}

		// Sort existing dates for efficient checking
		const existingTimes = existingTaskDates.map((d) => new Date(d).getTime());
		existingTimes.sort((a, b) => a - b);

		// Increment by 1 hour if overlapping
		while (existingTimes.some((time) => Math.abs(time - candidate.getTime()) < 60000)) {
			// Within 1 minute
			candidate.setHours(candidate.getHours() + 1);
		}

		// Ensure candidate is within phase bounds
		if (candidate > phaseEnd) {
			// fallback: set to phase end date at 9 AM
			const dateInUserTz = phaseEnd.toLocaleDateString('en-US', { timeZone: userTimezone });
			const fallback = new Date(new Date(`${dateInUserTz}`).setHours(9));

			// If 9 AM is after phase end, use phase end time
			if (fallback > phaseEnd) {
				return new Date(phaseEnd.getTime() - 3600000); // 1 hour before phase end
			}
			return fallback;
		}

		return candidate;
	}

	// If task already has a date within the phase and not in the past, keep it
	if (
		currentTaskDate &&
		isDateInRange(currentTaskDate, targetPhase.start_date, targetPhase.end_date)
	) {
		const current = new Date(currentTaskDate);
		if (current >= now && !existingTaskDates.includes(currentTaskDate)) {
			return current;
		}
	}

	// Determine initial suggested date:
	// - If today is within phase, start from tomorrow morning
	// - Otherwise, use phase start date
	let initial: Date;
	if (now >= phaseStart && now <= phaseEnd) {
		// Start from tomorrow to give user time to prepare
		initial = new Date(now);
		initial.setDate(initial.getDate() + 1);
		initial.setHours(0, 0, 0, 0);
	} else if (now < phaseStart) {
		initial = new Date(phaseStart);
	} else {
		// Phase is in the past, suggest tomorrow
		initial = new Date(now);
		initial.setDate(initial.getDate() + 1);
		initial.setHours(0, 0, 0, 0);
	}

	// Return next available date considering overlap and preferences
	return findNextAvailableDate(initial);
}

/**
 * Validate phase overlap with existing phases
 */
export function checkPhaseOverlap(
	newPhase: { start_date: string; end_date: string },
	existingPhases: Array<{ id: string; name: string; start_date: string; end_date: string }>,
	excludePhaseId?: string
): { hasOverlap: boolean; overlappingPhases: string[] } {
	const newStart = new Date(newPhase.start_date);
	const newEnd = new Date(newPhase.end_date);
	const overlappingPhases: string[] = [];

	for (const phase of existingPhases) {
		if (excludePhaseId && phase.id === excludePhaseId) continue;

		const phaseStart = new Date(phase.start_date);
		const phaseEnd = new Date(phase.end_date);

		// Check for overlap: (start1 <= end2) and (start2 <= end1)
		if (newStart <= phaseEnd && phaseStart <= newEnd) {
			overlappingPhases.push(phase.name);
		}
	}

	return {
		hasOverlap: overlappingPhases.length > 0,
		overlappingPhases
	};
}

/**
 * Format date for input fields
 */
export function formatDateForInput(date: Date | string | null): string {
	if (!date) return '';
	const d = new Date(date);
	return d.toISOString().split('T')[0];
}

/**
 * Format datetime for input fields
 */
export function formatDateTimeForInput(date: Date | string | null): string {
	if (!date) return '';
	const d = new Date(date);
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	const hours = String(d.getHours()).padStart(2, '0');
	const minutes = String(d.getMinutes()).padStart(2, '0');
	return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Check if two date ranges overlap
 */
export function dateRangesOverlap(
	range1: { start: Date | string; end: Date | string },
	range2: { start: Date | string; end: Date | string }
): boolean {
	const start1 = new Date(range1.start);
	const end1 = new Date(range1.end);
	const start2 = new Date(range2.start);
	const end2 = new Date(range2.end);

	return start1 <= end2 && start2 <= end1;
}

// ------------------------------------

// Add this to your existing dateValidation.ts file

export interface PhaseValidationResult {
	isValid: boolean;
	error?: string;
	warning?: string;
	adjustedStartDate?: string;
	adjustedEndDate?: string;
}

export interface ProjectBoundaries {
	start_date: string | null;
	end_date: string | null;
}

/**
 * Validates phase dates against project boundaries
 */
export function validatePhaseDateAgainstProject(
	phaseStartDate: string | null,
	phaseEndDate: string | null,
	project: ProjectBoundaries
): PhaseValidationResult {
	const result: PhaseValidationResult = { isValid: true };

	// If no phase dates provided, return invalid
	if (!phaseStartDate && !phaseEndDate) {
		return {
			isValid: false,
			error: 'Phase must have at least a start date or end date'
		};
	}

	// If only one phase date is provided, we can still validate it
	if (phaseStartDate && !phaseEndDate) {
		// Just validate start date
		if (project.start_date) {
			const phaseStart = new Date(phaseStartDate);
			const projectStart = new Date(project.start_date);

			if (phaseStart < projectStart) {
				return {
					isValid: false,
					error: `Phase start date cannot be before project start date (${formatDateForValidation(projectStart)})`,
					adjustedStartDate: project.start_date
				};
			}
		}

		if (project.end_date) {
			const phaseStart = new Date(phaseStartDate);
			const projectEnd = new Date(project.end_date);

			if (phaseStart > projectEnd) {
				return {
					isValid: false,
					error: `Phase start date cannot be after project end date (${formatDateForValidation(projectEnd)})`,
					adjustedStartDate: project.end_date
				};
			}
		}

		return result;
	}

	if (!phaseStartDate && phaseEndDate) {
		// Just validate end date
		if (project.start_date) {
			const phaseEnd = new Date(phaseEndDate);
			const projectStart = new Date(project.start_date);

			if (phaseEnd < projectStart) {
				return {
					isValid: false,
					error: `Phase end date cannot be before project start date (${formatDateForValidation(projectStart)})`,
					adjustedEndDate: project.start_date
				};
			}
		}

		if (project.end_date) {
			const phaseEnd = new Date(phaseEndDate);
			const projectEnd = new Date(project.end_date);

			if (phaseEnd > projectEnd) {
				return {
					isValid: false,
					error: `Phase end date cannot be after project end date (${formatDateForValidation(projectEnd)})`,
					adjustedEndDate: project.end_date
				};
			}
		}

		return result;
	}

	// Both dates provided - validate both
	if (!phaseStartDate || !phaseEndDate) {
		return result; // This case is already handled above
	}

	const phaseStart = new Date(phaseStartDate);
	const phaseEnd = new Date(phaseEndDate);

	// Basic validation - start should be before end
	if (phaseStart >= phaseEnd) {
		return {
			isValid: false,
			error: 'Phase start date must be before end date'
		};
	}

	// Validate against project start date
	if (project.start_date) {
		const projectStart = new Date(project.start_date);

		if (phaseStart < projectStart) {
			return {
				isValid: false,
				error: `Phase start date cannot be before project start date (${formatDateForValidation(projectStart)})`,
				adjustedStartDate: project.start_date
			};
		}
	}

	// Validate against project end date
	if (project.end_date) {
		const projectEnd = new Date(project.end_date);

		if (phaseEnd > projectEnd) {
			return {
				isValid: false,
				error: `Phase end date cannot be after project end date (${formatDateForValidation(projectEnd)})`,
				adjustedEndDate: project.end_date
			};
		}
	}

	// Additional validation - check if phase extends significantly beyond project boundaries
	if (project.start_date && project.end_date) {
		const projectStart = new Date(project.start_date);
		const projectEnd = new Date(project.end_date);
		const projectDuration = projectEnd.getTime() - projectStart.getTime();
		const phaseDuration = phaseEnd.getTime() - phaseStart.getTime();

		// If phase duration is more than 50% of project duration, show warning
		if (phaseDuration > projectDuration * 0.5) {
			result.warning = 'This phase duration is more than 50% of the total project timeline';
		}
	}

	return result;
}

/**
 * Get date picker constraints based on project boundaries
 */
export function getPhaseeDateConstraints(
	project: ProjectBoundaries,
	isStartDate: boolean = true
): { min?: string; max?: string } {
	const constraints: { min?: string; max?: string } = {};

	if (isStartDate) {
		// For start date picker
		if (project.start_date) {
			constraints.min = formatDateForInput(project.start_date);
		}
		if (project.end_date) {
			constraints.max = formatDateForInput(project.end_date);
		}
	} else {
		// For end date picker
		if (project.start_date) {
			constraints.min = formatDateForInput(project.start_date);
		}
		if (project.end_date) {
			constraints.max = formatDateForInput(project.end_date);
		}
	}

	return constraints;
}

/**
 * Get phase date constraints considering the other phase date
 */
export function getPhaseeDateConstraintsWithPartner(
	project: ProjectBoundaries,
	isStartDate: boolean,
	partnerDate?: string
): { min?: string; max?: string } {
	const baseConstraints = getPhaseeDateConstraints(project, isStartDate);

	if (isStartDate && partnerDate) {
		// Start date should be before end date
		const endDate = new Date(partnerDate);
		endDate.setDate(endDate.getDate() - 1); // One day before end date
		const maxFromPartner = formatDateForInput(endDate.toISOString());

		if (!baseConstraints.max || maxFromPartner < baseConstraints.max) {
			baseConstraints.max = maxFromPartner;
		}
	} else if (!isStartDate && partnerDate) {
		// End date should be after start date
		const startDate = new Date(partnerDate);
		startDate.setDate(startDate.getDate() + 1); // One day after start date
		const minFromPartner = formatDateForInput(startDate.toISOString());

		if (!baseConstraints.min || minFromPartner > baseConstraints.min) {
			baseConstraints.min = minFromPartner;
		}
	}

	return baseConstraints;
}

/**
 * Check if project has sufficient date boundaries for phase creation
 */
export function canCreatePhaseInProject(project: ProjectBoundaries): {
	canCreate: boolean;
	message?: string;
} {
	if (!project.start_date && !project.end_date) {
		return {
			canCreate: false,
			message: 'Project must have at least a start date or end date before creating phases'
		};
	}

	return { canCreate: true };
}

/**
 * Format date for display in validation messages
 */
function formatDateForValidation(date: Date): string {
	return date.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}
