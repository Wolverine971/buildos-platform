<!-- apps/web/src/routes/profile/agent-keys/[callerId]/requests/[requestId]/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeft } from '$lib/icons/lucide';
	import UnifiedDiffView from '$lib/components/ui/UnifiedDiffView.svelte';
	import { createDocumentFieldDiff } from '$lib/utils/document-diff';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let request = $derived(data.request);
	let fields = $derived(Object.keys(request.mutation ?? {}));
	let busy = $state(false);
	const display = (value: unknown) => (value == null ? '' : String(value));
	// Display-only labels for structured keys.
	const STATUS_LABELS: Record<string, string> = { stale: 'Out of date' };
	function humanizeKey(value: string | null | undefined): string {
		if (!value) return '';
		const text = value.replace(/[_.-]+/g, ' ').trim();
		return text ? text.charAt(0).toUpperCase() + text.slice(1) : value;
	}
	const statusLabel = (value: string) => STATUS_LABELS[value] ?? humanizeKey(value);
	let connectionName = $derived.by(() => {
		const name = (data.caller?.metadata as Record<string, unknown> | null | undefined)
			?.installation_name;
		if (typeof name === 'string' && name.trim()) return name.trim();
		return data.caller?.caller_key ?? 'Your connection';
	});
	let diffs = $derived(
		fields.map((field) =>
			createDocumentFieldDiff(
				field,
				field === 'content' ? 'Document body' : humanizeKey(field),
				display(
					field === 'content'
						? (request.before_snapshot?.content ??
								(
									request.before_snapshot?.props as
										| Record<string, unknown>
										| undefined
								)?.body_markdown)
						: request.before_snapshot?.[field]
				),
				display(request.mutation?.[field])
			)
		)
	);
</script>

<svelte:head><title>Review connection edit · BuildOS</title></svelte:head>
<main class="mx-auto max-w-5xl space-y-6 px-4 py-8 text-foreground">
	<a
		class="inline-flex min-h-[44px] items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
		href={`/profile/agent-keys/${request.caller_id}/requests`}
	>
		<ArrowLeft class="h-4 w-4" aria-hidden="true" />
		Connection requests
	</a>
	<header class="space-y-2">
		<p class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
			<span
				class="h-1.5 w-1.5 rounded-full {request.status === 'pending'
					? 'bg-warning'
					: 'bg-muted-foreground/50'}"
				aria-hidden="true"
			></span>
			Permission request · {statusLabel(request.status)}
		</p>
		<h1 class="text-xl font-medium sm:text-2xl">Review an edit in {data.projectName}</h1>
		<p>
			<span class="font-medium">{connectionName}</span> ({data.caller?.provider
				? humanizeKey(data.caller.provider)
				: 'agent'}) requests this change.
		</p>
		<p class="text-sm text-muted-foreground">
			Connection names are provided at registration. Chats sharing this connection share
			ongoing permissions.
		</p>
	</header>
	{#if request.reason}<section class="rounded-xl border border-border bg-card p-4">
			<h2 class="font-medium">Reason provided by the agent</h2>
			<p class="mt-2 whitespace-pre-wrap">{request.reason}</p>
		</section>{/if}
	<UnifiedDiffView fields={diffs} />

	<section class="space-y-3 rounded-xl border border-border bg-muted/30 p-6">
		<h2 class="font-medium">Ongoing access you can grant</h2>
		{#if request.capability === 'task.edit.v1' && request.mutation && 'state_key' in request.mutation}<p
				class="text-sm"
			>
				Completing a task records the time this change is applied. Reopening it clears its
				completion time.
			</p>{/if}
		<p>
			{request.capability === 'document.edit.v1'
				? 'Edit document titles, descriptions and body text'
				: 'Edit task titles, descriptions, workflow state and priority'} in
			<span class="font-medium">{data.projectName}</span>, including future eligible records.
		</p>
		<p class="text-sm text-muted-foreground">
			No archive, delete, moves, publishing, messages, calendar changes or model calls. You
			can remove this permission in connection settings.
		</p>
		{#if request.status === 'pending'}
			<p class="text-sm">
				Expires {new Date(request.expires_at).toLocaleString()}. If the record changes, this
				proposal must be reviewed again.
			</p>
			<form
				method="POST"
				use:enhance={() => {
					busy = true;
					return async ({ update }) => {
						try {
							await update();
						} finally {
							busy = false;
						}
					};
				}}
				class="flex flex-wrap gap-3"
			>
				<input type="hidden" name="digest" value={request.reviewed_digest} />
				<button
					disabled={busy}
					name="decision"
					value="once"
					class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
					>Apply once</button
				>
				<button
					disabled={busy}
					name="decision"
					value="always"
					class="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-muted/50 disabled:opacity-50"
					>Apply and always allow in this project</button
				>
				<button
					disabled={busy}
					name="decision"
					value="deny"
					class="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
					>Deny</button
				>
			</form>
		{:else if request.status === 'applied'}
			<p role="status">The reviewed change was applied.</p>
			{#if request.decision === 'always' && request.grant_id}<p>
					Ongoing permission is saved. The agent may need to reconnect with write scope
					before using it. Ask it to check authorization and refresh its tools.
				</p>{/if}
		{:else if request.status === 'stale'}<p>
				The record changed since this proposal was prepared. Ask the agent to submit a fresh
				proposal.
			</p>
		{:else}<p>
				This request is {statusLabel(request.status).toLowerCase()}. No approval can be
				applied from this page.
			</p>{/if}
		{#if form && 'error' in form}<p role="alert" class="text-sm text-destructive">
				{form.error}
			</p>{/if}
	</section>
</main>
