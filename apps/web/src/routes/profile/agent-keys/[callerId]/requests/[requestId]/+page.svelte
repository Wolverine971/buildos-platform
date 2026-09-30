<!-- apps/web/src/routes/profile/agent-keys/[callerId]/requests/[requestId]/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import UnifiedDiffView from '$lib/components/ui/UnifiedDiffView.svelte';
	import { createDocumentFieldDiff } from '$lib/utils/document-diff';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let request = $derived(data.request);
	let fields = $derived(Object.keys(request.mutation ?? {}));
	let busy = $state(false);
	const display = (value: unknown) => (value == null ? '' : String(value));
	let diffs = $derived(
		fields.map((field) =>
			createDocumentFieldDiff(
				field,
				field === 'content' ? 'Document body' : field,
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
	<a class="text-sm underline" href={`/profile/agent-keys/${request.caller_id}/requests`}
		>← Connection requests</a
	>
	<header class="space-y-2">
		<p class="text-xs uppercase tracking-widest text-muted-foreground">
			Permission request · {request.status}
		</p>
		<h1 class="text-2xl font-semibold">Review an edit in {data.projectName}</h1>
		<p>
			<strong>{data.caller?.caller_key ?? 'Your connection'}</strong> ({data.caller
				?.provider ?? 'agent'}) requests this change.
		</p>
		<p class="text-sm text-muted-foreground">
			Connection names are provided at registration. Chats sharing this connection share
			ongoing permissions.
		</p>
	</header>
	{#if request.reason}<section class="rounded-lg border border-border bg-card p-4">
			<h2 class="font-medium">Reason provided by the agent</h2>
			<p class="mt-2 whitespace-pre-wrap">{request.reason}</p>
		</section>{/if}
	<UnifiedDiffView fields={diffs} />

	<section class="space-y-3 rounded-lg border border-border bg-muted/30 p-5">
		<h2 class="font-semibold">Ongoing access you can grant</h2>
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
			<strong>{data.projectName}</strong>, including future eligible records.
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
					class="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
					>Apply once</button
				>
				<button
					disabled={busy}
					name="decision"
					value="always"
					class="rounded-md border border-border bg-card px-4 py-2 disabled:opacity-50"
					>Apply and always allow in this project</button
				>
				<button
					disabled={busy}
					name="decision"
					value="deny"
					class="rounded-md px-4 py-2 text-muted-foreground disabled:opacity-50"
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
				This request is {request.status}. No approval can be applied from this page.
			</p>{/if}
		{#if form && 'error' in form}<p role="alert" class="text-destructive">{form.error}</p>{/if}
	</section>
</main>
