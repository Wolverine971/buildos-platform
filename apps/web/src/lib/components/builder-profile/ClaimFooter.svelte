<!-- apps/web/src/lib/components/builder-profile/ClaimFooter.svelte -->
<!-- The foot of a builder page or project page card: "Made in BuildOS", and for
     signed-out visitors a box to claim their own build-os.com/@handle. -->
<script lang="ts">
	let {
		signedIn,
		isOwner = false,
		inEditor = false,
		followNote = false
	}: {
		signedIn: boolean;
		isOwner?: boolean;
		inEditor?: boolean;
		/** Adds "follow along in your daily brief" when there's something to follow. */
		followNote?: boolean;
	} = $props();

	let claimHandle = $state('');

	function claim(event: SubmitEvent) {
		event.preventDefault();
		if (inEditor) return;
		if (signedIn) {
			window.location.href = '/profile/page';
			return;
		}
		const wanted = claimHandle.trim().replace(/^@+/, '').toLowerCase();
		window.location.href = wanted
			? `/auth/register?handle=${encodeURIComponent(wanted)}`
			: '/auth/register';
	}
</script>

<footer
	id="claim"
	class="border-t border-border bg-muted/40 px-5 py-4 sm:px-8"
	aria-label="Make your own page"
>
	<div class="flex flex-wrap items-center justify-between gap-3">
		<p class="inline-flex items-center gap-2 text-sm text-muted-foreground">
			<img src="/brain-bolt-80.png" alt="" class="h-5 w-5" width="20" height="20" />
			<span
				>Made in <span class="font-semibold text-foreground">BuildOS</span>{followNote
					? ' · follow along in your daily brief'
					: ''}</span
			>
		</p>
		{#if signedIn && !inEditor}
			{#if !isOwner}
				<a
					href="/profile/page"
					class="text-sm font-semibold text-accent underline-offset-2 hover:underline"
					>Make your own page</a
				>
			{/if}
		{:else}
			<form class="flex w-full flex-wrap gap-2 sm:w-auto" onsubmit={claim} inert={inEditor}>
				<label for="claim-handle" class="sr-only">Pick your handle</label>
				<div
					class="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-md border border-border-strong bg-background focus-within:border-accent focus-within:ring-1 focus-within:ring-accent sm:w-64 sm:flex-none"
				>
					<span
						class="inline-flex items-center border-r border-border bg-muted/50 px-2.5 font-mono text-xs text-muted-foreground"
						>build-os.com/@</span
					>
					<input
						id="claim-handle"
						bind:value={claimHandle}
						placeholder="you"
						maxlength="24"
						autocomplete="off"
						autocapitalize="off"
						spellcheck="false"
						class="min-h-10 min-w-0 flex-1 bg-transparent px-2.5 font-mono text-base focus:outline-none sm:text-sm"
					/>
				</div>
				<button
					type="submit"
					class="tx-button tx-button-accent inline-flex min-h-10 items-center justify-center rounded-md px-3.5 text-sm font-semibold"
					>Claim it</button
				>
			</form>
		{/if}
	</div>
</footer>
