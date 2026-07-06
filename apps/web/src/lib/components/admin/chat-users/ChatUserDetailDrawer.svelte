<!-- apps/web/src/lib/components/admin/chat-users/ChatUserDetailDrawer.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import { tick } from 'svelte';
	import { Download, X } from '$lib/icons/lucide';
	import { portal } from '$lib/actions/portal';
	import { lockBodyScroll, unlockBodyScroll } from '$lib/utils/body-scroll-lock';
	import Button from '$lib/components/ui/Button.svelte';
	import ChatEntityChanges from './ChatEntityChanges.svelte';
	import ChatIssueClusters from './ChatIssueClusters.svelte';
	import ChatRedactedSessionTimeline from './ChatRedactedSessionTimeline.svelte';
	import ChatToolsAndErrors from './ChatToolsAndErrors.svelte';
	import ChatUserActivityTimeline from './ChatUserActivityTimeline.svelte';
	import ChatUserComparisonPanel from './ChatUserComparisonPanel.svelte';
	import ChatUserSessionsList from './ChatUserSessionsList.svelte';
	import ChatUserSummaryCards from './ChatUserSummaryCards.svelte';
	import { alertBadgeClass, buildUserAlertBadges } from './chat-user-ui';
	import type { RedactedSession, Timeframe, UserDetail, UserMetric } from './chat-user-types';

	interface Props {
		isOpen?: boolean;
		selectedUserId?: string | null;
		userDetail?: UserDetail | null;
		isLoadingDetail?: boolean;
		detailError?: string | null;
		selectedSessionId?: string | null;
		redactedSession?: RedactedSession | null;
		isLoadingSession?: boolean;
		sessionDetailError?: string | null;
		selectedEntityGroupKey?: string | null;
		isQueueingClassification?: boolean;
		classificationQueueMessage?: string | null;
		classificationQueueError?: string | null;
		slowThresholdMs?: string;
		cohortUsers?: UserMetric[];
		selectedTimeframe?: Timeframe;
		onClose: () => void;
		onExportUserDetailJson: () => void;
		onLoadRedactedSession: (sessionId: string) => void;
		onQueueVisibleClassificationSessions: () => void;
	}

	type InertNodeState = {
		node: Element;
		ariaHidden: string | null;
		wasInert: boolean;
	};

	let {
		isOpen = false,
		selectedUserId = null,
		userDetail = null,
		isLoadingDetail = false,
		detailError = null,
		selectedSessionId = null,
		redactedSession = null,
		isLoadingSession = false,
		sessionDetailError = null,
		selectedEntityGroupKey = $bindable<string | null>(null),
		isQueueingClassification = false,
		classificationQueueMessage = null,
		classificationQueueError = null,
		slowThresholdMs = '10000',
		cohortUsers = [],
		selectedTimeframe = '7d',
		onClose,
		onExportUserDetailJson,
		onLoadRedactedSession,
		onQueueVisibleClassificationSessions
	}: Props = $props();

	const propsId = $props.id();
	const titleId = 'chat-user-drawer-' + propsId + '-title';
	const subtitleId = 'chat-user-drawer-' + propsId + '-subtitle';
	const focusableSelector =
		'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

	let portalRootElement = $state<HTMLElement | null>(null);
	let drawerElement = $state<HTMLElement | null>(null);
	let elementToRestoreFocus: HTMLElement | null = null;
	let inertNodeStates: InertNodeState[] = [];
	let userAlertBadges = $derived(
		userDetail ? buildUserAlertBadges(userDetail.summary, slowThresholdMs) : []
	);

	function getFocusableElements(): HTMLElement[] {
		if (!drawerElement) return [];
		return Array.from(drawerElement.querySelectorAll<HTMLElement>(focusableSelector)).filter(
			(element) => !element.hasAttribute('disabled') && element.tabIndex !== -1
		);
	}

	function handleDrawerKeydown(event: KeyboardEvent) {
		if (!isOpen) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			onClose();
			return;
		}
		if (event.key !== 'Tab') return;

		const focusableElements = getFocusableElements();
		const first = focusableElements.at(0);
		const last = focusableElements.at(-1);
		if (!first || !last) {
			event.preventDefault();
			drawerElement?.focus();
			return;
		}

		const activeElement = document.activeElement;
		if (event.shiftKey && activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (!isOpen || event.defaultPrevented || event.key !== 'Escape') return;
		event.preventDefault();
		onClose();
	}

	function markBackgroundInert() {
		if (!browser || !portalRootElement) return;
		clearBackgroundInert();
		inertNodeStates = Array.from(document.body.children)
			.filter((node) => node !== portalRootElement)
			.map((node) => ({
				node,
				ariaHidden: node.getAttribute('aria-hidden'),
				wasInert: node.hasAttribute('inert')
			}));

		for (const { node } of inertNodeStates) {
			node.setAttribute('inert', '');
			node.setAttribute('aria-hidden', 'true');
		}
	}

	function clearBackgroundInert() {
		for (const { node, ariaHidden, wasInert } of inertNodeStates) {
			if (!wasInert) node.removeAttribute('inert');
			if (ariaHidden === null) {
				node.removeAttribute('aria-hidden');
			} else {
				node.setAttribute('aria-hidden', ariaHidden);
			}
		}
		inertNodeStates = [];
	}

	$effect(() => {
		if (!browser || !isOpen) return;

		lockBodyScroll();
		elementToRestoreFocus =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;

		let cancelled = false;
		void tick().then(() => {
			if (cancelled) return;
			markBackgroundInert();
			const closeControl = drawerElement?.querySelector<HTMLElement>(
				'[data-chat-user-drawer-close]'
			);
			const firstFocusable = getFocusableElements().at(0);
			(closeControl ?? firstFocusable ?? drawerElement)?.focus();
		});

		return () => {
			cancelled = true;
			clearBackgroundInert();
			unlockBodyScroll();
			elementToRestoreFocus?.focus?.();
			elementToRestoreFocus = null;
		};
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if isOpen}
	<div bind:this={portalRootElement} use:portal class="fixed inset-0 z-50">
		<button
			type="button"
			class="absolute inset-0 bg-background/70 backdrop-blur-sm"
			aria-label="Close user drilldown"
			onclick={onClose}
		></button>
		<div
			bind:this={drawerElement}
			role="dialog"
			aria-modal="true"
			aria-labelledby={titleId}
			aria-describedby={subtitleId}
			tabindex="-1"
			onkeydown={handleDrawerKeydown}
			class="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col border-l border-border bg-background shadow-ink-strong"
		>
			<div class="flex items-start justify-between gap-4 border-b border-border p-5">
				<div>
					<p class="micro-label">User Drilldown</p>
					<h2 id={titleId} class="mt-1 text-xl font-semibold text-foreground">
						{userDetail?.user.name ?? userDetail?.user.email ?? selectedUserId}
					</h2>
					<p id={subtitleId} class="mt-1 text-sm text-muted-foreground">
						{userDetail?.user.email ?? ''}
					</p>
				</div>
				<div class="flex items-center gap-2">
					<Button
						onclick={onExportUserDetailJson}
						disabled={!userDetail}
						variant="secondary"
						size="sm"
						icon={Download}
						class="pressable"
					>
						JSON
					</Button>
					<Button
						onclick={onClose}
						variant="ghost"
						size="sm"
						icon={X}
						aria-label="Close user drilldown"
						data-chat-user-drawer-close="true"
					/>
				</div>
			</div>

			<div class="flex-1 overflow-y-auto p-5">
				{#if isLoadingDetail}
					<div class="space-y-3">
						{#each Array.from({ length: 8 }) as _}
							<div
								class="h-8 animate-pulse rounded bg-muted motion-reduce:animate-none"
							></div>
						{/each}
					</div>
				{:else if detailError}
					<div class="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
						<p class="text-sm text-destructive">{detailError}</p>
					</div>
				{:else if userDetail}
					<div class="space-y-6">
						<ChatUserSummaryCards summary={userDetail.summary} />

						{#if userAlertBadges.length > 0}
							<section>
								<h3 class="micro-label font-semibold">Alert Badges</h3>
								<div class="mt-3 flex flex-wrap gap-2">
									{#each userAlertBadges as badge}
										<span
											class={`rounded border px-2 py-1 text-xs font-semibold ${alertBadgeClass(badge.tone)}`}
											title={badge.title}
										>
											{badge.label}
										</span>
									{/each}
								</div>
							</section>
						{/if}

						<ChatUserComparisonPanel
							summary={userDetail.summary}
							{cohortUsers}
							{selectedTimeframe}
						/>

						<ChatUserActivityTimeline timeline={userDetail.timeline} />

						<ChatUserSessionsList
							sessions={userDetail.sessions}
							{selectedSessionId}
							{isLoadingSession}
							{isQueueingClassification}
							{classificationQueueMessage}
							{classificationQueueError}
							{onLoadRedactedSession}
							{onQueueVisibleClassificationSessions}
						/>

						<ChatRedactedSessionTimeline
							{selectedSessionId}
							{redactedSession}
							{isLoadingSession}
							{sessionDetailError}
						/>

						<ChatIssueClusters
							errors={userDetail.errors}
							{selectedSessionId}
							{isLoadingSession}
							{onLoadRedactedSession}
						/>

						<ChatToolsAndErrors {userDetail} />

						<ChatEntityChanges
							{userDetail}
							bind:selectedEntityGroupKey
							{selectedSessionId}
							{isLoadingSession}
							{onLoadRedactedSession}
						/>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
