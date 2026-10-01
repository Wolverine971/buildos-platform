<!-- apps/web/src/lib/components/dashboard/TodayRow.svelte -->
<!--
  The Today row: one line of chips for what needs you today (brief, overdue,
  AI inbox, invites, connect other AI surfaces). Each chip opens its modal in
  place; chips with nothing to show stay hidden. Moved off the old dashboard
  onto the top of Projects.

  The root is `display: contents`, so the chips and the invites tray land
  directly in the parent's grid: the chips take whatever cell `class` gives
  them and the tray spans the full row beneath.
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import { goto, invalidate, preloadCode } from '$app/navigation';
	import { onMount } from 'svelte';
	import {
		AlertTriangle,
		ArrowRight,
		CheckCircle2,
		Inbox,
		Sparkles,
		UserPlus,
		XCircle
	} from '$lib/icons/lucide';
	import DashboardBriefWidget from './DashboardBriefWidget.svelte';
	import TodayChip from './TodayChip.svelte';
	import type { DailyBrief } from '$lib/types/daily-brief';
	import type { DataMutationSummary } from '$lib/components/agent/agent-chat.types';
	import { briefChatSessionStore } from '$lib/stores/briefChatSession.store';
	import { toastService } from '$lib/stores/toast.store';
	import { createDashboardPerformanceTracker } from '$lib/utils/dashboard-performance';
	import { aiInboxPerformance } from '$lib/utils/ai-inbox-performance';
	import {
		aiInboxCountStore,
		loadAiInboxCount,
		setAiInboxRemainingCount
	} from '$lib/stores/aiInboxCount.store';

	type ProjectInviteRow = {
		invite_id: string;
		project_id: string | null;
		project_name: string;
		role_key: string | null;
		access: string | null;
		status: string;
		expires_at: string | null;
		created_at: string | null;
		declined_at?: string | null;
		recoverable_until?: string | null;
		can_accept?: boolean | null;
		invited_by_name?: string | null;
		invited_by_email?: string | null;
	};

	type IdleWindow = Window & {
		requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
		cancelIdleCallback?: (handle: number) => void;
	};

	type Props = {
		user: { id: string; email?: string; is_admin?: boolean; timezone?: string | null };
		/** Null while the page's analytics are still streaming in. */
		overdueTasks: number | null;
		pendingInvites?: ProjectInviteRow[];
		showAgentConnectionCta?: boolean;
		/** Reload page data after a modal changed something. */
		onrefresh?: () => Promise<void> | void;
		/** True while any of the row's modals is open (the page pauses pull-to-refresh). */
		modalOpen?: boolean;
		/** Placement of the chip line inside the parent grid. */
		class?: string;
	};

	let {
		user,
		overdueTasks,
		pendingInvites = [],
		showAgentConnectionCta = false,
		onrefresh,
		modalOpen = $bindable(false),
		class: className = ''
	}: Props = $props();

	const AGENT_CONNECTION_HREF = '/profile?tab=agent-keys';
	const performance = createDashboardPerformanceTracker({ enabled: browser });

	let pendingNavigationHref = $state<string | null>(null);
	let inviteRows = $state<ProjectInviteRow[]>([]);
	let inviteActionId = $state<string | null>(null);
	let inviteActionError = $state<string | null>(null);
	let invitesOpen = $state(false);

	let DailyBriefModal = $state<any>(null);
	let BriefChatModal = $state<any>(null);
	let OverdueTaskTriageModal = $state<any>(null);
	let DashboardInboxModal = $state<any>(null);
	let showBriefModal = $state(false);
	let selectedBrief = $state<DailyBrief | null>(null);
	let showBriefChatModal = $state(false);
	let briefChatBrief = $state<DailyBrief | null>(null);
	let briefChatSessionId = $state<string | null>(null);
	let showOverdueModal = $state(false);
	let showInboxModal = $state(false);
	let isOpeningOverdue = $state(false);
	let isOpeningInbox = $state(false);
	let modalPreloadStarted = false;

	$effect(() => {
		modalOpen = showBriefModal || showBriefChatModal || showOverdueModal || showInboxModal;
	});

	$effect(() => {
		inviteRows = Array.isArray(pendingInvites) ? [...pendingInvites] : [];
	});

	const inboxCount = $derived($aiInboxCountStore.total);
	const inboxProjectCount = $derived($aiInboxCountStore.projectCount);
	const inboxAccountCount = $derived($aiInboxCountStore.account);
	const inboxSummary = $derived.by(() => {
		const itemLabel = `${inboxCount} pending review item${inboxCount === 1 ? '' : 's'}`;
		const projectLabel =
			inboxProjectCount === 1 ? '1 project' : `${inboxProjectCount} projects`;
		if (inboxProjectCount > 0 && inboxAccountCount > 0) {
			return `${itemLabel} across ${projectLabel} and account`;
		}
		if (inboxProjectCount > 0) return `${itemLabel} across ${projectLabel}`;
		if (inboxAccountCount > 0) return `${itemLabel} in account`;
		return itemLabel;
	});

	const actionableInvites = $derived(
		inviteRows.filter(
			(invite) =>
				invite.status === 'pending' ||
				(invite.status === 'declined' && invite.can_accept === true)
		)
	);
	const inviteSummary = $derived.by(() => {
		const pending = actionableInvites.filter((invite) => invite.status === 'pending').length;
		const declined = actionableInvites.length - pending;
		const pendingLabel = `${pending} ${pending === 1 ? 'pending invite' : 'pending invites'}`;
		if (pending > 0 && declined > 0) return `${pendingLabel} · ${declined} recoverable`;
		if (pending > 0) return pendingLabel;
		return `${declined} recoverable`;
	});

	$effect(() => {
		if (!browser) return;
		void loadAiInboxCount();
	});

	onMount(() => {
		performance.mark('mounted');
		return scheduleIdleModalPreload();
	});

	// ---------- Lazy modals ----------

	async function loadDailyBriefModal() {
		if (!DailyBriefModal) {
			DailyBriefModal = (await import('$lib/components/briefs/DailyBriefModal.svelte'))
				.default;
		}
		return DailyBriefModal;
	}

	async function loadBriefChatModal() {
		if (!BriefChatModal) {
			BriefChatModal = (await import('$lib/components/briefs/BriefChatModal.svelte')).default;
		}
		return BriefChatModal;
	}

	async function loadOverdueModal() {
		if (!OverdueTaskTriageModal) {
			OverdueTaskTriageModal = (await import('./OverdueTaskTriageModal.svelte')).default;
		}
		return OverdueTaskTriageModal;
	}

	async function loadInboxModal() {
		if (!DashboardInboxModal) {
			DashboardInboxModal = (await import('./DashboardInboxModal.svelte')).default;
		}
		return DashboardInboxModal;
	}

	function preloadBriefModals() {
		void Promise.allSettled([loadDailyBriefModal(), loadBriefChatModal()]);
	}

	function preloadOverdueModal() {
		void loadOverdueModal().catch((error) => {
			console.warn('[TodayRow] Failed to preload overdue triage modal:', error);
		});
	}

	function preloadInboxModal() {
		void loadInboxModal().catch((error) => {
			console.warn('[TodayRow] Failed to preload inbox modal:', error);
		});
	}

	function preloadAllModals() {
		if (modalPreloadStarted) return;
		modalPreloadStarted = true;
		preloadBriefModals();
		preloadOverdueModal();
		preloadInboxModal();
		void preloadCode('/dashboard/calendar').catch(() => undefined);
	}

	function scheduleIdleModalPreload(): () => void {
		if (!browser) return () => {};
		const idleWindow = window as IdleWindow;
		if (typeof idleWindow.requestIdleCallback === 'function') {
			const handle = idleWindow.requestIdleCallback(preloadAllModals, { timeout: 3500 });
			return () => idleWindow.cancelIdleCallback?.(handle);
		}
		const timeout = window.setTimeout(preloadAllModals, 2500);
		return () => window.clearTimeout(timeout);
	}

	function refresh() {
		return Promise.resolve(onrefresh?.());
	}

	// ---------- Brief ----------

	async function handleViewBrief(brief: DailyBrief) {
		await performance.trackAction('modal.daily_brief.open', async () => {
			try {
				await loadDailyBriefModal();
			} catch (err) {
				console.error('Failed to load DailyBriefModal:', err);
				return;
			}
			selectedBrief = brief;
			showBriefModal = true;
		});
	}

	function handleBriefModalClose() {
		showBriefModal = false;
		selectedBrief = null;
	}

	async function handleBriefChat(brief: DailyBrief) {
		// Close the brief modal first to avoid stacking
		showBriefModal = false;

		await performance.trackAction('modal.brief_chat.open', async () => {
			try {
				await loadBriefChatModal();
			} catch (err) {
				console.error('Failed to load BriefChatModal:', err);
				return;
			}
			briefChatSessionId = briefChatSessionStore.get(brief.id);
			briefChatBrief = brief;
			showBriefChatModal = true;
		});
	}

	function handleBriefChatClose(summary?: DataMutationSummary) {
		if (briefChatBrief && summary?.sessionId) {
			briefChatSessionStore.set(briefChatBrief.id, summary.sessionId);
		}
		showBriefChatModal = false;
		if (summary?.hasChanges) void refresh();
		briefChatBrief = null;
		briefChatSessionId = null;
	}

	// ---------- Overdue ----------

	async function openOverdueTriage() {
		if (isOpeningOverdue) return;
		isOpeningOverdue = true;
		try {
			await performance.trackAction('modal.overdue_triage.open', async () => {
				await loadOverdueModal();
				showOverdueModal = true;
			});
		} catch (err) {
			console.error('Failed to load OverdueTaskTriageModal:', err);
			toastService.error('Failed to open overdue tasks');
		} finally {
			isOpeningOverdue = false;
		}
	}

	function handleOverdueClose(summary?: { hasChanges: boolean; changedCount: number }) {
		showOverdueModal = false;
		if (summary?.hasChanges) void refresh();
	}

	// ---------- AI inbox ----------

	async function openInbox() {
		if (isOpeningInbox) return;
		isOpeningInbox = true;
		aiInboxPerformance.begin('dashboard');
		try {
			await performance.trackAction('modal.dashboard_inbox.open', async () => {
				await loadInboxModal();
				showInboxModal = true;
			});
		} catch (err) {
			aiInboxPerformance.cancel();
			console.error('Failed to load DashboardInboxModal:', err);
			toastService.error('Failed to open inbox');
		} finally {
			isOpeningInbox = false;
		}
	}

	function handleInboxClose(summary?: {
		hasChanges: boolean;
		changedCount: number;
		remainingCount: number;
	}) {
		showInboxModal = false;
		if (summary) setAiInboxRemainingCount(summary.remainingCount);
		if (summary?.hasChanges) {
			void refresh().finally(() => {
				if (browser) void loadAiInboxCount({ force: true });
			});
		}
	}

	// ---------- Invites ----------

	function formatInviteRole(roleKey: string | null | undefined): string {
		return roleKey === 'viewer' ? 'Viewer' : 'Editor';
	}

	function formatInviteDate(value: string | null | undefined): string {
		if (!value) return 'soon';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'soon';
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function handleAnchorClick(event: MouseEvent, href: string) {
		if (
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey ||
			event.defaultPrevented
		) {
			return;
		}
		pendingNavigationHref = href;
	}

	function pendingClass(href: string): string {
		return pendingNavigationHref === href
			? 'ring-1 ring-accent/50 animate-pulse motion-reduce:animate-none'
			: '';
	}

	async function acceptInvite(invite: ProjectInviteRow) {
		if (!invite.invite_id || inviteActionId) return;
		inviteActionId = invite.invite_id;
		inviteActionError = null;

		try {
			const response = await fetch(`/api/onto/invites/${invite.invite_id}/accept`, {
				method: 'POST'
			});
			const payload = await response.json();
			if (!response.ok || !payload?.success) {
				throw new Error(payload?.error || 'Failed to accept invite');
			}

			toastService.success('Invite accepted');
			const projectId =
				payload?.data?.projectId ?? payload?.data?.project_id ?? invite.project_id;
			const targetHref = projectId
				? `/projects/${projectId}?message=${encodeURIComponent('Invite accepted')}`
				: `/projects?message=${encodeURIComponent('Invite accepted')}`;
			void invalidate('app:invites');
			pendingNavigationHref = targetHref;
			try {
				await goto(targetHref);
			} finally {
				pendingNavigationHref = null;
			}
		} catch (error) {
			console.error('[TodayRow] Failed to accept invite:', error);
			inviteActionError = error instanceof Error ? error.message : 'Failed to accept invite';
		} finally {
			inviteActionId = null;
		}
	}

	async function declineInvite(invite: ProjectInviteRow) {
		if (!invite.invite_id || inviteActionId || invite.status !== 'pending') return;
		inviteActionId = invite.invite_id;
		inviteActionError = null;

		try {
			const response = await fetch(`/api/onto/invites/${invite.invite_id}/decline`, {
				method: 'POST'
			});
			const payload = await response.json();
			if (!response.ok || !payload?.success) {
				throw new Error(payload?.error || 'Failed to decline invite');
			}

			const declinedAt = payload?.data?.declinedAt ?? new Date().toISOString();
			const recoverableUntil = payload?.data?.recoverableUntil ?? null;
			inviteRows = inviteRows.map((row) =>
				row.invite_id === invite.invite_id
					? {
							...row,
							status: 'declined',
							declined_at: declinedAt,
							recoverable_until: recoverableUntil,
							can_accept: true
						}
					: row
			);
			toastService.success('Invite declined. You can still accept it for 48 hours.');
			void invalidate('app:invites');
		} catch (error) {
			console.error('[TodayRow] Failed to decline invite:', error);
			inviteActionError = error instanceof Error ? error.message : 'Failed to decline invite';
		} finally {
			inviteActionId = null;
		}
	}
</script>

<div class="contents">
	<div
		class="flex min-w-0 flex-wrap items-center gap-2 {className}"
		role="group"
		aria-label="Today"
	>
		<DashboardBriefWidget
			{user}
			onviewbrief={handleViewBrief}
			onpreloadbrief={preloadBriefModals}
		/>

		{#if overdueTasks && overdueTasks > 0}
			<TodayChip
				icon={AlertTriangle}
				tone="warning"
				label="{overdueTasks} overdue"
				title="{overdueTasks} overdue {overdueTasks === 1 ? 'task' : 'tasks'}"
				onclick={openOverdueTriage}
				onpreload={preloadOverdueModal}
				loading={isOpeningOverdue}
			/>
		{/if}

		{#if $aiInboxCountStore.error}
			<TodayChip
				icon={Inbox}
				label="Inbox unavailable"
				detail="Retry"
				onclick={() => loadAiInboxCount({ force: true })}
				loading={$aiInboxCountStore.loading}
			/>
		{:else if inboxCount > 0}
			<TodayChip
				icon={Inbox}
				iconClass="text-accent"
				label="{inboxCount} to review"
				title="AI Inbox: {inboxSummary}"
				onclick={openInbox}
				onpreload={preloadInboxModal}
				loading={isOpeningInbox}
			/>
		{/if}

		{#if actionableInvites.length > 0}
			<TodayChip
				icon={UserPlus}
				iconClass="text-accent"
				label="{actionableInvites.length} {actionableInvites.length === 1
					? 'invite'
					: 'invites'}"
				title="Project invites: {inviteSummary}"
				onclick={() => (invitesOpen = !invitesOpen)}
				expanded={invitesOpen}
				controls="today-invites-tray"
			/>
		{/if}

		{#if showAgentConnectionCta}
			<TodayChip
				icon={Sparkles}
				tone="quiet"
				label="Connect other AI surfaces"
				trailingIcon={ArrowRight}
				title="Let ChatGPT, Claude Code, Codex, and OpenClaw read your BuildOS context"
				href={AGENT_CONNECTION_HREF}
				onclick={(event) => handleAnchorClick(event, AGENT_CONNECTION_HREF)}
				busy={pendingNavigationHref === AGENT_CONNECTION_HREF}
				class={pendingClass(AGENT_CONNECTION_HREF)}
			/>
		{/if}
	</div>

	{#if invitesOpen && actionableInvites.length > 0}
		<div id="today-invites-tray" class="col-span-full wt-card overflow-hidden">
			<div
				class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2"
			>
				<p class="min-w-0 text-xs text-muted-foreground">
					<span class="font-semibold text-foreground">Project invites</span>
					· {inviteSummary}
				</p>
				<a
					href="/invites"
					onclick={(event) => handleAnchorClick(event, '/invites')}
					class="shrink-0 rounded-sm text-xs font-semibold text-accent underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					Review all &rarr;
				</a>
			</div>

			{#if inviteActionError}
				<p class="border-b border-border px-3 py-2 text-xs text-destructive">
					{inviteActionError}
				</p>
			{/if}

			<div class="grid gap-2 p-3 lg:grid-cols-2">
				{#each actionableInvites.slice(0, 4) as invite (invite.invite_id)}
					<div class="wt-paper px-3 py-2.5">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<p class="truncate text-sm font-semibold text-foreground">
									{invite.project_name}
								</p>
								<p class="mt-0.5 truncate text-2xs text-muted-foreground">
									Invited by {invite.invited_by_name ||
										invite.invited_by_email ||
										'a teammate'}
								</p>
							</div>
							<span
								class="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-2xs font-semibold text-foreground"
							>
								{formatInviteRole(invite.role_key)}
							</span>
						</div>

						<div class="mt-2 flex flex-wrap items-center justify-between gap-2">
							<p class="text-2xs text-muted-foreground">
								{#if invite.status === 'declined'}
									Declined · recoverable until {formatInviteDate(
										invite.recoverable_until
									)}
								{:else}
									Expires {formatInviteDate(invite.expires_at)}
								{/if}
							</p>
							<div class="flex items-center gap-1.5">
								<button
									type="button"
									onclick={() => acceptInvite(invite)}
									disabled={inviteActionId === invite.invite_id}
									class="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground shadow-ink pressable transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-60"
								>
									<CheckCircle2 class="h-3 w-3" />
									{invite.status === 'declined' ? 'Accept anyway' : 'Accept'}
								</button>
								{#if invite.status === 'pending'}
									<button
										type="button"
										onclick={() => declineInvite(invite)}
										disabled={inviteActionId === invite.invite_id}
										class="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground shadow-ink pressable transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-60"
									>
										<XCircle class="h-3 w-3" />
										Decline
									</button>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

{#if DailyBriefModal && showBriefModal}
	<DailyBriefModal
		isOpen={showBriefModal}
		brief={selectedBrief}
		briefDate={selectedBrief?.brief_date}
		onClose={handleBriefModalClose}
		onchat={handleBriefChat}
	/>
{/if}

{#if BriefChatModal && showBriefChatModal && briefChatBrief}
	<BriefChatModal
		isOpen={showBriefChatModal}
		brief={briefChatBrief}
		initialChatSessionId={briefChatSessionId}
		onClose={handleBriefChatClose}
	/>
{/if}

{#if OverdueTaskTriageModal && showOverdueModal}
	<OverdueTaskTriageModal
		isOpen={showOverdueModal}
		initialProjectId={null}
		onClose={handleOverdueClose}
	/>
{/if}

{#if DashboardInboxModal && showInboxModal}
	<DashboardInboxModal isOpen={showInboxModal} onClose={handleInboxClose} />
{/if}
