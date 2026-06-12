<!-- apps/web/src/lib/components/admin/chat/SessionList.svelte -->
<script lang="ts">
	import { AlertCircle, MessageSquare, XCircle } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		formatCurrency,
		formatDateTime,
		formatNumber
	} from '$lib/services/admin/chat-session-audit-formatters';
	import type { SessionListItem } from '$lib/services/admin/chat-session-audit-types';
	import { libriStatusClasses, statusBadge } from './session-audit-ui';

	let {
		sessions,
		isLoadingSessions,
		sessionsError,
		totalSessions,
		currentPage,
		pageSize,
		selectedSessionId,
		onOpenSession,
		onPreviousPage,
		onNextPage
	}: {
		sessions: SessionListItem[];
		isLoadingSessions: boolean;
		sessionsError: string | null;
		totalSessions: number;
		currentPage: number;
		pageSize: number;
		selectedSessionId: string | null;
		onOpenSession: (sessionId: string) => void;
		onPreviousPage: () => void;
		onNextPage: () => void;
	} = $props();
</script>

<div
	class="bg-card border border-border rounded-lg shadow-ink overflow-hidden flex flex-col min-h-[24rem] xl:h-full"
>
	<div class="p-3 border-b border-border flex items-center justify-between gap-2 shrink-0">
		<div>
			<div class="text-sm font-semibold text-foreground">Sessions</div>
			<div class="text-xs text-muted-foreground">
				{formatNumber(totalSessions)} total
			</div>
		</div>
		<div class="text-xs text-muted-foreground">Page {currentPage} · Opens in modal</div>
	</div>

	{#if isLoadingSessions}
		<div class="p-2 space-y-2">
			{#each Array(6) as _}
				<div class="border border-border rounded-lg p-2.5 animate-pulse">
					<div class="h-3 bg-muted rounded w-3/4 mb-2"></div>
					<div class="h-2.5 bg-muted rounded w-1/2"></div>
				</div>
			{/each}
		</div>
	{:else if sessionsError}
		<div class="p-3 text-sm text-destructive flex items-start gap-2">
			<AlertCircle class="h-4 w-4 mt-0.5 shrink-0" />
			<span>{sessionsError}</span>
		</div>
	{:else if sessions.length === 0}
		<div class="p-6 text-center text-sm text-muted-foreground">
			<MessageSquare class="h-8 w-8 mx-auto mb-2 opacity-60" />
			No sessions found for current filters.
		</div>
	{:else}
		<div class="flex-1 overflow-y-auto overscroll-contain p-2 space-y-1.5">
			{#each sessions as session}
				<button
					class="w-full text-left rounded-lg border p-2.5 transition-all pressable {selectedSessionId ===
					session.id
						? 'border-accent/60 bg-accent/10 shadow-ink-strong'
						: 'border-border bg-background hover:border-accent/40'}"
					aria-haspopup="dialog"
					aria-expanded={selectedSessionId === session.id}
					onclick={() => onOpenSession(session.id)}
				>
					<div class="flex items-start justify-between gap-2 mb-1">
						<div
							class="text-sm font-semibold text-foreground leading-tight line-clamp-2"
						>
							{session.title}
						</div>
						{#if session.has_errors}
							<span
								class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive shrink-0"
							>
								<XCircle class="h-3 w-3" />
								Error
							</span>
						{/if}
					</div>
					<div class="text-xs text-muted-foreground truncate">
						{session.user.email}
					</div>
					<div class="mt-0.5 text-xs text-muted-foreground">
						{formatDateTime(session.updated_at)}
					</div>
					<div class="mt-1.5 flex flex-wrap items-center gap-1.5">
						<span
							class="px-1.5 py-0.5 rounded-full text-xs font-medium {statusBadge(
								session.status
							)}"
						>
							{session.status}
						</span>
						<span
							class="px-1.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground"
						>
							{session.context_type}
						</span>
						<span class="text-xs text-foreground/70">
							{formatNumber(session.message_count)} msg
						</span>
						<span class="text-xs text-foreground/70">
							{formatNumber(session.tool_call_count)} tools
						</span>
						<span class="text-xs font-semibold text-foreground">
							Cost {formatCurrency(session.cost_estimate)}
						</span>
						{#if session.has_libri_extraction || session.libri_handoff_status}
							<span
								class="px-1.5 py-0.5 rounded-full text-xs font-medium {libriStatusClasses(
									session.libri_handoff_status ?? ''
								)}"
							>
								Libri {formatNumber(session.libri_candidate_count)}
								{#if session.libri_handoff_status}
									· {session.libri_handoff_status}
								{/if}
							</span>
						{/if}
					</div>
				</button>
			{/each}
		</div>
	{/if}

	<div class="p-2.5 border-t border-border flex items-center justify-between gap-2 shrink-0">
		<Button
			onclick={onPreviousPage}
			disabled={currentPage === 1}
			variant="secondary"
			size="sm"
			class="pressable"
		>
			Prev
		</Button>
		<div class="text-xs text-muted-foreground">
			{Math.min((currentPage - 1) * pageSize + 1, totalSessions)}-{Math.min(
				currentPage * pageSize,
				totalSessions
			)} / {formatNumber(totalSessions)}
		</div>
		<Button
			onclick={onNextPage}
			disabled={currentPage * pageSize >= totalSessions}
			variant="secondary"
			size="sm"
			class="pressable"
		>
			Next
		</Button>
	</div>
</div>
