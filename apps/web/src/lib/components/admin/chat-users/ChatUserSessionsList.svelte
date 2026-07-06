<!-- apps/web/src/lib/components/admin/chat-users/ChatUserSessionsList.svelte -->
<script lang="ts">
	import { ExternalLink } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import type { SessionMetric } from './chat-user-types';
	import {
		alertBadgeClass,
		buildSessionAlertBadges,
		classificationJobStatusClass,
		classificationJobStatusLabel,
		formatDate,
		formatMs,
		formatNumber,
		projectHref
	} from './chat-user-ui';

	interface Props {
		sessions: SessionMetric[];
		selectedSessionId?: string | null;
		isLoadingSession?: boolean;
		isQueueingClassification?: boolean;
		classificationQueueMessage?: string | null;
		classificationQueueError?: string | null;
		onLoadRedactedSession: (sessionId: string) => void;
		onQueueVisibleClassificationSessions: () => void;
	}

	let {
		sessions,
		selectedSessionId = null,
		isLoadingSession = false,
		isQueueingClassification = false,
		classificationQueueMessage = null,
		classificationQueueError = null,
		onLoadRedactedSession,
		onQueueVisibleClassificationSessions
	}: Props = $props();

	let queueableClassificationSessions = $derived(
		sessions.filter(
			(session) =>
				session.classification_state === 'missing' ||
				session.classification_state === 'stale'
		)
	);

	function isSelectedSessionLoading(session: SessionMetric): boolean {
		return isLoadingSession && selectedSessionId === session.session_id;
	}

	function sessionTimelineLabel(session: SessionMetric): string {
		if (selectedSessionId !== session.session_id) return 'Inspect redacted timeline';
		return isLoadingSession ? 'Loading timeline' : 'Timeline selected';
	}

	function sessionAuditHref(sessionId: string): string {
		return `/admin/chat/sessions?chat_session_id=${encodeURIComponent(sessionId)}`;
	}
</script>

<section>
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h3 class="micro-label font-semibold">Recent Sessions</h3>
			{#if queueableClassificationSessions.length > 0}
				<p class="mt-1 text-sm text-muted-foreground">
					{formatNumber(queueableClassificationSessions.length)} visible sessions need classification.
				</p>
			{/if}
		</div>
		<Button
			onclick={onQueueVisibleClassificationSessions}
			disabled={queueableClassificationSessions.length === 0 || isQueueingClassification}
			loading={isQueueingClassification}
			variant="secondary"
			size="sm"
			class="pressable"
		>
			Queue Classification
		</Button>
	</div>
	{#if classificationQueueError}
		<div class="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
			<p class="text-sm text-destructive">{classificationQueueError}</p>
		</div>
	{:else if classificationQueueMessage}
		<div class="mt-3 rounded-lg border border-success/30 bg-success/10 p-3">
			<p class="text-sm text-success">{classificationQueueMessage}</p>
		</div>
	{/if}
	{#if sessions.length === 0}
		<div class="mt-3 rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
			No recent sessions are available for this user.
		</div>
	{:else}
		<div class="mt-3 space-y-3">
			{#each sessions as session (session.session_id)}
				{@const sessionBadges = buildSessionAlertBadges(session)}
				<div class="rounded-lg border border-border bg-card p-3">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="truncate font-semibold text-foreground">{session.title}</p>
							<p class="text-xs text-muted-foreground">
								{formatDate(session.last_activity_at)} · {session.context_type} · {session.classification_state}
							</p>
						</div>
						<div class="flex flex-wrap items-center justify-end gap-2">
							<Button
								onclick={() => onLoadRedactedSession(session.session_id)}
								disabled={isSelectedSessionLoading(session)}
								loading={isSelectedSessionLoading(session)}
								variant={selectedSessionId === session.session_id
									? 'accent'
									: 'ghost'}
								size="sm"
								class="pressable shrink-0 text-xs"
							>
								{sessionTimelineLabel(session)}
							</Button>
							<a
								class="inline-flex min-h-[44px] items-center rounded px-2 text-xs font-semibold text-muted-foreground hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
								href={sessionAuditHref(session.session_id)}
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
								{classificationJobStatusLabel(session.classification_job) ??
									'Job status'}
							</span>
							{#if session.classification_job.queued_at}
								<span
									>Queued {formatDate(session.classification_job.queued_at)}</span
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
									{session.classification_job.error_message.slice(0, 140)}
								</span>
							{/if}
						</div>
					{/if}
					<div
						class="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground md:grid-cols-5"
					>
						<span>{formatNumber(session.turn_count)} turns</span>
						<span>{formatNumber(session.message_count)} messages</span>
						<span>{formatMs(session.ttfr_p95_ms)} p95</span>
						<span>{formatNumber(session.tool_call_count)} tools</span>
						<span>{formatNumber(session.created_entity_count)} created</span>
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
										class="inline-flex max-w-[14rem] items-center gap-1 rounded border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
									>
										<span class="truncate">
											{session.project_names[index] ?? projectId}
										</span>
										<ExternalLink class="h-3 w-3 shrink-0" />
									</a>
								{/if}
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</section>
