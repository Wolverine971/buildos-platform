<!-- apps/web/src/lib/components/admin/chat-users/ChatRedactedSessionTimeline.svelte -->
<script lang="ts">
	import { ExternalLink } from '$lib/icons/lucide';
	import {
		entityHref,
		eventTypeLabel,
		formatDate,
		formatMs,
		formatNumber,
		severityClass
	} from './chat-user-ui';
	import type { RedactedSession } from './chat-user-types';

	interface Props {
		selectedSessionId?: string | null;
		redactedSession?: RedactedSession | null;
		isLoadingSession?: boolean;
		sessionDetailError?: string | null;
	}

	let {
		selectedSessionId = null,
		redactedSession = null,
		isLoadingSession = false,
		sessionDetailError = null
	}: Props = $props();
</script>

{#if selectedSessionId || isLoadingSession || sessionDetailError || redactedSession}
	<section>
		<div class="flex flex-wrap items-end justify-between gap-3">
			<div>
				<h3 class="micro-label font-semibold">Redacted Session Timeline</h3>
				{#if redactedSession}
					<p class="mt-1 text-sm text-muted-foreground">
						{redactedSession.session.title} · {formatDate(
							redactedSession.session.last_activity_at
						)}
					</p>
				{/if}
			</div>
			{#if redactedSession}
				<a
					class="text-xs font-semibold text-muted-foreground hover:text-accent hover:underline"
					href={`/admin/chat/sessions?chat_session_id=${redactedSession.session.session_id}`}
				>
					Open full session audit
				</a>
			{/if}
		</div>

		{#if isLoadingSession}
			<div class="mt-3 space-y-2">
				{#each Array.from({ length: 4 }) as _}
					<div
						class="h-10 animate-pulse rounded bg-muted motion-reduce:animate-none"
					></div>
				{/each}
			</div>
		{:else if sessionDetailError}
			<div class="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
				<p class="text-sm text-destructive">{sessionDetailError}</p>
			</div>
		{:else if redactedSession}
			<div class="mt-3 rounded-lg border border-border bg-card p-3">
				<div class="grid grid-cols-2 gap-2 text-xs md:grid-cols-6">
					<div>
						<p class="text-muted-foreground">Turns</p>
						<p class="text-sm font-semibold text-foreground">
							{formatNumber(redactedSession.session.turn_count)}
						</p>
					</div>
					<div>
						<p class="text-muted-foreground">Messages</p>
						<p class="text-sm font-semibold text-foreground">
							{formatNumber(redactedSession.session.message_count)}
						</p>
					</div>
					<div>
						<p class="text-muted-foreground">Tools</p>
						<p class="text-sm font-semibold text-foreground">
							{formatNumber(redactedSession.session.tool_call_count)}
						</p>
					</div>
					<div>
						<p class="text-muted-foreground">LLM</p>
						<p class="text-sm font-semibold text-foreground">
							{formatNumber(redactedSession.session.llm_call_count)}
						</p>
					</div>
					<div>
						<p class="text-muted-foreground">p95 TTFR</p>
						<p class="text-sm font-semibold text-foreground">
							{formatMs(redactedSession.session.ttfr_p95_ms)}
						</p>
					</div>
					<div>
						<p class="text-muted-foreground">Entities</p>
						<p class="text-sm font-semibold text-foreground">
							{formatNumber(
								redactedSession.session.created_entity_count +
									redactedSession.session.updated_entity_count +
									redactedSession.session.deleted_entity_count
							)}
						</p>
					</div>
				</div>
				<div class="mt-3 flex flex-wrap gap-2 text-[11px]">
					<span
						class="rounded border border-border bg-muted px-2 py-0.5 text-muted-foreground"
						>Content hidden</span
					>
					<span
						class="rounded border border-border bg-muted px-2 py-0.5 text-muted-foreground"
						>Tool payloads hidden</span
					>
					<span
						class="rounded border border-border bg-muted px-2 py-0.5 text-muted-foreground"
						>Prompts hidden</span
					>
				</div>
			</div>

			<div class="mt-3 space-y-3">
				{#if redactedSession.turns.length === 0}
					<div
						class="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground"
					>
						No turn runs were recorded for this session.
					</div>
				{:else}
					{#each redactedSession.turns as turn (turn.turn_run_id)}
						<div class="rounded-lg border border-border bg-card p-3">
							<div class="flex flex-wrap items-start justify-between gap-3">
								<div>
									<p class="font-semibold text-foreground">
										Turn {turn.turn_index} · {turn.status}
									</p>
									<p class="text-xs text-muted-foreground">
										{formatDate(turn.started_at)} -> {formatDate(
											turn.finished_at
										)}
									</p>
								</div>
								<span
									class={`rounded border px-2 py-0.5 text-[11px] ${
										turn.error_summaries.length > 0
											? 'border-destructive/30 bg-destructive/10 text-destructive'
											: 'border-success/30 bg-success/10 text-success'
									}`}
								>
									{turn.error_summaries.length > 0
										? `${formatNumber(turn.error_summaries.length)} issues`
										: 'clean'}
								</span>
							</div>
							<div
								class="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground md:grid-cols-6"
							>
								<span>TTFR {formatMs(turn.ttfr_ms)}</span>
								<span>TTFE {formatMs(turn.ttfe_ms)}</span>
								<span>{formatNumber(turn.tool_call_count)} tools</span>
								<span>{formatNumber(turn.llm_pass_count)} LLM</span>
								<span>{formatNumber(turn.validation_failure_count)} validation</span
								>
								<span>{formatMs(turn.duration_ms)} duration</span>
							</div>
							{#if turn.first_lane || turn.first_skill_path || turn.first_canonical_op || turn.cache_source || turn.prepared_prompt_hit !== null}
								<div class="mt-3 flex flex-wrap gap-1 text-[11px]">
									{#if turn.first_lane}
										<span
											class="rounded border border-border bg-muted px-2 py-0.5 text-muted-foreground"
											>lane {turn.first_lane}</span
										>
									{/if}
									{#if turn.first_skill_path}
										<span
											class="rounded border border-border bg-muted px-2 py-0.5 text-muted-foreground"
											>{turn.first_skill_path}</span
										>
									{/if}
									{#if turn.first_canonical_op}
										<span
											class="rounded border border-border bg-muted px-2 py-0.5 text-muted-foreground"
											>{turn.first_canonical_op}</span
										>
									{/if}
									{#if turn.cache_source}
										<span
											class="rounded border border-border bg-muted px-2 py-0.5 text-muted-foreground"
											>cache {turn.cache_source}</span
										>
									{/if}
									{#if turn.prepared_prompt_hit !== null}
										<span
											class="rounded border border-border bg-muted px-2 py-0.5 text-muted-foreground"
											>prepared {turn.prepared_prompt_hit
												? 'hit'
												: 'miss'}</span
										>
									{/if}
								</div>
							{/if}
							{#if turn.error_summaries.length > 0}
								<div class="mt-3 space-y-1">
									<p class="micro-label font-semibold">Errors</p>
									{#each turn.error_summaries as item}
										<p class="text-xs text-muted-foreground">
											<span class="font-semibold text-foreground"
												>{item.source}</span
											>
											· {item.message}
										</p>
									{/each}
								</div>
							{/if}
							{#if turn.entity_changes.length > 0}
								<div class="mt-3 space-y-1">
									<p class="micro-label font-semibold">Entity Changes</p>
									<div class="flex flex-wrap gap-1">
										{#each turn.entity_changes as change}
											{@const href = entityHref(
												change.project_id,
												change.entity_type,
												change.entity_id
											)}
											{#if href}
												<a
													{href}
													target="_blank"
													rel="noopener noreferrer"
													class="inline-flex max-w-[16rem] items-center gap-1 rounded border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:border-accent/50 hover:text-accent"
												>
													<span class="truncate">
														{change.action}
														{change.entity_type}
														{change.entity_title ?? change.entity_id}
													</span>
													<ExternalLink class="h-3 w-3 shrink-0" />
												</a>
											{:else}
												<span
													class="rounded border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
													>{change.action}
													{change.entity_type}
													{change.entity_title ?? change.entity_id}</span
												>
											{/if}
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/each}
				{/if}
			</div>

			<div class="mt-4">
				<h4 class="micro-label font-semibold">Events</h4>
				<div class="mt-2 space-y-2">
					{#each redactedSession.timeline.slice(0, 60) as event (event.id)}
						<div class="grid grid-cols-[88px_1fr] gap-3 text-xs">
							<span class="pt-2 text-muted-foreground"
								>{formatDate(event.timestamp)}</span
							>
							<div
								class={`rounded-lg border px-3 py-2 ${severityClass(event.severity)}`}
							>
								<div class="flex flex-wrap items-center justify-between gap-2">
									<p class="font-semibold">
										{event.title}
									</p>
									<span class="micro-label font-semibold text-current">
										{eventTypeLabel(event.type)}
										{#if event.turn_index}
											· T{event.turn_index}
										{/if}
									</span>
								</div>
								<p class="mt-1">{event.summary}</p>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</section>
{/if}
