<!-- apps/web/src/routes/profile/agent-keys/[callerId]/requests/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeft, ChevronRight } from '$lib/icons/lucide';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();

	// Display-only labels for structured keys.
	const CAPABILITY_LABELS: Record<string, string> = {
		'document.edit.v1': 'Edit documents',
		'task.edit.v1': 'Edit tasks'
	};
	const STATUS_LABELS: Record<string, string> = { stale: 'Out of date' };

	function humanizeKey(value: string | null | undefined): string {
		if (!value) return '';
		const text = value.replace(/[_.-]+/g, ' ').trim();
		return text ? text.charAt(0).toUpperCase() + text.slice(1) : value;
	}
	const capabilityLabel = (value: string) => CAPABILITY_LABELS[value] ?? humanizeKey(value);
	const statusLabel = (value: string) => STATUS_LABELS[value] ?? humanizeKey(value);

	let connectionName = $derived.by(() => {
		const name = (data.caller.metadata as Record<string, unknown> | null)?.installation_name;
		return typeof name === 'string' && name.trim() ? name.trim() : data.caller.caller_key;
	});
</script>

<svelte:head><title>Connection permissions · BuildOS</title></svelte:head>
<main class="mx-auto max-w-3xl space-y-6 px-4 py-8 text-foreground">
	<a
		class="inline-flex min-h-[44px] items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
		href={`/profile/agent-keys/${data.caller.id}`}
	>
		<ArrowLeft class="h-4 w-4" aria-hidden="true" />
		Connection
	</a>
	<header class="space-y-1">
		<h1 class="text-xl font-medium sm:text-2xl">Requests and ongoing permissions</h1>
		<p class="text-sm text-muted-foreground">
			{connectionName} · {humanizeKey(data.caller.provider)}
		</p>
	</header>
	{#if !data.enabled}<p class="rounded-xl border border-border p-4 text-sm text-muted-foreground">
			Permission requests are turned off on this deployment.
		</p>{/if}
	<section class="space-y-3 rounded-xl border border-border bg-card p-6">
		<h2 class="font-medium">Connection controls</h2>
		<p class="text-sm text-muted-foreground">
			Disabling requests cancels pending requests. Existing ongoing and base permissions
			remain. Making the connection read-only also removes ongoing write permissions.
		</p>
		<form method="POST" use:enhance class="flex flex-wrap gap-3">
			<button
				name="action"
				value={data.caller.permission_requests_enabled
					? 'disable_requests'
					: 'enable_requests'}
				class="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50"
				>{data.caller.permission_requests_enabled
					? 'Disable requests'
					: 'Enable requests'}</button
			>
			<button
				name="action"
				value="read_only"
				class="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50"
				>Make connection read-only</button
			>
		</form>
		{#if form && 'error' in form}<p role="alert" class="text-sm text-destructive">
				{form.error}
			</p>{/if}
	</section>
	<section class="space-y-3">
		<h2 class="font-medium">Ongoing permissions</h2>
		<p class="text-sm text-muted-foreground">
			These permissions are additional to the connection's base access. Removing one does not
			remove independently granted base write access.
		</p>
		{#each data.grants as grant (grant.id)}
			<form
				method="POST"
				use:enhance
				class="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
			>
				<span class="text-sm"
					>{capabilityLabel(grant.capability)} ·
					<a
						class="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
						href={`/projects/${grant.project_id}`}>Project</a
					></span
				>
				<input type="hidden" name="grant_id" value={grant.id} /><button
					name="action"
					value="revoke_rule"
					class="rounded-lg px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
					>Remove</button
				>
			</form>
		{:else}<p class="text-sm text-muted-foreground">No ongoing permissions</p>{/each}
	</section>
	<section class="space-y-3">
		<h2 class="font-medium">Recent requests</h2>
		{#each data.requests as request (request.id)}
			<a
				class="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
				href={`/profile/agent-keys/${data.caller.id}/requests/${request.id}`}
				><span class="min-w-0 text-sm"
					>{capabilityLabel(request.capability)}<small
						class="block text-xs text-muted-foreground"
						>{new Date(request.created_at).toLocaleString()}</small
					></span
				><span class="inline-flex shrink-0 items-center gap-3 text-xs text-muted-foreground"
					><span class="inline-flex items-center gap-1.5"
						><span
							class="h-1.5 w-1.5 rounded-full {request.status === 'pending'
								? 'bg-warning'
								: 'bg-muted-foreground/50'}"
							aria-hidden="true"
						></span>{statusLabel(request.status)}</span
					><ChevronRight class="h-4 w-4" aria-hidden="true" /></span
				></a
			>
		{:else}<p class="text-sm text-muted-foreground">No requests yet</p>{/each}
		{#if data.requests.length === 30}<a
				class="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
				href={`?before=${encodeURIComponent(data.requests[data.requests.length - 1].created_at)}&before_id=${data.requests[data.requests.length - 1].id}`}
				>Older requests</a
			>{/if}
	</section>
</main>
