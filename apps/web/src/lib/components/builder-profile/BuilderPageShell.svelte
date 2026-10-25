<!-- apps/web/src/lib/components/builder-profile/BuilderPageShell.svelte -->
<!-- The bench a builder page or project page card sits on: the BuildOS bar on top and,
     for the owner, a bar only they see (Live or Draft, copy link, edit). -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Check, Copy, Pencil } from '$lib/icons/lucide';
	import { toastService } from '$lib/stores/toast.store';

	let {
		signedIn,
		owner = null,
		children
	}: {
		signedIn: boolean;
		/** Set when the owner is looking at their own page. */
		owner?: {
			status: 'draft' | 'published';
			copyUrl: string;
			editHref: string;
			editLabel?: string;
			/** One quiet line of numbers under the bar. */
			statsLine?: string | null;
		} | null;
		children: Snippet;
	} = $props();

	let copied = $state(false);

	async function copyLink() {
		if (!owner) return;
		try {
			await navigator.clipboard.writeText(owner.copyUrl);
			copied = true;
			setTimeout(() => (copied = false), 1800);
		} catch {
			toastService.error(`Copy this link: ${owner.copyUrl}`);
		}
	}
</script>

<div class="flex-1 bg-bench bench-grain">
	<div class="mx-auto w-full max-w-[46rem] px-3 pb-14 pt-3 sm:px-6 sm:pt-5">
		<nav class="mb-3 flex items-center justify-between gap-3" aria-label="BuildOS">
			<a
				href={signedIn ? '/projects' : '/'}
				class="inline-flex min-h-11 items-center gap-2 rounded-md px-1 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<img src="/brain-bolt-80.png" alt="" class="h-6 w-6" width="24" height="24" />
				BuildOS
			</a>
			{#if !signedIn}
				<a
					href="#claim"
					class="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-accent hover:bg-accent/10"
					>Make your own page</a
				>
			{/if}
		</nav>

		{#if owner}
			<div
				class="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl border border-border bg-background/80 px-3.5 py-2 text-sm shadow-ink"
			>
				<div class="flex min-w-0 items-center gap-2">
					<span
						class="h-2 w-2 shrink-0 rounded-full {owner.status === 'published'
							? 'bg-success'
							: 'bg-muted-foreground'}"
						aria-hidden="true"
					></span>
					<p class="min-w-0 text-foreground">
						<span class="font-semibold"
							>{owner.status === 'published' ? 'Live' : 'Draft'}</span
						>
						<span class="text-muted-foreground"
							>· {owner.status === 'published'
								? 'only you see this bar'
								: 'only you can see this page'}</span
						>
					</p>
				</div>
				<div class="flex items-center gap-1">
					<button
						type="button"
						onclick={copyLink}
						class="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-foreground hover:bg-muted"
					>
						{#if copied}<Check
								class="h-3.5 w-3.5"
								aria-hidden="true"
							/>Copied{:else}<Copy class="h-3.5 w-3.5" aria-hidden="true" />Copy link{/if}
					</button>
					<a
						href={owner.editHref}
						class="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-accent hover:bg-accent/10"
						><Pencil class="h-3.5 w-3.5" aria-hidden="true" />{owner.editLabel ??
							'Edit'}</a
					>
				</div>
				{#if owner.statsLine}
					<p class="stamp w-full text-xs text-muted-foreground">{owner.statsLine}</p>
				{/if}
			</div>
		{/if}

		{@render children()}
	</div>
</div>
