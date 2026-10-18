<!-- apps/web/src/routes/admin/model-incidents/[id]/+page.svelte -->
<script lang="ts">
	import type { PageData } from './$types';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import IncidentTimelineChart from '$lib/components/admin/model-incidents/IncidentTimelineChart.svelte';
	import {
		Check,
		CircleAlert,
		CircleCheck,
		Copy,
		Download,
		ExternalLink,
		Info,
		Timer,
		TriangleAlert
	} from '$lib/icons/lucide';
	import { seconds } from '$lib/services/admin/model-incidents/story';
	import type { IncidentFindingTone } from '$lib/services/admin/model-incidents/story';

	let { data }: { data: PageData } = $props();

	const incident = $derived(data.incident);
	const story = $derived(data.story);
	const exportHref = $derived(`/admin/model-incidents/${incident.id}/export`);

	let copyState = $state<'idle' | 'copying' | 'copied' | 'failed'>('idle');

	async function copyPacket() {
		copyState = 'copying';
		try {
			const response = await fetch(exportHref, { cache: 'no-store' });
			if (!response.ok) throw new Error(String(response.status));
			await navigator.clipboard.writeText(await response.text());
			copyState = 'copied';
		} catch {
			copyState = 'failed';
		}
		setTimeout(() => (copyState = 'idle'), 2_500);
	}

	const json = (value: unknown) => JSON.stringify(value, null, 2);
	const text = (value: unknown) =>
		value === null || value === undefined
			? ''
			: typeof value === 'string'
				? value
				: json(value);

	const toneStyles: Record<IncidentFindingTone, { icon: typeof Info; class: string }> = {
		danger: {
			icon: CircleAlert,
			class: 'border-destructive/30 bg-destructive/5 text-destructive'
		},
		warning: { icon: TriangleAlert, class: 'border-warning/40 bg-warning/10 text-foreground' },
		info: { icon: Info, class: 'border-info/30 bg-info/5 text-foreground' },
		success: { icon: CircleCheck, class: 'border-success/30 bg-success/5 text-foreground' }
	};

	const facts = $derived(
		[
			['Source', story.source],
			['Model asked', incident.modelRequested],
			['Answered by', incident.modelUsed],
			['Provider', incident.provider],
			['HTTP', incident.httpStatus === null ? 'no response' : String(incident.httpStatus)],
			['Attempt lasted', seconds(incident.durationMs)],
			[
				'Round · attempt',
				incident.round !== null || incident.attempt !== null
					? `${incident.round ?? '—'} · ${incident.attempt ?? '—'}`
					: null
			],
			['When', new Date(incident.createdAt).toLocaleString()],
			['Person', incident.userEmail]
		].filter((entry): entry is [string, string] => typeof entry[1] === 'string' && !!entry[1])
	);

	const ids = $derived(
		[
			['Incident', incident.id],
			['Lane', incident.lane],
			['Turn', incident.turnRunId],
			['Session', incident.sessionId],
			['Project', incident.projectId],
			['Usage log', incident.usageLogId],
			['Generation', incident.generationId],
			['Route', incident.routeId],
			['Request sha256', incident.requestSha256]
		].filter((entry): entry is [string, string] => !!entry[1])
	);

	const statRows = $derived.by(() => {
		const stats = incident.generationStats as Record<string, unknown> | null;
		if (!stats || 'lookup_failed' in stats) return [];
		const ms = (value: unknown) => (typeof value === 'number' ? seconds(value) : null);
		return [
			['Served by', stats.provider_name],
			['First token', ms(stats.latency)],
			['Generation time', ms(stats.generation_time)],
			['Output tokens', stats.tokens_completion ?? stats.native_tokens_completion],
			['Prompt tokens', stats.tokens_prompt ?? stats.native_tokens_prompt],
			['Reasoning tokens', stats.native_tokens_reasoning],
			['Finish', stats.native_finish_reason ?? stats.finish_reason],
			[
				'Cancelled upstream',
				typeof stats.cancelled === 'boolean' ? (stats.cancelled ? 'yes' : 'no') : null
			],
			[
				'Cost',
				typeof stats.total_cost === 'number' ? `$${stats.total_cost.toFixed(5)}` : null
			]
		].filter((entry) => entry[1] !== null && entry[1] !== undefined) as Array<
			[string, unknown]
		>;
	});

	const EVENT_LABELS: Record<string, string> = {
		request_sent: 'Request sent',
		response_opened: 'Response opened',
		first_byte: 'First bytes arrived',
		stall: 'Stall detected',
		attempt_aborted: 'We hung up',
		attempt_ended: 'Attempt ended',
		request_failed: 'Request failed',
		drain_started: 'Left running in the background',
		drain_skipped: 'Not left running',
		drain_ended: 'Finished in the background',
		stream_end: 'Stream ended',
		stream_error: 'Stream broke'
	};
	const eventDetail = (event: Record<string, unknown>) => {
		const { at_ms: _at, event: _name, ...rest } = event;
		return Object.keys(rest).length ? JSON.stringify(rest) : '';
	};
