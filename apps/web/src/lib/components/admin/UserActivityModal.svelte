<!-- apps/web/src/lib/components/admin/UserActivityModal.svelte -->
<script lang="ts">
	import {
		FolderOpen,
		Activity,
		BarChart3,
		RefreshCw,
		MessageSquare,
		CircleAlert,
		ChevronDown,
		ChevronRight,
		ExternalLink,
		FileText
	} from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ProjectActivityChart from './ProjectActivityChart.svelte';
	import ActivityTimelineChart from './ActivityTimelineChart.svelte';
	import ErrorDetailsModal from './ErrorDetailsModal.svelte';
	import UserContextPanel from './UserContextPanel.svelte';
	import type { ErrorLogEntry } from '$lib/types/error-logging';
	import { onMount } from 'svelte';
	import { toastService } from '$lib/stores/toast.store';

	type ComposeEmailPayload = {
		user: any;
		template: string;
		instructions: string;
	};

	let {
		user,
		onclose,
		onComposeEmail
	}: {
		user: any;
		onclose?: () => void;
		onComposeEmail?: (payload: ComposeEmailPayload) => void;
	} = $props();

	let userContext = $state<any>(null);
	let contextLoading = $state(true);
	let contextError = $state<string | null>(null);
	let isOpen = $state(true);
	let expandedProjectIds = $state<Set<string>>(new Set());
	let selectedError = $state<ErrorLogEntry | null>(null);

	onMount(() => {
		loadUserContext();
	});

	function handleClose() {
		isOpen = false;
		onclose?.();
	}

	async function loadUserContext() {
		contextLoading = true;
		contextError = null;
		try {
			const response = await fetch(`/api/admin/users/${user.id}/context`);
			if (!response.ok) throw new Error('Failed to load user context');
			const result = await response.json();
			if (result.success) {
				userContext = result.data;
			} else {
				throw new Error(result.error || 'Failed to load user context');
			}
		} catch (error) {
			console.error('Error loading user context:', error);
			contextError = error instanceof Error ? error.message : 'Failed to load user context';
			toastService.error('Failed to load user context');
		} finally {
			contextLoading = false;
		}
	}

	function toggleProjectExpansion(projectId: string) {
		const next = new Set(expandedProjectIds);
		if (next.has(projectId)) {
			next.delete(projectId);
		} else {
			next.add(projectId);
		}
		expandedProjectIds = next;
	}

	function openErrorDetails(error: ErrorLogEntry) {
		selectedError = error;
	}

	function handleComposeEmail(event: CustomEvent<{ template: string; instructions: string }>) {
		if (!onComposeEmail) return;

		onComposeEmail({
			user,
			template: event.detail.template,
			instructions: event.detail.instructions
		});
		handleClose();
	}

	function humanizeLabel(value: string | null | undefined): string {
		if (!value) return 'Unknown';
		return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
	}

	function formatLastVisit(dateString: string | null): string {
		if (!dateString) return 'Never';
		const date = new Date(dateString);
		const now = new Date();
		const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
		if (diffHours < 1) return 'Just now';
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffHours < 24 * 7) return `${Math.floor(diffHours / 24)}d ago`;
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function formatRelativeDate(dateString: string | null | undefined): string {
		if (!dateString) return 'Never';
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMinutes = Math.floor(diffMs / (1000 * 60));
		const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffMinutes < 1) return 'Just now';
		if (diffMinutes < 60) return `${diffMinutes}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function formatDateTime(dateString: string | null | undefined): string {
		if (!dateString) return '—';
		return new Date(dateString).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function getProjectBadgeClass(status: string | null | undefined): string {
		switch (status) {
			case 'active':
			case 'in_progress':
				return 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30';
			case 'done':
			case 'completed':
				return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
			case 'paused':
			case 'blocked':
				return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30';
			default:
				return 'bg-muted text-muted-foreground border-border';
		}
	}

	function getTaskBadgeClass(state: string | null | undefined): string {
		switch (state) {
			case 'done':
				return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
			case 'in_progress':
				return 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30';
			case 'blocked':
				return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30';
			default:
				return 'bg-muted text-muted-foreground border-border';
		}
	}

	function getErrorSeverityClass(severity: string | null | undefined): string {
		switch (severity) {
			case 'critical':
				return 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30';
			case 'error':
				return 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30';
			case 'warning':
				return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30';
			case 'info':
				return 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30';
			default:
				return 'bg-muted text-muted-foreground border-border';
		}
	}

	function getSessionStatusClass(status: string | null | undefined): string {
		switch (status) {
			case 'active':
				return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
			case 'archived':
				return 'bg-muted text-muted-foreground border-border';
			case 'error':
			case 'failed':
				return 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30';
			default:
				return 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30';
		}
	}

	let projects = $derived(user.projects || []);
	let recentProject = $derived.by(() => user.recent_project || projects[0] || null);
	let recentActivity = $derived(user.recent_activity || []);
	let activityStats = $derived(user.activity_stats || {});
	let chatSessions = $derived(user.chat_sessions || []);
	let errorLogs = $derived(user.errors || []);
	let errorSummary = $derived(
		user.error_summary || {
			total_errors: 0,
			unresolved_errors: 0,
			critical_errors: 0,
			errors_last_24h: 0
		}
	);
</script>

<Modal {isOpen} onClose={handleClose} size="xl" customClasses="max-h-[95vh] overflow-y-auto">
	{#snippet header()}
		<div class="flex items-center gap-2 px-3 py-2 border-b border-border min-w-0">
			<div
				class="h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0"
			>
				<span class="text-xs font-bold text-accent">
					{(user.name || user.email).charAt(0).toUpperCase()}
				</span>
			</div>
			<div class="min-w-0 flex-1">
				<h2 class="text-sm font-semibold text-foreground truncate">
					{user.name || 'User'}
				</h2>
				<p class="text-[0.65rem] text-muted-foreground truncate">{user.email}</p>
			</div>
			<div class="flex items-center gap-1.5 shrink-0">
				<span
					class="px-1.5 py-0.5 text-[0.6rem] rounded border {user.onboarding_completed_at
						? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
						: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'}"
				>
					{user.onboarding_completed_at ? 'Onboarded' : 'Pending'}
				</span>
				<span class="text-[0.6rem] text-muted-foreground">
					{formatLastVisit(user.last_visit)}
				</span>
			</div>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="px-3 py-2 space-y-3">
			<div class="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
				<div class="bg-card rounded border border-border p-1.5 text-center shadow-ink">
					<p class="text-sm font-bold text-foreground">
						{activityStats.total_projects || 0}
					</p>
					<p class="text-[0.55rem] text-muted-foreground uppercase tracking-wide">Proj</p>
				</div>
				<div class="bg-card rounded border border-border p-1.5 text-center shadow-ink">
					<p class="text-sm font-bold text-foreground">
						{activityStats.total_tasks || 0}
					</p>
					<p class="text-[0.55rem] text-muted-foreground uppercase tracking-wide">
						Tasks
					</p>
				</div>
				<div class="bg-card rounded border border-border p-1.5 text-center shadow-ink">
					<p class="text-sm font-bold text-sky-600 dark:text-sky-400">
						{activityStats.open_tasks || 0}
					</p>
					<p class="text-[0.55rem] text-muted-foreground uppercase tracking-wide">Open</p>
				</div>
				<div class="bg-card rounded border border-border p-1.5 text-center shadow-ink">
					<p class="text-sm font-bold text-emerald-600 dark:text-emerald-400">
						{activityStats.completed_tasks || 0}
					</p>
					<p class="text-[0.55rem] text-muted-foreground uppercase tracking-wide">Done</p>
				</div>
				<div class="bg-card rounded border border-border p-1.5 text-center shadow-ink">
					<p class="text-sm font-bold text-foreground">
						{activityStats.total_documents || activityStats.total_notes || 0}
					</p>
					<p class="text-[0.55rem] text-muted-foreground uppercase tracking-wide">Docs</p>
				</div>
				<div class="bg-card rounded border border-border p-1.5 text-center shadow-ink">
					<p class="text-sm font-bold text-foreground">
						{activityStats.total_chat_sessions || 0}
					</p>
					<p class="text-[0.55rem] text-muted-foreground uppercase tracking-wide">
						Chats
					</p>
				</div>
				<div class="bg-card rounded border border-border p-1.5 text-center shadow-ink">
					<p class="text-sm font-bold text-foreground">
						{activityStats.total_chat_messages || 0}
					</p>
					<p class="text-[0.55rem] text-muted-foreground uppercase tracking-wide">Msgs</p>
				</div>
				<div class="bg-card rounded border border-border p-1.5 text-center shadow-ink">
					<p class="text-sm font-bold text-rose-600 dark:text-rose-400">
						{activityStats.total_errors || 0}
					</p>
					<p class="text-[0.55rem] text-muted-foreground uppercase tracking-wide">
						Errors
					</p>
				</div>
			</div>

			{#if contextLoading}
				<div
					class="bg-card rounded border border-border p-2 shadow-ink flex items-center justify-center gap-2"
				>
					<RefreshCw class="w-3.5 h-3.5 animate-spin text-accent" />
					<span class="text-xs text-muted-foreground">Loading user data...</span>
				</div>
			{:else if contextError}
				<div
					class="bg-rose-500/5 border border-rose-500/20 rounded p-2 tx tx-static tx-weak flex items-center justify-between gap-2"
				>
					<p class="text-xs text-rose-600 dark:text-rose-400">Error: {contextError}</p>
					<Button
						onclick={loadUserContext}
						variant="outline"
						size="sm"
						class="pressable text-xs px-2 py-1"
					>
						Retry
					</Button>
				</div>
			{:else if userContext}
				<UserContextPanel
					{userContext}
					expanded={true}
					showActions={true}
					on:composeEmail={handleComposeEmail}
				/>
			{/if}

			<div class="bg-card rounded border border-border shadow-ink overflow-hidden">
				<div
					class="px-2 py-1.5 border-b border-border bg-muted/30 flex items-center justify-between"
				>
					<h3
						class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1"
					>
						<FolderOpen class="h-3 w-3 text-accent flex-shrink-0" />
						Projects
					</h3>
					<span class="text-[0.6rem] text-muted-foreground">{projects.length} total</span>
				</div>

				<div class="p-2 space-y-2">
					{#if recentProject}
						<div class="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0">
									<p
										class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
									>
										Most Recent Project
									</p>
									<h4 class="text-sm font-semibold text-foreground truncate">
										{recentProject.name}
									</h4>
								</div>
								<div class="text-right shrink-0">
									<span
										class="inline-flex px-1.5 py-0.5 rounded border text-[0.6rem] {getProjectBadgeClass(
											recentProject.status
										)}"
									>
										{humanizeLabel(recentProject.status)}
									</span>
									<p class="text-[0.65rem] text-muted-foreground mt-1">
										{formatRelativeDate(recentProject.last_activity_at)}
									</p>
								</div>
							</div>

							{#if recentProject.description_preview}
								<p class="text-xs text-muted-foreground">
									{recentProject.description_preview}
								</p>
							{/if}

							<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
								<div class="rounded border border-border bg-card px-2 py-1.5">
									<div class="text-sm font-semibold text-foreground">
										{recentProject.open_task_count || 0}
									</div>
									<div
										class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
									>
										Open Tasks
									</div>
								</div>
								<div class="rounded border border-border bg-card px-2 py-1.5">
									<div
										class="text-sm font-semibold text-emerald-600 dark:text-emerald-400"
									>
										{recentProject.completed_task_count || 0}
									</div>
									<div
										class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
									>
										Done
									</div>
								</div>
								<div class="rounded border border-border bg-card px-2 py-1.5">
									<div class="text-sm font-semibold text-foreground">
										{recentProject.document_count ||
											recentProject.notes_count ||
											0}
									</div>
									<div
										class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
									>
										Docs
									</div>
								</div>
								<div class="rounded border border-border bg-card px-2 py-1.5">
									<div class="text-sm font-semibold text-foreground">
										{recentProject.chat_session_count || 0}
									</div>
									<div
										class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
									>
										BuildOS Chats
									</div>
								</div>
							</div>

							{#if recentProject.next_step_short || recentProject.next_step_long}
								<div class="rounded border border-border bg-card px-2 py-1.5">
									<div
										class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
									>
										Next Step
									</div>
									<p class="text-xs text-foreground mt-1">
										{recentProject.next_step_short ||
											recentProject.next_step_long}
									</p>
								</div>
							{/if}
						</div>
					{/if}

					<div>
						<h4
							class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1"
						>
							<BarChart3 class="h-3 w-3 text-accent flex-shrink-0" />
							Project Usage
						</h4>
						<ProjectActivityChart {projects} />
					</div>

					{#if projects.length > 0}
						<div class="space-y-2">
							{#each projects as project}
								{@const isExpanded = expandedProjectIds.has(project.id)}
								<div class="rounded-lg border border-border overflow-hidden">
									<button
										type="button"
										onclick={() => toggleProjectExpansion(project.id)}
										class="w-full px-3 py-2 bg-card hover:bg-muted/30 transition-colors flex items-center justify-between gap-3 text-left"
										aria-expanded={isExpanded}
									>
										<div class="min-w-0 flex-1">
											<div class="flex items-center gap-2 flex-wrap">
												<p
													class="text-sm font-medium text-foreground truncate"
												>
													{project.name}
												</p>
												<span
													class="px-1.5 py-0.5 rounded border text-[0.6rem] {getProjectBadgeClass(
														project.status
													)}"
												>
													{humanizeLabel(project.status)}
												</span>
												<span
													class="px-1.5 py-0.5 rounded border text-[0.6rem] bg-muted text-muted-foreground border-border"
												>
													{project.access_type === 'owned'
														? 'Owned'
														: 'Shared'}
												</span>
											</div>
											<p class="text-[0.65rem] text-muted-foreground mt-1">
												Last active {formatRelativeDate(
													project.last_activity_at
												)}
											</p>
										</div>

										<div class="flex items-center gap-2 shrink-0">
											<div
												class="hidden sm:flex items-center gap-1.5 text-[0.6rem] text-muted-foreground"
											>
												<span>{project.open_task_count || 0} open</span>
												<span>{project.completed_task_count || 0} done</span
												>
												<span>{project.chat_session_count || 0} chats</span>
											</div>
											{#if isExpanded}
												<ChevronDown
													class="w-4 h-4 text-muted-foreground"
												/>
											{:else}
												<ChevronRight
													class="w-4 h-4 text-muted-foreground"
												/>
											{/if}
										</div>
									</button>

									{#if isExpanded}
										<div
											class="border-t border-border bg-muted/10 p-3 space-y-3"
										>
											{#if project.description_preview}
												<div>
													<div
														class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
													>
														Project Context
													</div>
													<p class="text-xs text-foreground mt-1">
														{project.description_preview}
													</p>
												</div>
											{/if}

											<div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
												<div
													class="rounded border border-border bg-card px-2 py-1.5"
												>
													<div
														class="text-sm font-semibold text-foreground"
													>
														{project.task_count || 0}
													</div>
													<div
														class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
													>
														Tasks
													</div>
												</div>
												<div
													class="rounded border border-border bg-card px-2 py-1.5"
												>
													<div
														class="text-sm font-semibold text-sky-600 dark:text-sky-400"
													>
														{project.open_task_count || 0}
													</div>
													<div
														class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
													>
														Open
													</div>
												</div>
												<div
													class="rounded border border-border bg-card px-2 py-1.5"
												>
													<div
														class="text-sm font-semibold text-emerald-600 dark:text-emerald-400"
													>
														{project.completed_task_count || 0}
													</div>
													<div
														class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
													>
														Done
													</div>
												</div>
												<div
													class="rounded border border-border bg-card px-2 py-1.5"
												>
													<div
														class="text-sm font-semibold text-foreground"
													>
														{project.document_count ||
															project.notes_count ||
															0}
													</div>
													<div
														class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
													>
														Docs
													</div>
												</div>
												<div
													class="rounded border border-border bg-card px-2 py-1.5"
												>
													<div
														class="text-sm font-semibold text-foreground"
													>
														{project.chat_session_count || 0}
													</div>
													<div
														class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
													>
														Chats
													</div>
												</div>
											</div>

											{#if project.next_step_short || project.next_step_long}
												<div
													class="rounded border border-border bg-card px-2 py-1.5"
												>
													<div
														class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
													>
														Next Step
													</div>
													<p class="text-xs text-foreground mt-1">
														{project.next_step_short ||
															project.next_step_long}
													</p>
												</div>
											{/if}

											<div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
												<div class="space-y-2">
													<div
														class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
													>
														Recent Tasks
													</div>
													{#if project.recent_tasks?.length > 0}
														<div class="space-y-1.5">
															{#each project.recent_tasks as task}
																<div
																	class="rounded border border-border bg-card px-2 py-1.5"
																>
																	<div
																		class="flex items-center justify-between gap-2"
																	>
																		<div class="min-w-0">
																			<p
																				class="text-xs font-medium text-foreground truncate"
																			>
																				{task.title}
																			</p>
																			<p
																				class="text-[0.65rem] text-muted-foreground mt-0.5"
																			>
																				Updated {formatRelativeDate(
																					task.updated_at ||
																						task.created_at
																				)}
																			</p>
																		</div>
																		<span
																			class="px-1.5 py-0.5 rounded border text-[0.6rem] shrink-0 {getTaskBadgeClass(
																				task.state_key
																			)}"
																		>
																			{humanizeLabel(
																				task.state_key
																			)}
																		</span>
																	</div>
																</div>
															{/each}
														</div>
													{:else}
														<p class="text-xs text-muted-foreground">
															No recent tasks.
														</p>
													{/if}
												</div>

												<div class="space-y-2">
													<div
														class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
													>
														Recent Documents
													</div>
													{#if project.recent_documents?.length > 0}
														<div class="space-y-1.5">
															{#each project.recent_documents as document}
																<div
																	class="rounded border border-border bg-card px-2 py-1.5"
																>
																	<div
																		class="flex items-center gap-2"
																	>
																		<FileText
																			class="w-3.5 h-3.5 text-muted-foreground shrink-0"
																		/>
																		<div class="min-w-0 flex-1">
																			<p
																				class="text-xs font-medium text-foreground truncate"
																			>
																				{document.title}
																			</p>
																			<p
																				class="text-[0.65rem] text-muted-foreground mt-0.5"
																			>
																				{humanizeLabel(
																					document.type_key
																				)} · {formatRelativeDate(
																					document.updated_at ||
																						document.created_at
																				)}
																			</p>
																		</div>
																	</div>
																</div>
															{/each}
														</div>
													{:else}
														<p class="text-xs text-muted-foreground">
															No recent documents.
														</p>
													{/if}
												</div>
											</div>

											<div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
												<div class="space-y-2">
													<div
														class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
													>
														Recent BuildOS Chats
													</div>
													{#if project.recent_chat_sessions?.length > 0}
														<div class="space-y-1.5">
															{#each project.recent_chat_sessions as session}
																<div
																	class="rounded border border-border bg-card px-2 py-1.5"
																>
																	<div
																		class="flex items-start justify-between gap-2"
																	>
																		<div class="min-w-0 flex-1">
																			<p
																				class="text-xs font-medium text-foreground truncate"
																			>
																				{session.title}
																			</p>
																			<p
																				class="text-[0.65rem] text-muted-foreground mt-0.5"
																			>
																				{session.message_count}
																				messages · {formatRelativeDate(
																					session.last_activity_at
																				)}
																			</p>
																		</div>
																		<a
																			href={session.admin_url}
																			class="inline-flex items-center gap-1 text-[0.65rem] text-accent hover:underline shrink-0"
																		>
																			Open
																			<ExternalLink
																				class="w-3 h-3"
																			/>
																		</a>
																	</div>
																</div>
															{/each}
														</div>
													{:else}
														<p class="text-xs text-muted-foreground">
															No project-linked chat sessions.
														</p>
													{/if}
												</div>

												<div class="space-y-2">
													<div
														class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
													>
														Recent Activity
													</div>
													{#if project.recent_activity?.length > 0}
														<div class="space-y-1.5">
															{#each project.recent_activity as item}
																<div
																	class="rounded border border-border bg-card px-2 py-1.5"
																>
																	<p
																		class="text-xs font-medium text-foreground"
																	>
																		{humanizeLabel(
																			item.entity_type
																		)}
																		{humanizeLabel(item.action)}
																	</p>
																	<p
																		class="text-[0.65rem] text-muted-foreground mt-0.5"
																	>
																		{item.object_name} · {formatRelativeDate(
																			item.created_at
																		)}
																	</p>
																	{#if item.details}
																		<p
																			class="text-[0.65rem] text-muted-foreground mt-0.5 truncate"
																		>
																			{item.details}
																		</p>
																	{/if}
																</div>
															{/each}
														</div>
													{:else}
														<p class="text-xs text-muted-foreground">
															No recent project activity logs.
														</p>
													{/if}
												</div>
											</div>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{:else}
						<div
							class="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground"
						>
							This user has not created or joined any projects yet.
						</div>
					{/if}
				</div>
			</div>

			<div class="bg-card rounded border border-border shadow-ink overflow-hidden">
				<div
					class="px-2 py-1.5 border-b border-border bg-muted/30 flex items-center justify-between"
				>
					<h3
						class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1"
					>
						<MessageSquare class="h-3 w-3 text-accent flex-shrink-0" />
						BuildOS Chat
					</h3>
					<span class="text-[0.6rem] text-muted-foreground">
						{activityStats.total_chat_sessions || 0} sessions
					</span>
				</div>

				<div class="p-2 space-y-2">
					<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
						<div class="rounded border border-border bg-card px-2 py-1.5">
							<div class="text-sm font-semibold text-foreground">
								{activityStats.total_chat_sessions || 0}
							</div>
							<div
								class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
							>
								Chats
							</div>
						</div>
						<div class="rounded border border-border bg-card px-2 py-1.5">
							<div class="text-sm font-semibold text-foreground">
								{activityStats.total_chat_messages || 0}
							</div>
							<div
								class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
							>
								Messages
							</div>
						</div>
						<div class="rounded border border-border bg-card px-2 py-1.5">
							<div class="text-sm font-semibold text-foreground">
								{activityStats.total_project_chat_sessions || 0}
							</div>
							<div
								class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
							>
								Project Chats
							</div>
						</div>
						<div class="rounded border border-border bg-card px-2 py-1.5">
							<div class="text-sm font-semibold text-foreground">
								{chatSessions[0]?.last_activity_at
									? formatRelativeDate(chatSessions[0].last_activity_at)
									: 'Never'}
							</div>
							<div
								class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
							>
								Last Chat
							</div>
						</div>
					</div>

					{#if chatSessions.length > 0}
						<div class="space-y-1.5">
							{#each chatSessions.slice(0, 8) as session}
								<div
									class="rounded-lg border border-border bg-card px-3 py-2 flex items-start justify-between gap-3"
								>
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-2 flex-wrap">
											<p class="text-sm font-medium text-foreground truncate">
												{session.title}
											</p>
											<span
												class="px-1.5 py-0.5 rounded border text-[0.6rem] {getSessionStatusClass(
													session.status
												)}"
											>
												{humanizeLabel(session.status)}
											</span>
											<span
												class="px-1.5 py-0.5 rounded border text-[0.6rem] bg-muted text-muted-foreground border-border"
											>
												{humanizeLabel(session.context_type)}
											</span>
											{#if session.project_name}
												<span
													class="px-1.5 py-0.5 rounded border text-[0.6rem] bg-muted text-muted-foreground border-border"
												>
													{session.project_name}
												</span>
											{/if}
										</div>
										<p class="text-[0.7rem] text-muted-foreground mt-1">
											{session.message_count} messages
											{#if session.tool_call_count}
												· {session.tool_call_count} tool calls
											{/if}
											· Last active {formatDateTime(session.last_activity_at)}
										</p>
									</div>

									<a
										href={session.admin_url}
										class="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-[0.7rem] text-foreground hover:bg-muted transition-colors shrink-0"
									>
										Open session
										<ExternalLink class="w-3 h-3" />
									</a>
								</div>
							{/each}
						</div>
					{:else}
						<div
							class="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground"
						>
							No BuildOS chat sessions found for this user.
						</div>
					{/if}
				</div>
			</div>

			<div class="bg-card rounded border border-border shadow-ink overflow-hidden">
				<div
					class="px-2 py-1.5 border-b border-border bg-muted/30 flex items-center justify-between"
				>
					<h3
						class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1"
					>
						<CircleAlert class="h-3 w-3 text-rose-500 flex-shrink-0" />
						User Errors
					</h3>
					<span class="text-[0.6rem] text-muted-foreground">
						{errorSummary.total_errors || 0} visible
					</span>
				</div>

				<div class="p-2 space-y-2">
					<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
						<div class="rounded border border-border bg-card px-2 py-1.5">
							<div class="text-sm font-semibold text-foreground">
								{errorSummary.total_errors || 0}
							</div>
							<div
								class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
							>
								Total
							</div>
						</div>
						<div class="rounded border border-border bg-card px-2 py-1.5">
							<div class="text-sm font-semibold text-rose-600 dark:text-rose-400">
								{errorSummary.unresolved_errors || 0}
							</div>
							<div
								class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
							>
								Open
							</div>
						</div>
						<div class="rounded border border-border bg-card px-2 py-1.5">
							<div class="text-sm font-semibold text-red-600 dark:text-red-400">
								{errorSummary.critical_errors || 0}
							</div>
							<div
								class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
							>
								Critical
							</div>
						</div>
						<div class="rounded border border-border bg-card px-2 py-1.5">
							<div class="text-sm font-semibold text-foreground">
								{errorSummary.errors_last_24h || 0}
							</div>
							<div
								class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
							>
								Last 24h
							</div>
						</div>
					</div>

					{#if errorLogs.length > 0}
						<div class="space-y-1.5">
							{#each errorLogs as error}
								<div
									class="rounded-lg border border-border bg-card px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors"
									role="button"
									tabindex="0"
									aria-label={`Open details for error ${error.id || error.request_id || error.requestId || ''}`}
									onclick={() => openErrorDetails(error)}
									onkeydown={(event) => {
										if (event.key === 'Enter' || event.key === ' ') {
											event.preventDefault();
											openErrorDetails(error);
										}
									}}
								>
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0 flex-1">
											<div class="flex items-center gap-2 flex-wrap">
												<span
													class="px-1.5 py-0.5 rounded border text-[0.6rem] {getErrorSeverityClass(
														error.severity
													)}"
												>
													{humanizeLabel(error.severity)}
												</span>
												<span
													class="px-1.5 py-0.5 rounded border text-[0.6rem] bg-muted text-muted-foreground border-border"
												>
													{humanizeLabel(error.error_type)}
												</span>
												<span
													class="px-1.5 py-0.5 rounded border text-[0.6rem] {error.resolved
														? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
														: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30'}"
												>
													{error.resolved ? 'Resolved' : 'Open'}
												</span>
											</div>
											<p class="text-sm font-medium text-foreground mt-1">
												{error.error_message}
											</p>
											<p class="text-[0.7rem] text-muted-foreground mt-1">
												{error.endpoint ||
													error.operation_type ||
													'Unknown source'}
												{#if error.request_id}
													· Request {(error.request_id ?? '').slice(0, 8)}
												{/if}
											</p>
											{#if error.resolution_notes}
												<p class="text-[0.7rem] text-muted-foreground mt-1">
													Resolution: {error.resolution_notes}
												</p>
											{/if}
											<p class="text-[0.7rem] text-accent mt-1">
												Open details
											</p>
										</div>
										<div class="text-[0.7rem] text-muted-foreground shrink-0">
											{formatRelativeDate(error.created_at)}
										</div>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div
							class="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground"
						>
							No visible error logs for this user.
						</div>
					{/if}
				</div>
			</div>

			<div class="bg-card rounded border border-border p-2 shadow-ink">
				<h3
					class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1"
				>
					<Activity class="h-3 w-3 text-emerald-500 flex-shrink-0" />
					Activity Timeline
				</h3>
				<ActivityTimelineChart activities={recentActivity} />
			</div>
		</div>
	{/snippet}

	{#snippet footer()}
		<div class="flex justify-end px-3 py-2 border-t border-border">
			<Button onclick={handleClose} variant="secondary" size="sm" class="pressable text-xs">
				Close
			</Button>
		</div>
	{/snippet}
</Modal>

<ErrorDetailsModal
	error={selectedError}
	isOpen={Boolean(selectedError)}
	onClose={() => (selectedError = null)}
/>
