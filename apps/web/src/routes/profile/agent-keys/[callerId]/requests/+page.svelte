<!-- apps/web/src/routes/profile/agent-keys/[callerId]/requests/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Connection permissions · BuildOS</title></svelte:head>
<main class="mx-auto max-w-3xl space-y-6 px-4 py-8 text-foreground">
	<a class="text-sm underline" href={`/profile/agent-keys/${data.caller.id}`}>← Connection</a>
	<h1 class="text-2xl font-semibold">Requests and ongoing permissions</h1>
	<p>{data.caller.caller_key} · {data.caller.provider}</p>
	{#if !data.enabled}<p class="rounded-lg border border-border p-4">
			Permission requests are disabled on this deployment.
		</p>{/if}
	<section class="space-y-3 rounded-lg border border-border bg-card p-5">
		<h2 class="font-semibold">Connection controls</h2>
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
				class="rounded-md border border-border px-3 py-2"
				>{data.caller.permission_requests_enabled
					? 'Disable requests'
					: 'Enable requests'}</button
			>
			<button
				name="action"
				value="read_only"
				class="rounded-md border border-border px-3 py-2">Make connection read-only</button
			>
		</form>
		{#if form && 'error' in form}<p role="alert" class="text-destructive">{form.error}</p>{/if}
	</section>
	<section class="space-y-3">
		<h2 class="font-semibold">Ongoing permissions</h2>
		<p class="text-sm text-muted-foreground">
			These permissions are additional to the connection's base access. Removing one does not
			remove independently granted base write access.
		</p>
		{#each data.grants as grant (grant.id)}
			<form
				method="POST"
				use:enhance
				class="flex items-center justify-between gap-3 rounded-lg border border-border p-4"
			>
				<span
					>{grant.capability} ·
					<a class="underline" href={`/projects/${grant.project_id}`}>Project</a></span
				>
				<input type="hidden" name="grant_id" value={grant.id} /><button
					name="action"
					value="revoke_rule"
					class="underline">Remove</button
				>
			</form>
		{:else}<p class="text-sm text-muted-foreground">No active ongoing permissions.</p>{/each}
	</section>
	<section class="space-y-3">
		<h2 class="font-semibold">Recent requests</h2>
		{#each data.requests as request (request.id)}
			<a
				class="flex justify-between gap-3 rounded-lg border border-border bg-card p-4"
				href={`/profile/agent-keys/${data.caller.id}/requests/${request.id}`}
				><span
					>{request.capability}<small class="block text-muted-foreground"
						>{new Date(request.created_at).toLocaleString()}</small
					></span
				><span>{request.status}</span></a
			>
		{:else}<p>No requests yet.</p>{/each}
		{#if data.requests.length === 30}<a
				class="underline"
				href={`?before=${encodeURIComponent(data.requests[data.requests.length - 1].created_at)}&before_id=${data.requests[data.requests.length - 1].id}`}
				>Older requests</a
			>{/if}
	</section>
</main>
