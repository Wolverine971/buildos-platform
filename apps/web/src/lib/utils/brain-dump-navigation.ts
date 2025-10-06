// apps/web/src/lib/utils/brain-dump-navigation.ts
/**
 * Smart navigation and refresh decision logic for brain dump flow
 * Optimizes user experience based on context
 */

import { goto } from '$app/navigation';
import { toastService } from '$lib/stores/toast.store';
import {
	brainDumpV2Store as brainDumpActions,
	type BrainDumpV2Store
} from '$lib/stores/brain-dump-v2.store';
import { RealtimeProjectService } from '$lib/services/realtimeProject.service';

export interface RefreshDecision {
	needsRefresh: boolean;
	refreshType: 'none' | 'soft' | 'hard' | 'modal';
	reason: string;
}

export interface NavigationContext {
	targetProjectId: string;
	currentPath: string;
	isAutoAccept: boolean;
	hasUnsavedWork: boolean;
	realTimeSyncActive: boolean;
}

/**
 * Determines the optimal refresh strategy based on context
 */
export function determineRefreshStrategy(context: NavigationContext): RefreshDecision {
	const targetPath = `/projects/${context.targetProjectId}`;
	const isOnSamePage = context.currentPath.startsWith(targetPath);

	if (!isOnSamePage) {
		return {
			needsRefresh: false,
			refreshType: 'none',
			reason: 'Different page - will navigate'
		};
	}

	// On same project page
	if (context.isAutoAccept && context.realTimeSyncActive) {
		// Real-time sync will handle updates seamlessly
		return {
			needsRefresh: false,
			refreshType: 'none',
			reason: 'Real-time sync active - automatic updates'
		};
	}

	if (context.hasUnsavedWork) {
		// User has unsaved changes - show modal to confirm
		return {
			needsRefresh: true,
			refreshType: 'modal',
			reason: 'User has unsaved work - needs confirmation'
		};
	}

	if (!context.realTimeSyncActive) {
		// Real-time sync not active - need manual refresh
		return {
			needsRefresh: true,
			refreshType: 'soft',
			reason: 'Real-time sync not active - manual refresh needed'
		};
	}

	// Default: no refresh needed
	return {
		needsRefresh: false,
		refreshType: 'none',
		reason: 'Updates will sync automatically'
	};
}

/**
 * Check if user is on a specific project page (including sub-pages)
 */
export function isOnProjectPage(projectId: string, currentPath?: string): boolean {
	const path = currentPath || window.location.pathname;
	const projectPath = `/projects/${projectId}`;
	return path.startsWith(projectPath);
}

/**
 * Check if real-time sync is active for a project
 * This checks if RealtimeProjectService is initialized and connected
 *
 * Note: No longer needs dynamic import since the circular dependency
 * between project.store.ts and realtimeProject.service.ts has been
 * resolved using the event bus pattern.
 */
export function isRealTimeSyncActive(projectId: string): boolean {
	// No longer async or dynamic - circular dependency resolved via event bus
	return RealtimeProjectService.isInitialized();
}

/**
 * Perform smart navigation with optimal user experience
 */
export async function smartNavigateToProject(
	projectId: string,
	projectName: string,
	options: {
		isAutoAccept?: boolean;
		isNewProject?: boolean;
		onSameProject?: () => void;
		onNavigate?: () => void;
	} = {}
): Promise<void> {
	const targetPath = `/projects/${projectId}`;
	const currentPath = window.location.pathname;
	const isOnSameProject = isOnProjectPage(projectId, currentPath);

	if (isOnSameProject) {
		// Already on this project
		if (options.isAutoAccept) {
			// Auto-accept on same project - just show success
			toastService.success('✨ Changes applied to current project', {
				duration: 3000
			});

			// Hide notification without full reset
			brainDumpActions.closeNotification();

			// Trigger soft refresh if real-time sync not active
			const syncActive = isRealTimeSyncActive(projectId);
			if (!syncActive) {
				// Emit custom event for project page to refresh its data
				window.dispatchEvent(
					new CustomEvent('brain-dump-applied', {
						detail: { projectId, projectName }
					})
				);
			}
		} else {
			// Manual navigation to same project - show success
			toastService.success('✨ Project updated successfully', {
				duration: 3000
			});
		}

		// Call callback if provided
		options.onSameProject?.();
	} else {
		// Navigate to different project
		try {
			// Call pre-navigation callback
			options.onNavigate?.();

			// Use SvelteKit navigation for smooth transition
			await goto(targetPath, {
				replaceState: false,
				invalidateAll: false // Let project page handle its own data loading
			});

			// Show success after navigation
			if (options.isNewProject) {
				toastService.success('🎉 New project created!', {
					duration: 3000
				});
			}
		} catch (error) {
			console.error('Navigation failed, using fallback:', error);
			// Fallback to hard navigation
			window.location.href = targetPath;
		}
	}
}

/**
 * Handle seamless updates for same-project brain dumps
 */
export async function handleSeamlessProjectUpdate(
	projectId: string,
	updates: any[],
	options: {
		showToast?: boolean;
		toastMessage?: string;
	} = {}
): Promise<void> {
	// Check if we're on the target project
	if (!isOnProjectPage(projectId)) {
		console.warn('Seamless update called but not on target project');
		return;
	}

	// Check real-time sync status
	const syncActive = isRealTimeSyncActive(projectId);

	if (syncActive) {
		// Real-time sync will handle updates
		if (options.showToast) {
			toastService.success(options.toastMessage || '✨ Updates syncing...', {
				duration: 2000
			});
		}
	} else {
		// Emit event for manual refresh
		window.dispatchEvent(
			new CustomEvent('brain-dump-updates-available', {
				detail: {
					projectId,
					updates,
					timestamp: Date.now()
				}
			})
		);

		if (options.showToast) {
			toastService.info('📥 Updates available - refresh to see changes', {
				duration: 4000
			});
		}
	}
}

/**
 * Preload project page resources for faster navigation
 */
export async function preloadProjectPage(projectId: string): Promise<void> {
	const targetPath = `/projects/${projectId}`;

	// Preload the route
	try {
		const { preloadData } = await import('$app/navigation');
		await preloadData(targetPath);
	} catch (error) {
		console.warn('Could not preload project page:', error);
	}
}
