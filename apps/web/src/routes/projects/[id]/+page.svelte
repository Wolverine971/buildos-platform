<!-- apps/web/src/routes/projects/[id]/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	// Note: Lifecycle converted to $effect for Svelte 5 runes mode
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { modalStore } from '$lib/stores/modal.store';
	import type { PageData } from './$types';
	import './project.css';

	// Components
	// Use new minimal header by default, with flag to switch back
	import ProjectHeaderMinimal from '$lib/components/project/ProjectHeaderMinimal.svelte';
	import ProjectHeaderLegacy from '$lib/components/project/ProjectHeader.svelte';
	import ProjectTabs from '$lib/components/project/ProjectTabs.svelte';
	import ProjectModals from '$lib/components/project/ProjectModals.svelte';
	import ProjectBriefsSection from '$lib/components/project/ProjectBriefsSection.svelte';
	import LoadingSkeleton from '$lib/components/ui/LoadingSkeleton.svelte';

	// Skeleton components
	import TaskListSkeleton from '$lib/components/ui/skeletons/TaskListSkeleton.svelte';
	import NotesListSkeleton from '$lib/components/ui/skeletons/NotesListSkeleton.svelte';
	import PhasesSkeleton from '$lib/components/ui/skeletons/PhasesSkeleton.svelte';
	import BriefsSkeleton from '$lib/components/ui/skeletons/BriefsSkeleton.svelte';
	import SynthesisSkeleton from '$lib/components/ui/skeletons/SynthesisSkeleton.svelte';

	// NEW: Use v2 store and services
	import { projectStoreV2 } from '$lib/stores/project.store';
	import { ProjectDataService } from '$lib/services/projectData.service';
	import { ProjectSynthesisService } from '$lib/services/project-synthesis.service';
	import { startPhaseGeneration } from '$lib/services/phase-generation-notification.bridge';
	import { toastService } from '$lib/stores/toast.store';
	import { ProjectService } from '$lib/services/projectService';
	import { RealtimeProjectService } from '$lib/services/realtimeProject.service';
	import {
		performanceMonitor,
		startTimer,
		endTimer,
		takeMemorySnapshot
	} from '$lib/utils/performance-monitor';
	import { supabase } from '$lib/supabase';
	import type { Phase, Note, Task } from '$lib/types/project';
	import { loadingStateManager } from '$lib/utils/loadingStateManager';
	import { get } from 'svelte/store';

	let { data }: { data: PageData } = $props();

	// Feature flag for minimal header - can be controlled via localStorage or env var
	const useMinimalHeader = $state(
		browser ? localStorage.getItem('useMinimalHeader') !== 'false' : true
	);

	// Choose which header component to use
	const ProjectHeader = useMinimalHeader ? ProjectHeaderMinimal : ProjectHeaderLegacy;

	// Initialize services
	let dataService: ProjectDataService;
	let synthesisService: ProjectSynthesisService;
	let projectService: ProjectService;

	// Track if store has been initialized to avoid re-initialization (non-reactive)
	let storeInitialized = false;

	// Track current initialized project ID to prevent loops (non-reactive)
	let initializedProjectId: string | null = null;

	// FIXED: Component cleanup registry for memory leak prevention
	const componentCleanupRegistry = new WeakMap();

	// Helper function to register component cleanup
	function registerComponentCleanup(component: any, cleanup: () => void) {
		if (component) {
			componentCleanupRegistry.set(component, cleanup);
		}
	}

	// Helper function to cleanup registered components
	function cleanupAllRegisteredComponents() {
		// Note: WeakMap doesn't have iteration, so we handle cleanup in effectCleanup
		// This is for tracking purposes and future enhancement
	}

	// Helper to resolve current project path for redirects
	function getCurrentProjectPath(): string {
		if (browser) {
			const path = `${window.location.pathname}${window.location.search}`;
			return path.startsWith('/') ? path : `/${path}`;
		}
		return project?.id ? `/projects/${project.id}` : '/projects';
	}

	function openProjectCalendarConnect() {
		modalStore.open('projectCalendarConnect', {
			redirectPath: getCurrentProjectPath()
		});
	}

	// FIXED: Capture data references to prevent reactive loops
	let capturedProjectData = $state<any>(null);
	let capturedCalendarData = $state<any>(null);
	let capturedProjectId = $state<string | null>(null);

	// Capture data changes separately to prevent dual reactive dependencies
	$effect(() => {
		// Only update if we have a new project ID and it's different from what we've captured
		if (data?.project?.id && data.project.id !== capturedProjectId) {
			console.log(
				'[Page] Capturing new project data:',
				data.project.id,
				'Previous:',
				capturedProjectId
			);
			console.log(
				'[Page] Project switch detected - will trigger cleanup and re-initialization'
			);
			capturedProjectData = data.project;
			capturedCalendarData = data.projectCalendar;
			capturedProjectId = data.project.id;
		}
	});

	// Direct reactive access to store - Svelte 5 optimized pattern
	let storeState = $derived($projectStoreV2);

	// Svelte 5 runes for optimal performance and fine-grained reactivity
	// Use store if available, otherwise use data from server (ensures immediate render)
	let project = $derived(storeState?.project);
	let projectCalendar = $derived(storeState?.projectCalendar);
	let tasks = $derived(storeState?.tasks || []);
	let phases = $derived(storeState?.phases || []);
	let notes = $derived(storeState?.notes || []);
	let briefs = $derived(storeState?.briefs || []);
	let synthesis = $derived(storeState?.synthesis);
	let calendarStatus = $derived(storeState?.calendarStatus);

	// Debug calendar status
	$effect(() => {
		if (calendarStatus) {
			console.log('[Page] Calendar status loaded:', calendarStatus);
		}
	});

	$effect(() => {
		if (!browser) return;

		const searchParams = $page.url.searchParams;
		const isCalendarFlow = searchParams.get('calendar') === '1';
		if (!isCalendarFlow) {
			calendarParamsHandled = false;
			return;
		}

		if (!project?.id) {
			return;
		}

		if (calendarParamsHandled) {
			return;
		}

		calendarParamsHandled = true;
		const successParam = searchParams.get('success');
		const connectedParam = searchParams.get('calendar_connected');
		const errorParam = searchParams.get('error');

		if (successParam === 'calendar_connected' || connectedParam === '1') {
			toastService.success('Google Calendar connected successfully');
			refreshCalendarStatus(project.id);
			clearCalendarQueryParams();
			return;
		}

		if (errorParam) {
			toastService.error(mapCalendarError(errorParam));
			clearCalendarQueryParams();
		}
	});
	let activeTab = $derived(storeState?.activeTab || 'overview');
	let loadingStates = $derived(storeState?.loadingStates || {});
	let stats = $derived(storeState?.stats || {});

	// Derived stores - these are already optimized in the store
	const activeTasks = projectStoreV2.activeTasks;

	let calendarParamsHandled = false;

	function mapCalendarError(code: string): string {
		switch (code) {
			case 'access_denied':
				return 'Google Calendar access was denied. Please try again.';
			case 'no_authorization_code':
				return 'No authorization code was received from Google. Please try connecting again.';
			case 'invalid_state':
				return 'The calendar connection expired. Please start the connection again.';
			case 'token_exchange_failed':
				return 'We could not finalize the Google Calendar connection. Please retry.';
			default:
				return code;
		}
	}

	async function refreshCalendarStatus(projectId: string) {
		try {
			if (dataService) {
				await dataService.loadCalendarStatus({ force: true });
				return;
			}

			const response = await fetch(`/api/projects/${projectId}/calendar-status`, {
				headers: { 'Cache-Control': 'no-cache' }
			});

			if (!response.ok) {
				throw new Error(`Failed to refresh calendar status: ${response.status}`);
			}

			const result = await response.json();
			const status = result?.data?.calendarStatus || result?.calendarStatus;
			if (status) {
				projectStoreV2.setCalendarStatus(status);
			}
		} catch (error) {
			console.error('Failed to refresh calendar status:', error);
		}
	}

	function clearCalendarQueryParams() {
		if (!browser) return;

		const currentUrl = new URL(window.location.href);
		['success', 'calendar_connected', 'error', 'calendar'].forEach((param) =>
			currentUrl.searchParams.delete(param)
		);
		window.history.replaceState(
			{},
			'',
			`${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
		);
	}
	const completedTasks = projectStoreV2.completedTasks;
	const deletedTasks = projectStoreV2.deletedTasks;
	const scheduledTasks = projectStoreV2.scheduledTasks;
	const backlogTasks = projectStoreV2.backlogTasks;

	// Local UI state - use $state for reactive values
	let innerWidth = $state(640); // Default to Tailwind's sm: breakpoint
	let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	// Lazy loaded components - use $state for reactive values
	let TasksList = $state<any>(null);
	let NotesSection = $state<any>(null);
	let ProjectSynthesis = $state<any>(null);
	let PhasesSection = $state<any>(null);

	// Component loading states - must be reactive in Svelte 5
	let loadingComponents = $state<Record<string, boolean>>({});

	// FIXED: Unified component loading with performance monitoring
	async function loadComponent(name: string, tab: string) {
		if (loadingComponents[name]) return;

		// FIXED: Start performance monitoring for component loading
		startTimer(`component-loading-${name}`, { component: name, tab });

		// Set component loading state
		loadingStateManager.setComponentLoading(tab, true);
		loadingComponents = { ...loadingComponents, [name]: true };

		try {
			switch (name) {
				case 'TasksList':
					TasksList = (await import('$lib/components/project/TasksList.svelte')).default;
					break;
				case 'NotesSection':
					NotesSection = (await import('$lib/components/project/NotesSection.svelte'))
						.default;
					break;
				case 'ProjectSynthesis':
					ProjectSynthesis = (
						await import('$lib/components/project/ProjectSynthesis.svelte')
					).default;
					break;
				case 'PhasesSection':
					const module = await import('$lib/components/project/PhasesSection.svelte');
					PhasesSection = module.default;
					break;
			}
		} catch (error) {
			console.error(`Failed to load ${name}:`, error);
			toastService.error(`Failed to load ${name}`);
			// FIXED: End timer with error info
			endTimer(`component-loading-${name}`, {
				component: name,
				tab,
				error: error instanceof Error ? error.message : String(error)
			});
		} finally {
			// FIXED: End performance monitoring for successful loads
			endTimer(`component-loading-${name}`, { component: name, tab });

			// Clear component loading state
			loadingStateManager.setComponentLoading(tab, false);
			loadingComponents = { ...loadingComponents, [name]: false };
		}
	}

	// Progressive data loading based on tab with unified state management
	async function loadDataForTab(tab: string) {
		if (!dataService || !data.project?.id) {
			console.log('[Page] Cannot load data - missing dataService or project.id');
			return;
		}

		// Prevent duplicate loading operations
		if (loadingStates[tab as keyof typeof loadingStates] === 'loading') {
			console.log('[Page] Already loading data for tab:', tab);
			return;
		}

		// Check if we already have data to prevent unnecessary skeleton
		const hasExistingData = getHasExistingDataForTab(tab);

		// Set loading state
		loadingStateManager.setDataLoading(tab, 'loading', hasExistingData);

		try {
			// Load data based on priority for the current tab
			await dataService.loadByPriority(tab);
			loadingStateManager.setDataLoading(tab, 'success', true);
		} catch (error) {
			console.error(`Error loading data for tab ${tab}:`, error);
			loadingStateManager.setDataLoading(tab, 'error', hasExistingData);
		}
	}

	// Helper to check if tab has existing data
	function getHasExistingDataForTab(tab: string): boolean {
		// Check if data has been loaded (regardless of whether it's empty)
		// This ensures skeleton only shows during actual loading, not for empty projects
		switch (tab) {
			case 'overview':
				return loadingStates.phases === 'success' && loadingStates.tasks === 'success';
			case 'tasks':
				return loadingStates.tasks === 'success';
			case 'notes':
				return loadingStates.notes === 'success';
			case 'briefs':
				return loadingStates.briefs === 'success';
			case 'synthesis':
				// Synthesis is special - check both loading state and content
				return loadingStates.synthesis === 'success' || synthesis !== null;
			default:
				return false;
		}
	}

	// Smart container height calculation based on content type and screen size
	function computeSmartContainerHeight(): string {
		const baseHeight = innerWidth < 640 ? 400 : 500; // Mobile vs desktop base
		const hasData = getHasExistingDataForTab(activeTab);

		switch (activeTab) {
			case 'overview':
				return hasData ? 'auto' : `${baseHeight + 200}px`;
			case 'tasks':
				return hasData ? 'auto' : `${baseHeight + 100}px`;
			case 'notes':
				return hasData ? 'auto' : `${baseHeight}px`;
			case 'briefs':
				return hasData ? 'auto' : `${baseHeight}px`;
			case 'synthesis':
				return hasData ? 'auto' : `${baseHeight + 150}px`;
			default:
				return `${baseHeight}px`;
		}
	}

	let smartContainerHeight = $derived(computeSmartContainerHeight());

	// Track previous activeTab to avoid redundant loads
	let previousActiveTab = $state<string>('');

	// FIXED: Tab loading effect - only load components, data is loaded eagerly
	$effect(() => {
		if (browser && activeTab && activeTab !== previousActiveTab && initializedProjectId) {
			// Update the previous tab tracker
			const currentTab = activeTab;
			previousActiveTab = activeTab;

			// Guard against tab loading during project initialization
			if (!storeInitialized) {
				console.log('[Page] Skipping tab load during initialization:', currentTab);
				return;
			}

			// Use untrack to prevent loading state updates from triggering reactive loops
			import('svelte').then(({ untrack }) => {
				setTimeout(() => {
					untrack(async () => {
						try {
							console.log('[Page] Loading component for tab:', currentTab);
							// FIXED: Only load component, data is already loaded eagerly
							const componentMap = {
								tasks: 'TasksList',
								notes: 'NotesSection',
								synthesis: 'ProjectSynthesis',
								overview: 'PhasesSection'
							};

							const componentName =
								componentMap[currentTab as keyof typeof componentMap];
							if (componentName) {
								await loadComponent(componentName, currentTab);
							}

							// For synthesis, also load data since it's more expensive
							if (currentTab === 'synthesis') {
								const hasExistingData = synthesis !== null;
								if (!hasExistingData) {
									await loadDataForTab('synthesis');
								}
							}

							// For briefs, load data since it wasn't loaded eagerly
							if (currentTab === 'briefs') {
								const hasExistingData = briefs.length > 0;
								if (!hasExistingData) {
									await loadDataForTab('briefs');
								}
							}
						} catch (error) {
							console.error('[Page] Error loading tab:', currentTab, error);
						}
					});
				}, 0);
			});
		}
	});

	// Coordinate loading sequence for optimal UX
	async function coordinateTabLoad(tab: string) {
		const componentMap = {
			tasks: 'TasksList',
			notes: 'NotesSection',
			synthesis: 'ProjectSynthesis',
			overview: 'PhasesSection'
		};

		const componentName = componentMap[tab as keyof typeof componentMap];

		if (componentName) {
			// Use the loading state manager's coordinated loading
			await loadingStateManager.coordinateTabLoad(
				tab,
				() => loadDataForTab(tab),
				() => loadComponent(componentName, tab)
			);
		} else {
			// For tabs without components (like briefs), just load data
			await loadDataForTab(tab);
		}
	}

	// Event Handlers with Optimistic Updates
	async function handleTaskCreated(task: any) {
		if (!dataService || !data.project?.id) return;

		try {
			await dataService.createTask(task);
			toastService.success('Task created successfully');
		} catch (error) {
			toastService.error('Failed to create task');
			console.error('Error creating task:', error);
		}
	}

	async function handleTaskUpdated(task: any) {
		if (!dataService || !data.project?.id) return;

		try {
			await dataService.updateTask(task.id, task);

			// If task was added to calendar, ensure we have the latest calendar events
			// This handles any edge cases where the API might not have waited for calendar sync
			if (task.addTaskToCalendar || task.task_calendar_events?.length) {
				// Force reload the specific task to get updated calendar events
				await dataService.loadTasks({ force: true });
			}

			toastService.success('Task updated successfully');
		} catch (error) {
			toastService.error('Failed to update task');
			console.error('Error updating task:', error);
		}
	}

	async function handleTaskDeleted(taskId: string) {
		if (!dataService || !data.project?.id) return;

		try {
			await dataService.deleteTask(taskId);
			toastService.success('Task deleted successfully');
		} catch (error) {
			toastService.error('Failed to delete task');
			console.error('Error deleting task:', error);
		}
	}

	async function handleAddTaskToCalendar(task: any) {
		if (!projectService || !data.project?.id) return;

		projectStoreV2.setLoadingState('calendar', 'loading');

		try {
			const result = await projectService.addTaskToCalendar(
				task.id,
				data.project.id,
				timeZone
			);

			if (result.data?.task) {
				await projectStoreV2.optimisticUpdateTask(
					task.id,
					result.data.task,
					async () => result.data!.task
				);
			}
			toastService.success('Task added to calendar');
		} catch (error) {
			toastService.error('Failed to add task to calendar');
			console.error('Error adding to calendar:', error);
		} finally {
			projectStoreV2.setLoadingState('calendar', 'idle');
		}
	}

	async function handleMarkTaskDeleted(task: any) {
		modalStore.open('markDeleted', task);
	}

	async function handleConfirmMarkDeleted(task: any) {
		modalStore.close('markDeleted');

		if (!dataService || !data.project?.id) return;

		try {
			await dataService.updateTask(task.id, {
				...task,
				deleted_at: new Date().toISOString()
			});
			toastService.success('Task deleted');
		} catch (error) {
			toastService.error('Failed to delete task');
			console.error('Error deleting task:', error);
		}
	}

	async function handleNoteSave(noteInput: Partial<Note> | null | undefined) {
		if (!dataService || !data.project?.id || !noteInput) return;

		const sanitizedNote: Partial<Note> = {
			title: noteInput.title?.trim() ?? '',
			content: noteInput.content?.trim() ?? '',
			category: noteInput.category ?? '',
			tags: Array.isArray(noteInput.tags) ? noteInput.tags : [],
			project_id: noteInput.project_id ?? data.project.id
		};

		try {
			if (noteInput.id) {
				await dataService.updateNote(noteInput.id, sanitizedNote);
			} else {
				await dataService.createNote(sanitizedNote);
			}
			toastService.success('Note saved successfully');
		} catch (error) {
			toastService.error('Failed to save note');
			console.error('Error saving note:', error);
		}
	}

	async function handleNoteDelete(noteId: string): Promise<boolean> {
		if (!projectService || !data.project?.id) {
			toastService.error('Failed to delete note: missing project context');
			return false;
		}

		try {
			const response = await projectService.deleteNote(noteId, data.project.id);
			if (!response.success) {
				throw new Error(response.errors?.[0] || 'Failed to delete note');
			}

			toastService.success('Note deleted successfully');
			return true;
		} catch (error) {
			console.error('Error deleting note:', error);
			const message = error instanceof Error ? error.message : 'Failed to delete note';
			toastService.error(message);
			throw error;
		}
	}

	function handlePhaseUpdated() {
		// Phases are automatically updated through store subscriptions
	}

	async function handleTasksScheduled(event: CustomEvent) {
		const { successfulTasks, failedTasks, totalTasks, needsRefresh } = event.detail;

		// Show success message
		if (successfulTasks && successfulTasks.length > 0) {
			const successCount = successfulTasks.length;
			const failureCount = failedTasks ? failedTasks.length : 0;

			if (failureCount > 0) {
				toastService.warning(
					`Scheduled ${successCount} of ${totalTasks} tasks. ${failureCount} failed.`
				);
			} else {
				toastService.success(`Successfully scheduled ${successCount} tasks`);
			}
		}

		// Force reload of tasks and phases to ensure UI is fully synced
		if (needsRefresh && dataService && data.project?.id) {
			try {
				// Set loading state while refreshing
				projectStoreV2.setLoadingState('tasks', 'loading');

				// Reload tasks with calendar events
				await dataService.loadTasks({ force: true });
				// Reload phases to update phase-level task counts and statuses
				await dataService.loadPhases({ force: true });

				projectStoreV2.setLoadingState('tasks', 'idle');
			} catch (error) {
				console.error('Error refreshing data after scheduling:', error);
				projectStoreV2.setLoadingState('tasks', 'error');
			}
		}
	}

	async function handleProjectUpdated(eventOrProject: any) {
		// Handle both CustomEvent and direct project object
		const updatedProject = eventOrProject?.detail || eventOrProject;
		if (updatedProject) {
			projectStoreV2.updateStoreState({
				project: { ...project, ...updatedProject }
			});
		}
	}

	async function handleGenerateSynthesis(options?: any) {
		if (!synthesisService) return;

		projectStoreV2.setLoadingState('synthesis', 'loading');

		try {
			const synthesis = await synthesisService.generateSynthesis(options);
			if (synthesis) {
				projectStoreV2.setSynthesis(synthesis);
			}
			toastService.success('Synthesis generated successfully');
		} catch (error) {
			console.error('Error generating synthesis:', error);
			toastService.error('Failed to generate synthesis');
		} finally {
			projectStoreV2.setLoadingState('synthesis', 'idle');
		}
	}

	async function handleSaveSynthesis(
		synthesisContent: any,
		status?: 'draft' | 'completed',
		synthesisId?: string
	) {
		if (!synthesisService) return null;

		try {
			const savedSynthesis = await synthesisService.saveSynthesis(
				synthesisContent,
				status,
				synthesisId
			);
			if (savedSynthesis) {
				projectStoreV2.setSynthesis(savedSynthesis);
			}
			return savedSynthesis;
		} catch (error) {
			console.error('Error saving synthesis:', error);
			return null;
		}
	}

	async function handleDeleteSynthesis() {
		if (!synthesisService) return false;

		try {
			const success = await synthesisService.deleteSynthesis();
			if (success) {
				projectStoreV2.setSynthesis(null);
			}
			return success;
		} catch (error) {
			console.error('Error deleting synthesis:', error);
			return false;
		}
	}

	async function handleDeleteProject() {
		if (!data.project?.id) return;

		projectStoreV2.setLoadingState('project', 'loading');

		try {
			const response = await fetch(`/api/projects/${data.project.id}/delete`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message || 'Failed to delete project');
			}

			toastService.success('Project deleted successfully');
			modalStore.close('projectDelete');

			// Clear project cache before navigating
			if (typeof window !== 'undefined' && browser) {
				const projectService = ProjectService.getInstance();
				projectService.clearCache();
			}

			// Navigate with a query param to force refresh
			await goto('/projects?refresh=true');
		} catch (error: any) {
			console.error('Error deleting project:', error);
			toastService.error(error.message || 'Failed to delete project');
		} finally {
			projectStoreV2.setLoadingState('project', 'idle');
		}
	}

	async function handleTabChange(tab: any) {
		projectStoreV2.updateStoreState({
			activeTab: tab
		});

		// Remove duplicate tab loading - tab change effect will handle data loading
		// This prevents race conditions where loadDataForTab is called twice
	}

	async function handlePhaseGenerationConfirm(params: any) {
		if (!project?.id) {
			toastService.error('Project context missing. Unable to start phase generation.');
			return;
		}

		try {
			await startPhaseGeneration({
				projectId: project.id,
				projectName: project.name ?? 'Project',
				isRegeneration: (projectStoreV2.getState().phases ?? []).length > 0,
				taskCount:
					typeof params.task_count === 'number'
						? params.task_count
						: (projectStoreV2.getState().tasks?.length ?? 0),
				selectedStatuses: params.selected_statuses ?? [],
				requestPayload: params
			});
		} catch (error) {
			console.error('Failed to start phase generation notification:', error);
			const message = error instanceof Error ? error.message : 'Failed to generate phases';
			toastService.error(message);
		}
	}

	async function handlePhaseUnscheduleConfirm(data: any) {
		// Implementation remains the same
		if (!data?.phases) return;

		try {
			const results = [];
			const errors = [];

			for (const phase of data.phases) {
				try {
					const response = await fetch(
						`/api/projects/${project?.id}/phases/${phase.id}/schedule`,
						{
							method: 'DELETE',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
							})
						}
					);

					const result = await response.json();

					if (!response.ok) {
						throw new Error(
							result.error || `Failed to unschedule tasks in phase: ${phase.name}`
						);
					}

					results.push({
						phaseId: phase.id,
						phaseName: phase.name,
						...result
					});
				} catch (err) {
					console.error(`Error unscheduling phase ${phase.id}:`, err);
					errors.push({
						phaseId: phase.id,
						phaseName: phase.name,
						error: err instanceof Error ? err.message : 'Unknown error'
					});
				}
			}

			const totalUnscheduled = results.reduce(
				(sum, r) => sum + (r.summary?.successful || 0),
				0
			);
			const totalErrors =
				results.reduce((sum, r) => sum + (r.summary?.failed || 0), 0) + errors.length;

			if (totalUnscheduled > 0) {
				results.forEach((r) => {
					if (r.updatedTasks) {
						const currentTasks = [...tasks];
						r.updatedTasks.forEach((task: any) => {
							const taskIndex = currentTasks.findIndex((t) => t.id === task.id);
							if (taskIndex >= 0) {
								currentTasks[taskIndex] = task;
							}
						});
						projectStoreV2.setTasks(currentTasks);
					}
				});
				toastService.success(`Successfully unscheduled ${totalUnscheduled} task(s)`);
			}

			if (totalErrors > 0) {
				toastService.warning(`${totalErrors} task(s) could not be unscheduled`);
			}

			if (totalUnscheduled === 0 && totalErrors === 0) {
				toastService.info('No tasks were scheduled');
			}
		} catch (err) {
			console.error('Error in bulk unscheduling:', err);
			const error = err instanceof Error ? err.message : 'Failed to unschedule tasks';
			toastService.error(error);
		}
	}

	async function handlePhaseDelete(phase: Phase) {
		// Optimistic delete
		projectStoreV2.setPhases(phases.filter((p: Phase) => p.id !== phase.id));
		toastService.success('Phase deleted successfully');

		try {
			const response = await fetch(`/api/projects/${project?.id}/phases/${phase.id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				// Rollback on error
				await dataService.loadPhases({ force: true });
				const error = await response.json();
				throw new Error(error.error || 'Failed to delete phase');
			}
		} catch (err: any) {
			toastService.error(err?.message || 'Failed to delete phase');
		}
	}

	async function handleProjectDatesUpdated(event: CustomEvent) {
		const { start_date, end_date } = event.detail;
		await handleProjectUpdated({ start_date, end_date });
		toastService.success('Project dates updated successfully');
	}

	async function handleScheduleAllPhases(event: CustomEvent) {
		// Refresh phase data after bulk scheduling
		await dataService.loadPhases({ force: true });
		await dataService.loadTasks({ force: true });
		toastService.success('Tasks scheduled successfully');
	}

	// Tab counts from store data using Svelte 5 runes
	// These are already derived stores from projectStoreV2, so we can access them directly with $
	let tabCounts = $derived.by(() => {
		// Access the derived stores' values using $
		const completedTasksList = $completedTasks;
		const deletedTasksList = $deletedTasks;
		const scheduledTasksList = $scheduledTasks;

		return {
			tasks: tasks?.length || 0,
			notes: notes?.length || 0,
			deletedTasks: deletedTasksList?.length || 0,
			doneTasks: completedTasksList?.length || 0,
			phases: phases?.length || 0,
			scheduled: scheduledTasksList?.length || 0,
			briefs: briefs?.length || 0
		};
	});

	// FIXED: Use get() from svelte/store to access loading state directly

	// FIXED: Simple loading state based on component loading and data availability
	let shouldShowSkeleton = $derived.by(() => {
		try {
			// Always show skeleton until store is initialized
			if (!storeInitialized) return true;

			if (!activeTab) return true;

			// Check if data has been loaded (success state) for the current tab
			// This now properly handles empty projects by checking loading state, not content
			const hasData = getHasExistingDataForTab(activeTab);

			// Check if component is loading or not loaded
			const isComponentLoading =
				loadingComponents[getComponentNameForTab(activeTab)] || false;
			const isComponentLoaded = isComponentLoadedForTab(activeTab);

			// Show skeleton if data hasn't loaded OR if component is not ready
			return !hasData || isComponentLoading || !isComponentLoaded;
		} catch (error) {
			console.error('[Page] Error accessing shouldShowSkeleton:', error);
			return true; // Default to showing skeleton on error
		}
	});

	let shouldShowLoadingIndicator = $derived.by(() => {
		try {
			if (!activeTab) return false;
			// Show loading indicator when component is loading but we have data
			const hasData = getHasExistingDataForTab(activeTab);
			const isComponentLoading =
				loadingComponents[getComponentNameForTab(activeTab)] || false;
			return hasData && isComponentLoading;
		} catch (error) {
			console.error('[Page] Error accessing shouldShowLoadingIndicator:', error);
			return false;
		}
	});

	let loadingMessage = $derived.by(() => {
		try {
			if (!activeTab) return 'Loading...';
			const isComponentLoading =
				loadingComponents[getComponentNameForTab(activeTab)] || false;

			if (isComponentLoading) {
				return `Loading ${activeTab} component...`;
			}
			return 'Loading...';
		} catch (error) {
			console.error('[Page] Error accessing loadingMessage:', error);
			return 'Loading...';
		}
	});

	// Progressive enhancement pattern - content is ready when we have data and component
	let isTabContentReady = $derived.by(() => {
		try {
			// Not ready until store is initialized
			if (!storeInitialized) return false;

			if (!activeTab) return false;

			const hasData = getHasExistingDataForTab(activeTab);
			const isComponentLoaded = isComponentLoadedForTab(activeTab);
			const isComponentLoading =
				loadingComponents[getComponentNameForTab(activeTab)] || false;

			// Ready when we have data AND component is loaded AND not currently loading
			const ready = hasData && isComponentLoaded && !isComponentLoading;

			// Debug logging for overview tab
			if (activeTab === 'overview') {
				console.log('[Page] Overview tab ready check:', {
					hasData,
					isComponentLoaded,
					isComponentLoading,
					ready,
					storeInitialized
				});
			}

			return ready;
		} catch (error) {
			console.error('[Page] Error accessing isTabContentReady:', error);
			return false;
		}
	});

	// Helper functions for component state
	function getComponentNameForTab(tab: string): string {
		const componentMap = {
			tasks: 'TasksList',
			notes: 'NotesSection',
			synthesis: 'ProjectSynthesis',
			overview: 'PhasesSection'
		};
		return componentMap[tab as keyof typeof componentMap] || '';
	}

	function isComponentLoadedForTab(tab: string): boolean {
		switch (tab) {
			case 'overview':
				return PhasesSection !== null;
			case 'tasks':
				return TasksList !== null;
			case 'notes':
				return NotesSection !== null;
			case 'synthesis':
				return ProjectSynthesis !== null;
			case 'briefs':
				return true; // No lazy loading for briefs
			default:
				return true;
		}
	}

	// FIXED: Use $effect.root to prevent cleanup/re-initialization loops
	let effectCleanup: (() => void) | null = null;

	// Helper function to create cleanup closure with captured references
	function createCleanupFunction(
		projectId: string,
		registeredDataService: any,
		registeredSynthesisService: any,
		registeredProjectService: any
	) {
		return () => {
			console.log('[Page] Cleaning up project:', projectId);

			// Cleanup services - use registered references to ensure cleanup even if error during init
			if (registeredDataService) {
				try {
					registeredDataService.destroy();
				} catch (error) {
					console.error('[Page] DataService cleanup error:', error);
				}
			}

			if (registeredSynthesisService) {
				try {
					// SynthesisService might not have destroy method - that's okay
					if (typeof registeredSynthesisService.destroy === 'function') {
						registeredSynthesisService.destroy();
					}
				} catch (error) {
					console.error('[Page] SynthesisService cleanup error:', error);
				}
			}

			// Cleanup realtime (async, don't await)
			RealtimeProjectService.cleanup().catch((error) => {
				console.error('[Page] Realtime cleanup error:', error);
			});

			// FIXED: Complete state reset on cleanup
			console.log('[Page] Resetting all state during cleanup');

			// Reset store
			projectStoreV2.reset();

			// Reset loading states
			loadingStateManager.resetAll();

			// FIXED: Enhanced component cleanup with verification
			loadingComponents = {};

			// Cleanup components with verification
			if (TasksList && typeof TasksList.cleanup === 'function') {
				try {
					TasksList.cleanup();
				} catch (error) {
					console.warn('[Page] TasksList cleanup error:', error);
				}
			}
			TasksList = null;

			if (NotesSection && typeof NotesSection.cleanup === 'function') {
				try {
					NotesSection.cleanup();
				} catch (error) {
					console.warn('[Page] NotesSection cleanup error:', error);
				}
			}
			NotesSection = null;

			if (ProjectSynthesis && typeof ProjectSynthesis.cleanup === 'function') {
				try {
					ProjectSynthesis.cleanup();
				} catch (error) {
					console.warn('[Page] ProjectSynthesis cleanup error:', error);
				}
			}
			ProjectSynthesis = null;

			if (PhasesSection && typeof PhasesSection.cleanup === 'function') {
				try {
					PhasesSection.cleanup();
				} catch (error) {
					console.warn('[Page] PhasesSection cleanup error:', error);
				}
			}
			PhasesSection = null;

			// Reset initialization state
			storeInitialized = false;

			// Remove brain dump event listeners
			if (browser) {
				window.removeEventListener('brain-dump-applied', handleBrainDumpApplied as any);
				window.removeEventListener(
					'brain-dump-updates-available',
					handleBrainDumpUpdatesAvailable as any
				);
			}
		};
	}

	$effect(() => {
		// FIXED: Use untrack to prevent reactive dependency cascades
		const projectId = capturedProjectId;

		// Use untrack for all the initialization logic to prevent reactive loops
		import('svelte').then(({ untrack }) => {
			untrack(() => {
				// Early exit if no project ID
				if (!browser || !projectId) {
					return;
				}

				// If already initialized for this project, don't re-initialize
				if (projectId === initializedProjectId) {
					return;
				}

				// Get captured data (non-reactive read since we already captured)
				const currentProject = capturedProjectData;
				const projectCalendar = capturedCalendarData;

				// Double-check we have valid project data
				if (!currentProject) {
					return;
				}

				// FIXED: Start performance monitoring
				startTimer('page-initialization', {
					projectId,
					previousProject: initializedProjectId
				});
				takeMemorySnapshot('project-init-start', window.location.href);

				// Cleanup previous initialization if needed
				if (effectCleanup) {
					effectCleanup();
					effectCleanup = null;
				}

				// Reset store completely
				projectStoreV2.reset();

				// Reset loading state manager
				loadingStateManager.resetAll();

				// Reset component loading states
				loadingComponents = {};

				// Reset component references
				TasksList = null;
				NotesSection = null;
				ProjectSynthesis = null;
				PhasesSection = null;

				// Reset initialization flags
				storeInitialized = false;

				// Mark as initialized BEFORE starting async work
				initializedProjectId = projectId;

				// Use $effect.root to prevent cleanup issues
				import('svelte').then(({ untrack }) => {
					untrack(() => {
						// Start async initialization
						(async () => {
							let registeredDataService = null;
							let registeredSynthesisService = null;
							let registeredProjectService = null;

							try {
								timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

								// Initialize services
								dataService = new ProjectDataService(projectId);
								registeredDataService = dataService;

								synthesisService = new ProjectSynthesisService(projectId);
								registeredSynthesisService = synthesisService;

								projectService = ProjectService.getInstance();
								registeredProjectService = projectService;

								// Register cleanup IMMEDIATELY after all services created but BEFORE async work
								effectCleanup = createCleanupFunction(
									projectId,
									registeredDataService,
									registeredSynthesisService,
									registeredProjectService
								);

								// Initialize store with captured references
								if (!storeInitialized) {
									projectStoreV2.initialize(currentProject, projectCalendar);
									storeInitialized = true;
								}

								// FIXED: Load all essential data eagerly on project init
								// console.log('[Page] Loading essential data...');
								await Promise.allSettled([
									dataService.loadPhases(),
									dataService.loadTasks(),
									dataService.loadNotes(),
									dataService.loadStats(),
									dataService.loadCalendarStatus() // FIXED: Load calendar status for tasks
								]);

								// FIXED: Load overview component AFTER data is loaded and await it
								// console.log('[Page] Loading PhasesSection component...');
								await loadComponent('PhasesSection', 'overview');
								// console.log('[Page] PhasesSection component loaded');

								// Mark all tabs as having data loaded
								loadingStateManager.setDataLoading('overview', 'success', true);
								loadingStateManager.setDataLoading('tasks', 'success', true);
								loadingStateManager.setDataLoading('notes', 'success', true);

								// Initialize real-time subscriptions
								if (supabase) {
									await RealtimeProjectService.initialize(projectId, supabase);
								}

								console.log('[Page] Initialization complete for:', projectId);

								// FIXED: End performance monitoring
								endTimer('page-initialization', { projectId });
								takeMemorySnapshot('project-init-complete', window.location.href);
							} catch (error) {
								console.error('[Page] Initialization error:', error);
								// Reset on error to allow retry
								initializedProjectId = null;
							}
						})();
					});
				});
			});
		});
	});

	// Cleanup on component unmount
	$effect(() => {
		return () => {
			if (effectCleanup) {
				effectCleanup();
				effectCleanup = null;
			}
			initializedProjectId = null;
		};
	});

	// Event handlers for brain dump seamless updates
	function handleBrainDumpApplied(event: CustomEvent) {
		const { projectId, projectName } = event.detail;

		// Check if this is for our current project
		if (projectId === project?.id) {
			console.log('[Page] Brain dump applied to current project, refreshing data...');

			// Show subtle notification
			toastService.info('✨ Project data refreshing...', {
				duration: 2000
			});

			// Trigger data refresh without full page reload
			if (dataService) {
				dataService.refreshAll();
			}
		}
	}

	function handleBrainDumpUpdatesAvailable(event: CustomEvent) {
		const { projectId, updates, timestamp } = event.detail;

		// Check if this is for our current project
		if (projectId === project?.id) {
			console.log('[Page] Brain dump updates available for current project');

			// Show update notification with action
			toastService.info('📥 New updates available for this project', {
				duration: 0, // Keep open until action
				action: {
					label: 'Refresh',
					onClick: () => {
						window.location.reload();
					}
				}
			});
		}
	}

	// Add event listeners for brain dump updates
	$effect(() => {
		if (!browser) return;

		// Add listeners
		window.addEventListener('brain-dump-applied', handleBrainDumpApplied as any);
		window.addEventListener(
			'brain-dump-updates-available',
			handleBrainDumpUpdatesAvailable as any
		);

		// Cleanup
		return () => {
			window.removeEventListener('brain-dump-applied', handleBrainDumpApplied as any);
			window.removeEventListener(
				'brain-dump-updates-available',
				handleBrainDumpUpdatesAvailable as any
			);
		};
	});
