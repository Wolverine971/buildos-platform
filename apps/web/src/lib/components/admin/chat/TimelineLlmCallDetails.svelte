<!-- apps/web/src/lib/components/admin/chat/TimelineLlmCallDetails.svelte -->
<script lang="ts">
	import {
		formatCurrency,
		formatDuration,
		formatNumber,
		pluralize,
		prettyJson,
		truncateText
	} from '$lib/services/admin/chat-session-audit-formatters';
	import { payloadField, stringValue } from '$lib/services/admin/chat-session-audit-payload';
	import {
		capturedPromptMessages,
		promptSnapshotFromTurnRun,
		timelineGroupRequestMessage
	} from '$lib/services/admin/chat-session-audit-prompt';
	import type {
		AuditRecord,
		ChatSessionAuditPayload as SessionDetailPayload,
		TimelineGroup
	} from '$lib/services/admin/chat-session-audit-types';

	let {
		event,
		payload,
		group
	}: {
		event: SessionDetailPayload['timeline'][number];
		payload: AuditRecord;
		group: TimelineGroup;
	} = $props();

	let promptSnapshot = $derived(promptSnapshotFromTurnRun(group.run));
	let promptMessages = $derived(capturedPromptMessages(group.run));
	let requestMessage = $derived(timelineGroupRequestMessage(group));
	let showFullPrompt = $state(false);
	let promptVariant = $derived(
		stringValue(payloadField(payload, 'prompt_variant')) ||
			stringValue(payloadField(promptSnapshot ?? {}, 'prompt_variant')) ||
			stringValue(payloadField(payload, 'snapshot_version')) ||
			stringValue(payloadField(promptSnapshot ?? {}, 'snapshot_version')) ||
			'unknown'
	);
</script>

{#if event.type === 'llm_call'}
	<div class="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs">
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Variant</div>
			<div class="font-semibold text-foreground">
				{promptVariant}
			</div>
		</div>
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Model</div>
			<div class="font-semibold text-foreground">
				{stringValue(payloadField(payload, 'model_used')) || '-'}
			</div>
		</div>
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Provider</div>
			<div class="font-semibold text-foreground">
				{stringValue(payloadField(payload, 'provider')) || '-'}
			</div>
		</div>
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Tokens</div>
			<div class="font-semibold text-foreground">
				{formatNumber(Number(payloadField(payload, 'total_tokens') || 0))}
			</div>
		</div>
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Cost</div>
			<div class="font-semibold text-foreground">
				{formatCurrency(Number(payloadField(payload, 'total_cost_usd') || 0))}
			</div>
		</div>
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Latency</div>
			<div class="font-semibold text-foreground">
				{formatDuration(payloadField(payload, 'response_time_ms'))}
			</div>
		</div>
	</div>

	{#if requestMessage || promptMessages.length > 0}
		<section
			class="mt-2 overflow-hidden rounded-lg border border-accent/30 bg-accent/5"
			aria-label="LLM input messages"
		>
			<div class="border-b border-accent/20 px-3 py-2">
				<div class="text-xs font-semibold text-foreground">Message sent into this turn</div>
				<div class="text-2xs text-foreground/60">
					The request supplied by the user or calling agent.
				</div>
			</div>
			{#if requestMessage}
				{#if requestMessage.length > 1_200}
					<details class="px-3 py-2 text-sm text-foreground">
						<summary class="cursor-pointer list-none space-y-2">
							<div
								class="line-clamp-6 whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
							>
								{truncateText(requestMessage, 900)}
							</div>
							<div class="text-2xs font-semibold uppercase tracking-wide text-accent">
								Expand complete request
							</div>
						</summary>
						<div class="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
							{requestMessage}
						</div>
					</details>
				{:else}
					<div
						class="whitespace-pre-wrap break-words px-3 py-2 text-sm text-foreground [overflow-wrap:anywhere]"
					>
						{requestMessage}
					</div>
				{/if}
			{:else}
				<div class="px-3 py-2 text-xs italic text-muted-foreground">
					The turn request was not recorded separately.
				</div>
			{/if}

			{#if promptMessages.length > 0}
				<details
					class="border-t border-accent/20 bg-background/70"
					ontoggle={(event) => {
						showFullPrompt = event.currentTarget.open;
					}}
				>
					<summary
						class="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-foreground"
					>
						View all captured prompt messages ({formatNumber(promptMessages.length)}
						{pluralize(promptMessages.length, 'message')})
					</summary>
					{#if showFullPrompt}
						<div class="space-y-2 border-t border-border px-3 py-2">
							<p class="text-2xs text-muted-foreground">
								This snapshot includes the system prompt, conversation history, and
								turn request captured at the start of the turn. Token totals can
								also include tool definitions and provider formatting. Later tool
								rounds can add messages that are not stored as separate snapshots.
							</p>
							{#each promptMessages as message (message)}
								<div class="overflow-hidden rounded border border-border bg-card">
									<div
										class="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/50 px-2.5 py-1.5"
									>
										<span
											class="text-2xs font-semibold uppercase tracking-wide text-foreground"
										>
											{message.roleLabel}
										</span>
										<span class="text-2xs text-muted-foreground">
											{formatNumber(message.characterCount)} chars
										</span>
									</div>
									<div
										class="max-h-96 overflow-y-auto whitespace-pre-wrap break-words px-2.5 py-2 text-xs text-foreground [overflow-wrap:anywhere]"
									>
										{message.content || '(empty content)'}
									</div>
									{#if message.extra}
										<details class="border-t border-border px-2.5 py-1.5">
											<summary
												class="cursor-pointer text-2xs font-medium text-muted-foreground"
											>
												Message metadata and tool calls
											</summary>
											<pre
												class="mt-1 whitespace-pre-wrap break-words overflow-x-auto text-2xs text-foreground">{prettyJson(
													message.extra
												)}</pre>
										</details>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</details>
			{/if}
		</section>
	{:else}
		<div
			class="mt-2 rounded border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
		>
			Prompt content was not captured for this historical call; only usage metadata is
			available.
		</div>
	{/if}
{/if}
