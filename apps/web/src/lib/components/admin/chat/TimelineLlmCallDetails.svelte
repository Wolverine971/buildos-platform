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
	import {
		payloadField,
		recordFromUnknown,
		stringValue
	} from '$lib/services/admin/chat-session-audit-payload';
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
	let metadata = $derived(recordFromUnknown(payload.metadata) ?? {});
	let localDump = $derived(recordFromUnknown(metadata.localPromptDump));
	let identifiers = $derived(
		[
			['Pass', stringValue(metadata.passRole).replace(/_/g, ' ')],
			['Logical round', metadata.logicalProviderRound],
			['Attempt', metadata.providerAttempt],
			['Route', metadata.routeId],
			['OpenRouter request ID', payload.openrouter_request_id],
			['Usage log ID', payload.id || event.id.replace(/^llm:/, '')],
			['Turn run ID', payload.turn_run_id || group.run?.id]
		].filter(([, value]) => value !== undefined && value !== null && value !== '')
	);
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

	<dl
		class="mt-2 grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2"
		aria-label="LLM call correlation"
	>
		{#each identifiers as [label, value] (label)}
			<div class="rounded border border-border bg-card px-2 py-1.5">
				<dt class="font-medium text-foreground/60">{label}</dt>
				<dd class="mt-0.5 break-all font-mono text-foreground select-all">
					{stringValue(value)}
				</dd>
			</div>
		{/each}
	</dl>
	{#if localDump?.markdownFile}
		<div class="mt-2 rounded border border-accent/30 bg-accent/5 px-3 py-2 text-xs">
			<div class="font-semibold">Exact request dump · worker development files</div>
			<p class="mt-1 break-all font-mono select-all">
				apps/worker/.prompt-dumps/{stringValue(localDump.markdownFile)}
			</p>
			<p class="mt-1 text-muted-foreground">
				Open this file on the machine running the worker for this pass's messages, tools,
				response events, and outcome. Local files expire after 48 hours.
			</p>
		</div>
	{/if}

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
			{#if promptMessages.length === 0}
				<p class="border-b border-accent/20 px-3 py-2 text-xs text-muted-foreground">
					Initial prompt snapshot unavailable for this turn. The request below is the
					user's message; it does not show the model's full context.
				</p>
			{/if}
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
								This initial snapshot includes the system prompt, conversation
								history, and turn request captured at the start of the turn. Token
								totals can also include tool definitions and provider formatting.
								Later tool rounds and review passes use different context. For the
								exact request for this call, use its worker development dump when
								available.
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