</script>

<svelte:window bind:innerWidth />

<svelte:head>
	<title>{project?.name || 'Project'} - BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
		{#if project}
			<!-- Project Header -->
			<ProjectHeader
				onEdit={() => modalStore.open('projectEdit')}
				onViewHistory={() => modalStore.open('projectHistory')}
				onDelete={() => modalStore.open('projectDelete')}
				onCalendarSettings={() => modalStore.open('projectCalendarSettings')}
				onConnectCalendar={openProjectCalendarConnect}
			/>

			<!-- Tabs -->
			<div class="mt-6">
				<ProjectTabs
					activeTab={activeTab as any}
					{tabCounts}
					isMobile={innerWidth < 640}
					on:change={(e) => handleTabChange(e.detail)}
				/>
			</div>

			<!-- Tab Content with Smart Min-Height for Zero Layout Shift -->
			<div class="mt-6" style="min-height: {smartContainerHeight}">
				<!-- Use show/hide pattern instead of key to preserve component state -->
				<div class="tab-content">
					<!-- Overview Tab -->
					<div class:hidden={activeTab !== 'overview'}>
						{#if activeTab === 'overview'}
							{#if shouldShowSkeleton}
								<PhasesSkeleton />
							{:else if PhasesSection}
								<PhasesSection
									calendarConnected={calendarStatus?.isConnected}
									onEditTask={(task: Task) => modalStore.open('task', task)}
									onCreateTask={(phaseId: Number) =>
										modalStore.open('task', null, { phaseId })}
									on:taskUpdated={(e: CustomEvent) => handleTaskUpdated(e.detail)}
									on:taskDeleted={(e: CustomEvent) => handleTaskDeleted(e.detail)}
									on:projectUpdated={handleProjectUpdated}
									on:tasksScheduled={handleTasksScheduled}
								/>
							{:else}
								<!-- Progressive loading - show subtle loading indicator until ready -->
								<div class="flex items-center justify-center py-16">
									<LoadingSkeleton message={loadingMessage} height="200px" />
								</div>
							{/if}
						{/if}
					</div>

					<!-- Tasks Tab -->
					<div class:hidden={activeTab !== 'tasks'}>
						{#if activeTab === 'tasks'}
							{#if shouldShowSkeleton}
								<TaskListSkeleton />
							{:else if TasksList}
								<TasksList
									onCreateTask={() => modalStore.open('task')}
									onEditTask={(task: Task) => modalStore.open('task', task)}
									onAddTaskToCalendar={handleAddTaskToCalendar}
									onMarkDeleted={handleMarkTaskDeleted}
									{calendarStatus}
									{innerWidth}
								/>
							{:else}
								<div class="flex items-center justify-center py-16">
									<LoadingSkeleton message={loadingMessage} height="200px" />
								</div>
							{/if}
						{/if}
					</div>

					<!-- Briefs Tab -->
					<div class:hidden={activeTab !== 'briefs'}>
						{#if activeTab === 'briefs'}
							{#if shouldShowSkeleton}
								<BriefsSkeleton />
							{:else}
								<ProjectBriefsSection
									briefsLoaded={briefs.length > 0 ||
										loadingStates.briefs === 'success'}
									briefsLoading={loadingStates.briefs === 'loading'}
									briefsError={null}
									onViewBrief={(brief) => modalStore.open('brief', brief)}
									onRetryLoad={() => dataService?.loadBriefs({ force: true })}
								/>
							{/if}
						{/if}
					</div>

					<!-- Notes Tab -->
					<div class:hidden={activeTab !== 'notes'}>
						{#if activeTab === 'notes'}
							{#if shouldShowSkeleton}
								<NotesListSkeleton />
							{:else if NotesSection}
								<NotesSection
									onCreateNote={() => modalStore.open('note')}
									onEditNote={(note: Note) => modalStore.open('note', note)}
									onDeleteNote={(note: Note) => handleNoteDelete(note.id)}
								/>
							{:else}
								<div class="flex items-center justify-center py-16">
									<LoadingSkeleton message={loadingMessage} height="200px" />
								</div>
							{/if}
						{/if}
					</div>

					<!-- Synthesis Tab -->
					<div class:hidden={activeTab !== 'synthesis'}>
						{#if activeTab === 'synthesis'}
							{#if shouldShowSkeleton}
								<SynthesisSkeleton />
							{:else if ProjectSynthesis}
								<ProjectSynthesis
									loading={loadingStates.synthesis === 'loading'}
									error={null}
									onGenerate={handleGenerateSynthesis}
									onSaveSynthesis={handleSaveSynthesis}
									onDeleteSynthesis={handleDeleteSynthesis}
									onGenerationFinished={() =>
										dataService?.loadSynthesis({ force: true })}
								/>
							{:else}
								<div class="flex items-center justify-center py-16">
									<LoadingSkeleton message={loadingMessage} height="200px" />
								</div>
							{/if}
						{/if}
					</div>
				</div>
			</div>
		{:else}
			<div class="text-center py-16">
				<div
					class="bg-white dark:bg-gray-800 rounded-xl p-8 max-w-md mx-auto shadow-sm border border-gray-200 dark:border-gray-700"
				>
					<p class="text-gray-500 dark:text-gray-400">Project not found</p>
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- Modals -->
{#if project}
	<ProjectModals
		{project}
		isDeleting={loadingStates.project === 'loading'}
		{calendarStatus}
		taskCount={tabCounts?.tasks || 0}
		noteCount={tabCounts?.notes || 0}
		{tasks}
		deletedTasks={$deletedTasks || []}
		{notes}
		{phases}
		taskStats={stats}
		onProjectUpdated={handleProjectUpdated}
		onTaskCreate={handleTaskCreated}
		onTaskUpdate={handleTaskUpdated}
		onTaskDelete={handleTaskDeleted}
		onNoteUpdate={handleNoteSave}
		onNoteDelete={handleNoteDelete}
		onDeleteConfirm={handleDeleteProject}
		onCalendarRefreshConfirm={() => {
			modalStore.close('calendarRefresh');
			goto('/profile?tab=calendar');
		}}
		onMarkDeletedConfirm={handleConfirmMarkDeleted}
		onPhaseScheduled={handleTasksScheduled}
		onPhaseUpdated={handlePhaseUpdated}
		onPhaseGenerationConfirm={handlePhaseGenerationConfirm}
		onPhaseUnscheduleConfirm={handlePhaseUnscheduleConfirm}
		onPhaseDelete={handlePhaseDelete}
		onProjectDatesUpdated={handleProjectDatesUpdated}
		onScheduleAllPhases={handleScheduleAllPhases}
	/>
{/if}
