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
		FileText,
		Target,
		ClipboardList
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

	function handleComposeEmail(detail: { template: string; instructions: string }) {
		if (!onComposeEmail) return;

		onComposeEmail({
			user,
			template: detail.template,
			instructions: detail.instructions
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

	function formatDateOnly(dateString: string | null | undefined): string {
		if (!dateString) return 'No target';
		return new Date(dateString).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function getProjectBadgeClass(status: string | null | undefined): string {
		switch (status) {
			case 'active':
			case 'in_progress':
				return 'bg-info/10 text-info border-info/30';
			case 'done':
			case 'completed':
				return 'bg-success/10 text-success border-success/30';
			case 'paused':
			case 'blocked':
				return 'bg-warning/10 text-warning border-warning/30';
			default:
				return 'bg-muted text-muted-foreground border-border';
		}
	}

	function getTaskBadgeClass(state: string | null | undefined): string {
		switch (state) {
			case 'done':
				return 'bg-success/10 text-success border-success/30';
			case 'in_progress':
				return 'bg-info/10 text-info border-info/30';
			case 'blocked':
				return 'bg-warning/10 text-warning border-warning/30';
			default:
				return 'bg-muted text-muted-foreground border-border';
		}
	}

	function getEntityStateBadgeClass(state: string | null | undefined): string {
		switch (state) {
			case 'done':
			case 'completed':
				return 'bg-success/10 text-success border-success/30';
			case 'active':
			case 'in_progress':
				return 'bg-info/10 text-info border-info/30';
			case 'blocked':
			case 'paused':
				return 'bg-warning/10 text-warning border-warning/30';
			default:
				return 'bg-muted text-muted-foreground border-border';
		}
	}

	function getProjectSummaryMetrics(project: any) {
		const taskCount = project.task_count || 0;
		const openTasks = project.open_task_count || 0;
		const completedTasks = project.completed_task_count || 0;
		const documentCount = project.document_count || project.notes_count || 0;
		const goalCount = project.goal_count || 0;
		const openGoals = project.open_goal_count || 0;
		const planCount = project.plan_count || 0;
		const activePlans = project.active_plan_count || 0;
		const chatCount = project.chat_session_count || 0;
		const chatMessages = project.chat_message_count || 0;

		return [
			{
				label: 'Tasks',
				value: taskCount,
				detail: `${openTasks} open / ${completedTasks} done`,
				valueClass: 'text-foreground'
			},
			{
				label: 'Docs',
				value: documentCount,
				detail: 'documents',
				valueClass: 'text-amber-700'
			},
			{
				label: 'Goals',
				value: goalCount,
				detail: `${openGoals} open`,
				valueClass: 'text-rose-700'
			},
			{
				label: 'Plans',
				value: planCount,
				detail: `${activePlans} active`,
				valueClass: 'text-cyan-700'
			},
			{
				label: 'Chats',
				value: chatCount,
				detail: `${chatMessages} msgs`,
				valueClass: 'text-zinc-700'
			}
		];
	}

	function getErrorSeverityClass(severity: string | null | undefined): string {
		switch (severity) {
			case 'critical':
				return 'bg-destructive/10 text-destructive border-destructive/30';
			case 'error':
				return 'bg-accent/10 text-accent border-accent/30';
			case 'warning':
				return 'bg-warning/10 text-warning border-warning/30';
			case 'info':
				return 'bg-info/10 text-info border-info/30';
			default:
				return 'bg-muted text-muted-foreground border-border';
		}
	}

	function getSessionStatusClass(status: string | null | undefined): string {
		switch (status) {
			case 'active':
				return 'bg-success/10 text-success border-success/30';
			case 'archived':
				return 'bg-muted text-muted-foreground border-border';
			case 'error':
			case 'failed':
				return 'bg-destructive/10 text-destructive border-destructive/30';
			default:
				return 'bg-info/10 text-info border-info/30';
		}
	}

	function getChatSourceClass(source: string | null | undefined): string {
		switch (source) {
			case 'current':
				return 'bg-info/10 text-info border-info/30';
			case 'legacy_agent':
				return 'bg-cyan-50 text-cyan-700 border-cyan-200';
			default:
				return 'bg-muted text-muted-foreground border-border';
		}
	}

	let projects = $derived(user.projects || []);
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
		<div class="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted min-w-0">
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
						? 'bg-success/10 text-success border-success/30'
						: 'bg-warning/10 text-warning border-warning/30'}"
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
					<p class="text-sm font-bold text-info">
						{activityStats.open_tasks || 0}
					</p>
					<p class="text-[0.55rem] text-muted-foreground uppercase tracking-wide">Open</p>
				</div>
				<div class="bg-card rounded border border-border p-1.5 text-center shadow-ink">
					<p class="text-sm font-bold text-success">
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
					<p class="text-sm font-bold text-destructive">
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
					class="bg-destructive/5 border border-destructive/20 rounded p-2 tx tx-static tx-weak flex items-center justify-between gap-2"
				>
					<p class="text-xs text-destructive">Error: {contextError}</p>
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
					onComposeEmail={handleComposeEmail}
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
							{#each projects as project, index}
								{@const isExpanded = expandedProjectIds.has(project.id)}
								{@const summaryMetrics = getProjectSummaryMetrics(project)}
								<div class="rounded-lg border border-border overflow-hidden">
									<button
										type="button"
										onclick={() => toggleProjectExpansion(project.id)}
										class="w-full px-3 py-3 bg-card hover:bg-muted/30 transition-colors text-left"
										aria-expanded={isExpanded}
									>
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0 flex-1">
												<div class="flex items-center gap-2 flex-wrap">
													<p
														class="text-sm font-semibold text-foreground truncate"
													>
														{project.name}
													</p>
													{#if index === 0}
														<span
															class="px-1.5 py-0.5 rounded border text-[0.6rem] bg-accent/10 text-accent border-accent/30"
														>
															Most recent
														</span>
													{/if}
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
												<p
													class="text-[0.65rem] text-muted-foreground mt-1"
												>
													Last active {formatRelativeDate(
														project.last_activity_at
													)}
												</p>
											</div>

											<div class="pt-1 shrink-0">
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
										</div>

										{#if project.description_preview}
											<p
												class="mt-2 line-clamp-2 text-xs text-muted-foreground"
											>
												{project.description_preview}
											</p>
										{/if}

										<div class="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-1.5">
											{#each summaryMetrics as metric}
												<div
													class="rounded border border-border bg-background px-2 py-1.5"
												>
													<div
														class="text-sm font-semibold {metric.valueClass}"
													>
														{metric.value}
													</div>
													<div
														class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
													>
														{metric.label}
													</div>
													<div
														class="truncate text-[0.6rem] text-muted-foreground"
													>
														{metric.detail}
													</div>
												</div>
											{/each}
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
												{#each summaryMetrics as metric}
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div
															class="text-sm font-semibold {metric.valueClass}"
														>
															{metric.value}
														</div>
														<div
															class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
														>
															{metric.label}
														</div>
														<div
															class="truncate text-[0.6rem] text-muted-foreground"
														>
															{metric.detail}
														</div>
													</div>
												{/each}
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
														Goals
													</div>
													{#if project.recent_goals?.length > 0}
														<div class="space-y-1.5">
															{#each project.recent_goals as goal}
																<div
																	class="rounded border border-border bg-card px-2 py-1.5"
																>
																	<div
																		class="flex items-start justify-between gap-2"
																	>
																		<div
																			class="flex min-w-0 flex-1 items-start gap-2"
																		>
																			<Target
																				class="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600"
																			/>
																			<div class="min-w-0">
																				<p
																					class="truncate text-xs font-medium text-foreground"
																				>
																					{goal.name}
																				</p>
																				<p
																					class="mt-0.5 text-[0.65rem] text-muted-foreground"
																				>
																					Target {formatDateOnly(
																						goal.target_date
																					)}
																				</p>
																			</div>
																		</div>
																		<span
																			class="shrink-0 rounded border px-1.5 py-0.5 text-[0.6rem] {getEntityStateBadgeClass(
																				goal.state_key
																			)}"
																		>
																			{humanizeLabel(
																				goal.state_key
																			)}
																		</span>
																	</div>
																</div>
															{/each}
														</div>
													{:else}
														<p class="text-xs text-muted-foreground">
															No goals linked to this project.
														</p>
													{/if}
												</div>

												<div class="space-y-2">
													<div
														class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
													>
														Plans
													</div>
													{#if project.recent_plans?.length > 0}
														<div class="space-y-1.5">
															{#each project.recent_plans as plan}
																<div
																	class="rounded border border-border bg-card px-2 py-1.5"
																>
																	<div
																		class="flex items-start justify-between gap-2"
																	>
																		<div
																			class="flex min-w-0 flex-1 items-start gap-2"
																		>
																			<ClipboardList
																				class="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-700"
																			/>
																			<div class="min-w-0">
																				<p
																					class="truncate text-xs font-medium text-foreground"
																				>
																					{plan.name}
																				</p>
																				<p
																					class="mt-0.5 text-[0.65rem] text-muted-foreground"
																				>
																					{humanizeLabel(
																						plan.facet_stage ||
																							plan.type_key
																					)}
																					/ Updated {formatRelativeDate(
																						plan.updated_at ||
																							plan.created_at
																					)}
																				</p>
																			</div>
																		</div>
																		<span
																			class="shrink-0 rounded border px-1.5 py-0.5 text-[0.6rem] {getEntityStateBadgeClass(
																				plan.state_key
																			)}"
																		>
																			{humanizeLabel(
																				plan.state_key
																			)}
																		</span>
																	</div>
																</div>
															{/each}
														</div>
													{:else}
														<p class="text-xs text-muted-foreground">
															No plans linked to this project.
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
																			<div
																				class="flex flex-wrap items-center gap-1.5"
																			>
																				<p
																					class="truncate text-xs font-medium text-foreground"
																				>
																					{session.title}
																				</p>
																				<span
																					class="rounded border px-1.5 py-0.5 text-[0.58rem] {getChatSourceClass(
																						session.source
																					)}"
																				>
																					{session.source_label ||
																						'Chat'}
																				</span>
																			</div>
																			<p
																				class="text-[0.65rem] text-muted-foreground mt-0.5"
																			>
																				{session.message_count}
																				messages · {formatRelativeDate(
																					session.last_activity_at
																				)}
																			</p>
																		</div>
																		{#if session.admin_url}
																			<a
																				href={session.admin_url}
																				class="inline-flex items-center gap-1 text-[0.65rem] text-accent hover:underline shrink-0"
																			>
																				Open
																				<ExternalLink
																					class="w-3 h-3"
																				/>
																			</a>
																		{/if}
																	</div>
																	{#if session.recent_messages?.length > 0}
																		<div
																			class="mt-2 space-y-1.5 border-t border-border/70 pt-2"
																		>
																			{#each session.recent_messages.slice(0, 2) as message}
																				<div
																					class="rounded bg-muted/35 px-2 py-1.5"
																				>
																					<div
																						class="mb-0.5 flex items-center justify-between gap-2"
																					>
																						<span
																							class="text-[0.58rem] font-medium uppercase tracking-wide text-muted-foreground"
																						>
																							{humanizeLabel(
																								message.role
																							)}
																						</span>
																						<span
																							class="shrink-0 text-[0.58rem] text-muted-foreground"
																						>
																							{formatRelativeDate(
																								message.created_at
																							)}
																						</span>
																					</div>
																					<p
																						class="line-clamp-2 text-[0.68rem] leading-snug text-foreground"
																					>
																						{message.content}
																					</p>
																				</div>
																			{/each}
																		</div>
																	{:else}
																		<p
																			class="mt-2 rounded border border-dashed border-border px-2 py-1.5 text-[0.65rem] text-muted-foreground"
																		>
																			No message rows found
																			for this chat session.
																		</p>
																	{/if}
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
								<div class="rounded-lg border border-border bg-card px-3 py-2">
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0 flex-1">
											<div class="flex items-center gap-2 flex-wrap">
												<p
													class="min-w-0 max-w-full text-sm font-medium text-foreground truncate"
												>
													{session.title}
												</p>
												<span
													class="px-1.5 py-0.5 rounded border text-[0.6rem] {getChatSourceClass(
														session.source
													)}"
												>
													{session.source_label || 'Chat'}
												</span>
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
												· Last active {formatDateTime(
													session.last_activity_at
												)}
											</p>
										</div>

										{#if session.admin_url}
											<a
												href={session.admin_url}
												class="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-[0.7rem] text-foreground hover:bg-muted transition-colors shrink-0"
											>
												Open session
												<ExternalLink class="w-3 h-3" />
											</a>
										{/if}
									</div>

									{#if session.recent_messages?.length > 0}
										<div
											class="mt-2 space-y-1.5 border-t border-border/70 pt-2"
										>
											{#each session.recent_messages.slice(0, 3) as message}
												<div class="rounded bg-muted/35 px-2.5 py-2">
													<div
														class="mb-1 flex items-center justify-between gap-2"
													>
														<span
															class="text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground"
														>
															{humanizeLabel(message.role)}
														</span>
														<span
															class="shrink-0 text-[0.6rem] text-muted-foreground"
														>
															{formatRelativeDate(message.created_at)}
														</span>
													</div>
													<p
														class="line-clamp-2 text-[0.72rem] leading-snug text-foreground"
													>
														{message.content}
													</p>
												</div>
											{/each}
										</div>
									{:else}
										<div
											class="mt-2 rounded border border-dashed border-border px-2.5 py-2 text-[0.7rem] text-muted-foreground"
										>
											No message rows found for this chat session.
										</div>
									{/if}
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
						<CircleAlert class="h-3 w-3 text-destructive flex-shrink-0" />
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
							<div class="text-sm font-semibold text-destructive">
								{errorSummary.unresolved_errors || 0}
							</div>
							<div
								class="text-[0.6rem] uppercase tracking-wide text-muted-foreground"
							>
								Open
							</div>
						</div>
						<div class="rounded border border-border bg-card px-2 py-1.5">
							<div class="text-sm font-semibold text-destructive">
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
														? 'bg-success/10 text-success border-success/30'
														: 'bg-destructive/10 text-destructive border-destructive/30'}"
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
					<Activity class="h-3 w-3 text-success flex-shrink-0" />
					Activity Timeline
				</h3>
				<ActivityTimelineChart activities={recentActivity} />
			</div>
		</div>
	{/snippet}

	{#snippet footer()}
		<div class="flex justify-end px-3 sm:px-4 py-3 border-t border-border bg-muted/30">
			<Button onclick={handleClose} variant="secondary" size="sm">Close</Button>
		</div>
	{/snippet}
</Modal>

<ErrorDetailsModal
	error={selectedError}
	isOpen={Boolean(selectedError)}
	onClose={() => (selectedError = null)}
/>