</script>

<svelte:head>
	<title>{story.headline} · Model Incidents</title>
</svelte:head>

<div class="space-y-6">
	<AdminPageHeader
		title={story.headline}
		description="{incident.kind === 'stall'
			? 'Stall'
			: 'Error'} · {story.source} · {incident.reason}"
		icon={Timer}
		backHref="/admin/model-incidents"
		backLabel="Model Incidents"
	>
		{#snippet actions()}
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					onclick={copyPacket}
					disabled={copyState === 'copying'}
					class="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium shadow-ink pressable hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
				>
					{#if copyState === 'copied'}
						<Check class="h-4 w-4 text-success" /> Copied
					{:else if copyState === 'failed'}
						<CircleAlert class="h-4 w-4 text-destructive" /> Copy failed
					{:else}
						<Copy class="h-4 w-4" /> Copy for Claude Code
					{/if}
				</button>
				<a
					href={exportHref}
					download
					class="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground shadow-ink pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<Download class="h-4 w-4" /> Export .md
				</a>
			</div>
		{/snippet}
	</AdminPageHeader>

	<!-- Facts -->
	<dl class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
		{#each facts as [label, value] (label)}
			<div class="rounded-lg border border-border bg-card px-3 py-2 shadow-ink">
				<dt class="micro-label">{label}</dt>
				<dd class="mt-0.5 truncate text-sm stamp" title={value}>{value}</dd>
			</div>
		{/each}
	</dl>

	<div class="grid gap-6 lg:grid-cols-5">
		<!-- What happened -->
		<section
			class="space-y-3 rounded-xl border border-border bg-card p-5 shadow-ink tx tx-frame tx-weak lg:col-span-3"
		>
			<p class="micro-label">What happened</p>
			{#each story.paragraphs as paragraph, index (index)}
				<p class="text-sm leading-relaxed text-foreground">{paragraph}</p>
			{/each}
		</section>

		<!-- What it points at -->
		<section class="space-y-3 lg:col-span-2">
			<p class="micro-label">What it points at</p>
			{#each story.findings as finding, index (index)}
				{@const tone = toneStyles[finding.tone]}
				<div class="flex gap-3 rounded-lg border p-3 text-sm {tone.class}">
					<tone.icon class="mt-0.5 h-4 w-4 shrink-0" />
					<p class="text-foreground">{finding.text}</p>
				</div>
			{:else}
				<p
					class="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground"
				>
					Nothing in the record points at a cause on its own. Compare the request below
					with similar calls that succeeded.
				</p>
			{/each}
			{#if incident.sessionId}
				<a
					href="/admin/chat/sessions?chat_session_id={incident.sessionId}"
					class="inline-flex items-center gap-1.5 text-sm text-accent underline-offset-4 hover:underline"
				>
					<ExternalLink class="h-3.5 w-3.5" /> Open the chat session
				</a>
			{/if}
		</section>
	</div>

	<!-- Timeline -->
	<section class="rounded-xl border border-border bg-card p-5 shadow-ink">
		<p class="micro-label mb-3">Timeline</p>
		{#if data.events.length || data.bytes.length}
			<IncidentTimelineChart
				bytes={data.bytes}
				events={data.events}
				streamed={data.streamed}
			/>
			<details class="mt-4">
				<summary class="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
					>Every event ({data.events.length})</summary
				>
				<table class="mt-2 w-full text-sm">
					<tbody class="divide-y divide-border">
						{#each data.events as event, index (index)}
							<tr>
								<td class="w-20 py-1.5 pr-3 align-top stamp text-muted-foreground"
									>{seconds(event.at_ms)}</td
								>
								<td class="py-1.5 pr-3 align-top"
									>{EVENT_LABELS[event.event] ?? event.event}</td
								>
								<td
									class="py-1.5 align-top text-xs text-muted-foreground stamp break-all"
									>{eventDetail(event)}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</details>
		{:else}
			<p class="text-sm text-muted-foreground">
				This job does not record a byte timeline; the timing is in the facts above.
			</p>
		{/if}
	</section>

	<div class="grid gap-6 lg:grid-cols-2">
		<!-- OpenRouter's record -->
		<section class="rounded-xl border border-border bg-card p-5 shadow-ink">
			<p class="micro-label mb-3">OpenRouter's record</p>
			{#if statRows.length}
				<dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
					{#each statRows as [label, value] (label)}
						<dt class="text-muted-foreground">{label}</dt>
						<dd class="stamp">{String(value)}</dd>
					{/each}
				</dl>
			{:else if incident.generationStats}
				<p class="text-sm text-muted-foreground">
					Could not be fetched ({String(
						(incident.generationStats as Record<string, unknown>).lookup_failed
					)}).
				</p>
			{:else}
				<p class="text-sm text-muted-foreground">
					Not fetched{data.streamed
						? ' (no generation id, or the lookup is still pending)'
						: ': background jobs read usage from the reply itself'}.
				</p>
			{/if}
			{#if incident.eventual}
				<p class="micro-label mb-2 mt-5">Left running</p>
				<pre class="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs stamp">{json(
						incident.eventual
					)}</pre>
			{/if}
		</section>

		<!-- What came back -->
		<section class="space-y-3 rounded-xl border border-border bg-card p-5 shadow-ink">
			<p class="micro-label">What came back</p>
			{#if data.reply.reasoning}
				<details>
					<summary class="cursor-pointer text-sm font-medium"
						>Reasoning ({data.reply.reasoning.length.toLocaleString()} chars)</summary
					>
					<pre
						class="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">{data
							.reply.reasoning}</pre>
				</details>
			{/if}
			{#if data.reply.content}
				<details open>
					<summary class="cursor-pointer text-sm font-medium"
						>Text ({data.reply.content.length.toLocaleString()} chars)</summary
					>
					<pre
						class="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">{data
							.reply.content}</pre>
				</details>
			{/if}
			{#each data.reply.toolCalls as call, index (index)}
				<details open>
					<summary class="cursor-pointer text-sm font-medium"
						>Tool call: {call.name || '(unnamed)'}</summary
					>
					<pre
						class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">{call.arguments}</pre>
				</details>
			{/each}
			{#if data.reply.errors.length}
				<pre
					class="max-h-64 overflow-auto rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">{json(
						data.reply.errors
					)}</pre>
			{/if}
			{#if data.reply.raw}
				<pre
					class="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">{data
						.reply.raw}</pre>
			{/if}
			{#if !data.reply.hasBody}
				<p class="text-sm text-muted-foreground">
					{(incident.outcome as Record<string, Record<string, unknown>>)
						?.request_projection?.reply_withheld
						? 'Not stored: the request carried email, calendar or web content.'
						: 'No response bytes were received.'}
				</p>
			{/if}
			{#if incident.responseTruncated}
				<p class="text-xs text-muted-foreground">
					The stored response is cut at the capture limit.
				</p>
			{/if}
			<details>
				<summary class="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
					>Response headers</summary
				>
				<pre
					class="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs stamp">{json(
						incident.responseHeaders
					)}</pre>
			</details>
		</section>
	</div>

	<!-- What we sent -->
	<section class="space-y-3 rounded-xl border border-border bg-card p-5 shadow-ink">
		<p class="micro-label">What we sent</p>
		{#if data.request.raw}
			<pre
				class="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">{data
					.request.raw}</pre>
		{:else if data.request.messages.length}
			<div class="grid gap-4 lg:grid-cols-2">
				<div>
					<p class="mb-1 text-sm font-medium">Settings</p>
					<pre class="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs stamp">{json(
							data.request.settings
						)}</pre>
				</div>
				<div>
					<p class="mb-1 text-sm font-medium">Headers</p>
					<pre class="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs stamp">{json(
							incident.requestHeaders
						)}</pre>
				</div>
			</div>
			<p class="text-sm font-medium">Messages ({data.request.messages.length})</p>
			<ol class="space-y-2">
				{#each data.request.messages as message, index (index)}
					{@const content = text(message.content)}
					<li>
						<details open={index === data.request.messages.length - 1}>
							<summary class="cursor-pointer text-sm">
								<span class="stamp text-muted-foreground">{index + 1}.</span>
								<span class="font-medium">{String(message.role)}</span>
								<span class="text-muted-foreground"
									>· {content
										? `${content.length.toLocaleString()} chars`
										: 'no text'}{message.tool_calls ? ' · tool call' : ''}</span
								>
							</summary>
							{#if content}
								<pre
									class="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-xs">{content}</pre>
							{/if}
							{#if message.tool_calls || message.tool_call_id}
								<pre
									class="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs stamp">{json(
										{
											tool_call_id: message.tool_call_id,
											tool_calls: message.tool_calls
										}
									)}</pre>
							{/if}
						</details>
					</li>
				{/each}
			</ol>
			{#if data.request.tools.length}
				<details>
					<summary class="cursor-pointer text-sm font-medium"
						>Tools offered ({data.request.tools.length})</summary
					>
					<p class="mt-2 text-xs text-muted-foreground stamp">
						{data.request.tools
							.map((tool) =>
								String(
									(tool.function as Record<string, unknown> | undefined)?.name ??
										'?'
								)
							)
							.join(', ')}
					</p>
				</details>
			{/if}
		{:else}
			<p class="text-sm text-muted-foreground">
				Not stored for this job: its prompts can carry email, calendar or web content, so
				only timing and metadata were kept.
			</p>
		{/if}
	</section>

	<!-- Same turn + ids -->
	<div class="grid gap-6 lg:grid-cols-2">
		{#if data.siblings.length}
			<section class="rounded-xl border border-border bg-card p-5 shadow-ink">
				<p class="micro-label mb-3">Other incidents in this turn</p>
				<ul class="divide-y divide-border text-sm">
					{#each data.siblings as sibling (sibling.id)}
						<li>
							<a
								href="/admin/model-incidents/{sibling.id}"
								class="flex justify-between gap-3 py-2 hover:text-accent"
							>
								<span class="min-w-0 truncate">{sibling.headline}</span>
								<span class="shrink-0 text-xs text-muted-foreground stamp"
									>{sibling.passRole ?? ''} #{sibling.attempt ?? '—'} · {seconds(
										sibling.durationMs
									)}</span
								>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
		<section class="rounded-xl border border-border bg-card p-5 shadow-ink">
			<p class="micro-label mb-3">Ids</p>
			<dl class="space-y-1.5 text-xs">
				{#each ids as [label, value] (label)}
					<div class="flex gap-3">
						<dt class="w-28 shrink-0 text-muted-foreground">{label}</dt>
						<dd class="min-w-0 break-all stamp">{value}</dd>
					</div>
				{/each}
			</dl>
		</section>
	</div>
</div>
