<!-- apps/web/src/lib/components/admin/chat-users/ChatUserDetailDrawer.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import { tick } from 'svelte';
	import { Clock, Database, Download, ExternalLink, User, Wrench, X } from '$lib/icons/lucide';
	import { portal } from '$lib/actions/portal';
	import { lockBodyScroll, unlockBodyScroll } from '$lib/utils/body-scroll-lock';
	import Button from '$lib/components/ui/Button.svelte';
	import ChatEntityChanges from './ChatEntityChanges.svelte';
	import ChatRedactedSessionTimeline from './ChatRedactedSessionTimeline.svelte';
	import {
		alertBadgeClass,
		buildIssueClusters,
		buildSessionAlertBadges,
		buildUserAlertBadges,
		buildUserComparison,
		classificationJobStatusClass,
		classificationJobStatusLabel,
		comparisonDeltaClass,
		comparisonToneClass,
		formatDate,
		formatDay,
		formatMs,
		formatNumber,
		projectHref
	} from './chat-user-ui';
	import type {
		RedactedSession,
		SessionMetric,
		Timeframe,
		UserDetail,
		UserMetric
	} from './chat-user-types';

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

	function queueableClassificationSessions(): SessionMetric[] {
		return (
			userDetail?.sessions.filter(
				(session) =>
					session.classification_state === 'missing' ||
					session.classification_state === 'stale'
			) ?? []
		);
	}

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
						<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
							<div class="rounded-lg border border-border bg-card p-3">
								<User class="h-4 w-4 text-muted-foreground" />
								<p class="mt-2 text-xl font-semibold">
									{formatNumber(userDetail.summary.session_count)}
								</p>
								<p class="text-xs text-muted-foreground">Sessions</p>
							</div>
							<div class="rounded-lg border border-border bg-card p-3">
								<Clock class="h-4 w-4 text-muted-foreground" />
								<p class="mt-2 text-xl font-semibold">
									{formatMs(userDetail.summary.ttfr_p95_ms)}
								</p>
								<p class="text-xs text-muted-foreground">p95 TTFR</p>
							</div>
							<div class="rounded-lg border border-border bg-card p-3">
								<Wrench class="h-4 w-4 text-muted-foreground" />
								<p class="mt-2 text-xl font-semibold">
									{formatNumber(userDetail.summary.tool_call_count)}
								</p>
								<p class="text-xs text-muted-foreground">Tool Calls</p>
							</div>
							<div class="rounded-lg border border-border bg-card p-3">
								<Database class="h-4 w-4 text-muted-foreground" />
								<p class="mt-2 text-xl font-semibold">
									{formatNumber(userDetail.summary.created_entity_count)}
								</p>
								<p class="text-xs text-muted-foreground">Created</p>
							</div>
						</div>

						{#if buildUserAlertBadges(userDetail.summary, slowThresholdMs).length > 0}
							<section>
								<h3 class="micro-label font-semibold">Alert Badges</h3>
								<div class="mt-3 flex flex-wrap gap-2">
									{#each buildUserAlertBadges(userDetail.summary, slowThresholdMs) as badge}
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

						<section>
							<div class="flex flex-wrap items-end justify-between gap-3">
								<div>
									<h3 class="micro-label font-semibold">
										Current Result Comparison
									</h3>
									<p class="mt-1 text-sm text-muted-foreground">
										Compared with {formatNumber(cohortUsers.length)} loaded users
										from the active filters.
									</p>
								</div>
								<p class="text-xs text-muted-foreground">
									Average baseline · {selectedTimeframe}
								</p>
							</div>
							{#if buildUserComparison(userDetail.summary, cohortUsers).length === 0}
								<div
									class="mt-3 rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground"
								>
									No loaded cohort metrics are available for comparison.
								</div>
							{:else}
								<div class="mt-3 grid gap-2 md:grid-cols-2">
									{#each buildUserComparison(userDetail.summary, cohortUsers) as metric (metric.label)}
										<div
											class={`rounded-lg border p-3 ${comparisonToneClass(metric.tone)}`}
										>
											<div class="flex items-start justify-between gap-3">
												<div>
													<p class="micro-label font-semibold">
														{metric.label}
													</p>
													<p
														class="mt-1 text-lg font-semibold text-foreground"
													>
														{metric.user_value}
													</p>
												</div>
												<span
													class={`rounded border px-2 py-0.5 text-xs font-semibold ${comparisonDeltaClass(metric.tone)}`}
												>
													{metric.delta}
												</span>
											</div>
											<p class="mt-1 text-xs text-muted-foreground">
												Avg {metric.cohort_value} · {metric.description}
											</p>
										</div>
									{/each}
								</div>
							{/if}
						</section>

						<section>
							<h3 class="micro-label font-semibold">Activity</h3>
							<div class="mt-3 space-y-2">
								{#each userDetail.timeline.slice(0, 14) as day}
									<div
										class="grid grid-cols-[72px_1fr] items-center gap-3 text-sm"
									>
										<span class="text-muted-foreground"
											>{formatDay(day.date)}</span
										>
										<div
											class="rounded-lg border border-border bg-card px-3 py-2"
										>
											<p class="text-foreground">
												{formatNumber(day.session_count)} sessions · {formatNumber(
													day.turn_count
												)} turns · {formatNumber(day.message_count)} messages
											</p>
											<p class="truncate text-xs text-muted-foreground">
												{day.top_topics.join(', ') ||
													day.project_names.join(', ') ||
													'No classifier topic'}
											</p>
										</div>
									</div>
								{/each}
							</div>
						</section>

						<section>
							<div class="flex flex-wrap items-center justify-between gap-3">
								<div>
									<h3 class="micro-label font-semibold">Recent Sessions</h3>
									{#if queueableClassificationSessions().length > 0}
										<p class="mt-1 text-sm text-muted-foreground">
											{formatNumber(queueableClassificationSessions().length)}
											visible sessions need classification.
										</p>
									{/if}
								</div>
								<Button
									onclick={onQueueVisibleClassificationSessions}
									disabled={queueableClassificationSessions().length === 0 ||
										isQueueingClassification}
									loading={isQueueingClassification}
									variant="secondary"
									size="sm"
									class="pressable"
								>
									Queue Classification
								</Button>
							</div>
							{#if classificationQueueError}
								<div
									class="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3"
								>
									<p class="text-sm text-destructive">
										{classificationQueueError}
									</p>
								</div>
							{:else if classificationQueueMessage}
								<div
									class="mt-3 rounded-lg border border-success/30 bg-success/10 p-3"
								>
									<p class="text-sm text-success">{classificationQueueMessage}</p>
								</div>
							{/if}
							<div class="mt-3 space-y-3">
								{#each userDetail.sessions as session}
									{@const sessionBadges = buildSessionAlertBadges(session)}
									<div class="rounded-lg border border-border bg-card p-3">
										<div
											class="flex flex-wrap items-start justify-between gap-3"
										>
											<div>
												<p class="font-semibold text-foreground">
													{session.title}
												</p>
												<p class="text-xs text-muted-foreground">
													{formatDate(session.last_activity_at)} · {session.context_type}
													· {session.classification_state}
												</p>
											</div>
											<div
												class="flex flex-wrap items-center justify-end gap-3"
											>
												<button
													type="button"
													class="text-xs font-semibold text-accent hover:underline disabled:cursor-wait disabled:opacity-60"
													disabled={isLoadingSession &&
														selectedSessionId === session.session_id}
													onclick={() =>
														onLoadRedactedSession(session.session_id)}
												>
													{selectedSessionId === session.session_id
														? isLoadingSession
															? 'Loading timeline'
															: 'Timeline selected'
														: 'Inspect redacted timeline'}
												</button>
												<a
													class="text-xs font-semibold text-muted-foreground hover:text-accent hover:underline"
													href={`/admin/chat/sessions?chat_session_id=${session.session_id}`}
												>
													Open full session audit
												</a>
											</div>
										</div>
										{#if sessionBadges.length > 0}
											<div class="mt-3 flex flex-wrap gap-1.5">
												{#each sessionBadges as badge}
													<span
														class={`rounded border px-2 py-0.5 text-[11px] font-semibold ${alertBadgeClass(badge.tone)}`}
														title={badge.title}
													>
														{badge.label}
													</span>
												{/each}
											</div>
										{/if}
										{#if session.classification_job}
											<div
												class="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
											>
												<span
													class={`rounded border px-2 py-0.5 text-[11px] font-semibold ${classificationJobStatusClass(session.classification_job)}`}
												>
													{classificationJobStatusLabel(
														session.classification_job
													) ?? 'Job status'}
												</span>
												{#if session.classification_job.queued_at}
													<span
														>Queued {formatDate(
															session.classification_job.queued_at
														)}</span
													>
												{/if}
												{#if session.classification_job.updated_at && session.classification_job.updated_at !== session.classification_job.queued_at}
													<span
														>Updated {formatDate(
															session.classification_job.updated_at
														)}</span
													>
												{/if}
												{#if session.classification_job.error_message}
													<span class="text-destructive">
														{session.classification_job.error_message.slice(
															0,
															140
														)}
													</span>
												{/if}
											</div>
										{/if}
										<div
											class="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground md:grid-cols-5"
										>
											<span>{formatNumber(session.turn_count)} turns</span>
											<span
												>{formatNumber(session.message_count)} messages</span
											>
											<span>{formatMs(session.ttfr_p95_ms)} p95</span>
											<span
												>{formatNumber(session.tool_call_count)} tools</span
											>
											<span
												>{formatNumber(session.created_entity_count)} created</span
											>
										</div>
										{#if session.project_ids.length > 0}
											<div class="mt-3 flex flex-wrap gap-1.5">
												{#each session.project_ids.slice(0, 4) as projectId, index (projectId)}
													{@const href = projectHref(projectId)}
													{#if href}
														<a
															{href}
															target="_blank"
															rel="noopener noreferrer"
															class="inline-flex max-w-[14rem] items-center gap-1 rounded border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:border-accent/50 hover:text-accent"
														>
															<span class="truncate">
																{session.project_names[index] ??
																	projectId}
															</span>
															<ExternalLink
																class="h-3 w-3 shrink-0"
															/>
														</a>
													{/if}
												{/each}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</section>

						<ChatRedactedSessionTimeline
							{selectedSessionId}
							{redactedSession}
							{isLoadingSession}
							{sessionDetailError}
						/>

						{#if buildIssueClusters(userDetail.errors).length > 0}
							<section>
								<div class="flex flex-wrap items-end justify-between gap-3">
									<div>
										<h3 class="micro-label font-semibold">Issue Clusters</h3>
										<p class="mt-1 text-sm text-muted-foreground">
											Repeated safe error summaries grouped by source and
											normalized message.
										</p>
									</div>
									<p class="text-xs text-muted-foreground">
										{formatNumber(userDetail.errors.length)} error events
									</p>
								</div>
								<div class="mt-3 space-y-2">
									{#each buildIssueClusters(userDetail.errors).slice(0, 5) as cluster (cluster.key)}
										<div
											class="rounded-lg border border-border bg-card p-3 text-sm"
										>
											<div
												class="flex flex-wrap items-start justify-between gap-3"
											>
												<div class="min-w-0">
													<p class="font-semibold text-foreground">
														{cluster.source} · {cluster.severity ??
															'unknown'}
													</p>
													<p
														class="mt-1 line-clamp-2 text-xs text-muted-foreground"
													>
														{cluster.message}
													</p>
													<p
														class="mt-1 text-[11px] text-muted-foreground"
													>
														Latest {formatDate(cluster.latest_at)}
													</p>
												</div>
												<div class="flex shrink-0 flex-col items-end gap-2">
													<span
														class={`rounded border px-2 py-0.5 text-xs font-semibold ${alertBadgeClass(cluster.count >= 3 ? 'bad' : 'warning')}`}
													>
														{formatNumber(cluster.count)}x
													</span>
													{#if cluster.session_id}
														<button
															type="button"
															class="text-xs font-semibold text-accent hover:underline disabled:cursor-wait disabled:opacity-60"
															disabled={isLoadingSession &&
																selectedSessionId ===
																	cluster.session_id}
															onclick={() =>
																cluster.session_id &&
																onLoadRedactedSession(
																	cluster.session_id
																)}
														>
															Inspect timeline
														</button>
													{/if}
												</div>
											</div>
										</div>
									{/each}
								</div>
							</section>
						{/if}

						<section class="grid gap-4 md:grid-cols-2">
							<div>
								<h3 class="micro-label font-semibold">Tools</h3>
								<div class="mt-3 space-y-2">
									{#each userDetail.tools.slice(0, 8) as tool}
										<div
											class="rounded-lg border border-border bg-card p-3 text-sm"
										>
											<p class="font-semibold text-foreground">
												{tool.tool_name}
											</p>
											<p class="text-xs text-muted-foreground">
												{tool.gateway_op ?? 'no op'} · {formatNumber(
													tool.count
												)} calls · {formatNumber(tool.failures)} failed · p95
												{formatMs(tool.p95_execution_time_ms)}
											</p>
										</div>
									{/each}
								</div>
							</div>
							<div>
								<h3 class="micro-label font-semibold">Errors</h3>
								<div class="mt-3 space-y-2">
									{#each userDetail.errors.slice(0, 8) as item}
										<div
											class="rounded-lg border border-border bg-card p-3 text-sm"
										>
											<p class="font-semibold text-foreground">
												{item.source} · {item.severity ?? 'unknown'}
											</p>
											<p class="line-clamp-2 text-xs text-muted-foreground">
												{item.error_message}
											</p>
											<p class="mt-1 text-[11px] text-muted-foreground">
												{formatDate(item.created_at)}
											</p>
										</div>
									{/each}
								</div>
							</div>
						</section>

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
