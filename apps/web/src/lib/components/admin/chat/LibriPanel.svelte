<!-- apps/web/src/lib/components/admin/chat/LibriPanel.svelte -->
<script lang="ts">
	import {
		formatDateTime,
		formatNumber,
		pluralize,
		prettyJson
	} from '$lib/services/admin/chat-session-audit-formatters';
	import {
		formatConfidence,
		formatLibriLabel
	} from '$lib/services/admin/chat-session-audit-libri';
	import type {
		ChatSessionAuditPayload as SessionDetailPayload,
		LibriExtractionDisplay,
		LibriHandoffDisplay
	} from '$lib/services/admin/chat-session-audit-types';
	import { libriStatusClasses } from './session-audit-ui';

	let {
		sessionDetail,
		libriExtraction,
		libriHandoff
	}: {
		sessionDetail: SessionDetailPayload;
		libriExtraction: LibriExtractionDisplay;
		libriHandoff: LibriHandoffDisplay | null;
	} = $props();
</script>

{#if libriExtraction.candidates.length > 0 || libriExtraction.ignoredCount > 0 || libriHandoff}
	<section
		class="rounded-lg border border-border bg-background px-3 py-2"
		aria-label="Libri entity handoff"
	>
		<div class="flex flex-wrap items-start justify-between gap-2">
			<div>
				<div class="text-xs font-semibold text-foreground/60 uppercase tracking-wide">
					Libri Entity Handoff
				</div>
				<div class="mt-1 text-xs text-muted-foreground">
					{formatNumber(libriExtraction.candidates.length)}
					{pluralize(libriExtraction.candidates.length, 'candidate')}
					{#if libriExtraction.ignoredCount > 0}
						· {formatNumber(libriExtraction.ignoredCount)} ignored
					{/if}
					{#if libriExtraction.extractedAt}
						· extracted {formatDateTime(libriExtraction.extractedAt)}
					{/if}
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-1.5">
				{#if libriHandoff}
					<span
						class="rounded-full px-2 py-0.5 text-xs font-medium {libriStatusClasses(
							libriHandoff.status
						)}"
					>
						{libriHandoff.status}
					</span>
					{#if libriHandoff.results.length > 0}
						<span
							class="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground/70"
						>
							{formatNumber(libriHandoff.results.length)}
							{pluralize(libriHandoff.results.length, 'result')}
						</span>
					{/if}
				{:else}
					<span
						class="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
					>
						no handoff status
					</span>
				{/if}
			</div>
		</div>

		{#if libriHandoff?.message}
			<div
				class="mt-2 rounded border border-border bg-card px-2.5 py-2 text-xs text-muted-foreground"
			>
				{libriHandoff.message}
			</div>
		{/if}

		{#if libriExtraction.candidates.length > 0}
			<div class="mt-3 grid gap-2 lg:grid-cols-2">
				{#each libriExtraction.candidates as candidate}
					<div class="rounded border border-border bg-card p-2">
						<div class="flex flex-wrap items-start justify-between gap-2">
							<div class="min-w-0">
								<div class="truncate text-sm font-semibold text-foreground">
									{candidate.displayName || '(unnamed)'}
								</div>
								<div class="mt-0.5 break-words text-xs text-muted-foreground">
									{candidate.canonicalQuery || '-'}
								</div>
							</div>
							<div class="flex flex-wrap justify-end gap-1">
								<span
									class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground/70"
								>
									{formatLibriLabel(candidate.entityType)}
								</span>
								<span
									class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground/70"
								>
									{formatConfidence(candidate.confidence)}
								</span>
							</div>
						</div>
						<div class="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
							<span class="rounded-full bg-background px-2 py-0.5">
								{formatLibriLabel(candidate.action)}
							</span>
							<span class="rounded-full bg-background px-2 py-0.5">
								{formatLibriLabel(candidate.relevance)}
							</span>
							{#if candidate.youtubeVideoId}
								<span class="rounded-full bg-background px-2 py-0.5">
									video {candidate.youtubeVideoId}
								</span>
							{/if}
							{#if candidate.authors.length > 0}
								<span class="rounded-full bg-background px-2 py-0.5">
									by {candidate.authors.join(', ')}
								</span>
							{/if}
							{#if candidate.sourceTurns.length > 0}
								<span class="rounded-full bg-background px-2 py-0.5">
									turns {candidate.sourceTurns.join(', ')}
								</span>
							{/if}
						</div>
						{#if candidate.evidenceSnippets.length > 0}
							<div class="mt-2 text-xs italic text-foreground/70 line-clamp-2">
								"{candidate.evidenceSnippets[0]}"
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		{#if libriHandoff?.results.length}
			<div class="mt-3 space-y-1.5">
				<div class="text-xs font-semibold uppercase tracking-wide text-foreground/60">
					Libri Results
				</div>
				<div class="grid gap-1.5 lg:grid-cols-2">
					{#each libriHandoff.results as result}
						<div class="rounded border border-border bg-card px-2.5 py-2 text-xs">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<div class="min-w-0 truncate font-semibold text-foreground">
									{result.canonicalQuery || '-'}
								</div>
								<span
									class="rounded-full px-2 py-0.5 font-medium {libriStatusClasses(
										result.status
									)}"
								>
									{result.status}
								</span>
							</div>
							<div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
								{#if result.resourceKey}
									<span>resource {result.resourceKey}</span>
								{/if}
								{#if result.jobId}
									<span>job {result.jobId}</span>
								{/if}
								{#if result.message}
									<span>{result.message}</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<details class="mt-3 rounded border border-border bg-card p-2 text-xs">
			<summary class="cursor-pointer font-medium text-foreground">
				Raw Libri Payloads
			</summary>
			<pre
				class="mt-2 whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground">{prettyJson(
					{
						extracted_entities: sessionDetail.session.extracted_entities,
						libri_handoff: libriHandoff?.raw ?? null
					}
				)}</pre>
		</details>
	</section>
{/if}
