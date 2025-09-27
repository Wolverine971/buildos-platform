// src/lib/utils/invalidation.ts
import { invalidate } from '$app/navigation';

/**
 * Granular invalidation utilities for project data
 * This ensures consistent invalidation patterns across the app
 */

export interface InvalidationOptions {
	projectId: string;
}

export class ProjectInvalidation {
	constructor(private projectId: string) {}

	/**
	 * Invalidate only task-related data
	 */
	async tasks() {
		await Promise.all([
			invalidate(`projects:${this.projectId}:tasks`),
			invalidate(`projects:${this.projectId}:phases`), // Tasks affect phases
			invalidate(`projects:${this.projectId}:stats`)
		]);
	}

	/**
	 * Invalidate only notes data
	 */
	async notes() {
		await invalidate(`projects:${this.projectId}:notes`);
	}

	/**
	 * Invalidate only project context
	 */
	async context() {
		await invalidate(`projects:${this.projectId}:context`);
	}

	/**
	 * Invalidate only phases data
	 */
	async phases() {
		await Promise.all([
			invalidate(`projects:${this.projectId}:phases`),
			invalidate(`projects:${this.projectId}:stats`)
		]);
	}

	/**
	 * Invalidate calendar-related data
	 */
	async calendar() {
		await invalidate(`projects:${this.projectId}:calendar`);
	}

	/**
	 * Invalidate project metadata (name, dates, etc.)
	 */
	async project() {
		await invalidate(`projects:${this.projectId}`);
	}

	/**
	 * Invalidate task statistics only
	 */
	async stats() {
		await invalidate(`projects:${this.projectId}:stats`);
	}

	/**
	 * Invalidate tasks and calendar (for scheduling operations)
	 */
	async tasksAndCalendar() {
		await Promise.all([this.tasks(), this.calendar()]);
	}

	/**
	 * Invalidate phases and tasks (for operations that affect both)
	 */
	async phasesAndTasks() {
		await Promise.all([this.phases(), this.tasks()]);
	}

	/**
	 * Emergency fallback - invalidate everything for this project
	 * Use sparingly, only when you're unsure what data changed
	 */
	async all() {
		await Promise.all([
			invalidate(`projects:${this.projectId}`),
			invalidate(`projects:${this.projectId}:tasks`),
			invalidate(`projects:${this.projectId}:notes`),
			invalidate(`projects:${this.projectId}:phases`),
			invalidate(`projects:${this.projectId}:context`),
			invalidate(`projects:${this.projectId}:calendar`),
			invalidate(`projects:${this.projectId}:stats`)
		]);
	}
}

/**
 * Create a project invalidation instance
 */
export function createProjectInvalidation(projectId: string): ProjectInvalidation {
	return new ProjectInvalidation(projectId);
}

/**
 * Helper for quick invalidation without creating an instance
 */
export async function invalidateProject(projectId: string, type: keyof ProjectInvalidation) {
	const invalidation = new ProjectInvalidation(projectId);
	await invalidation[type]();
}

/**
 * Batch invalidation helper
 */
export async function batchInvalidate(projectId: string, types: Array<keyof ProjectInvalidation>) {
	const invalidation = new ProjectInvalidation(projectId);
	await Promise.all(types.map((type) => invalidation[type]()));
}

/**
 * Performance monitoring for invalidation operations
 */
export async function monitoredInvalidate(
	projectId: string,
	type: keyof ProjectInvalidation,
	operation?: string
) {
	const start = performance.now();
	const invalidation = new ProjectInvalidation(projectId);

	try {
		await invalidation[type]();
		const duration = performance.now() - start;

		if (duration > 100) {
			// Log slow invalidations
			console.warn(`Slow invalidation: ${type} took ${duration.toFixed(2)}ms`, {
				projectId,
				operation,
				duration
			});
		}
	} catch (error) {
		console.error('Invalidation failed:', {
			projectId,
			type,
			operation,
			error
		});
		throw error;
	}
}
