<!-- apps/web/src/lib/components/ui/ErrorBoundary.svelte -->
<!--
	Keeps one broken piece (a chat message, an embed, a brief card) from taking down the
	page. When its children throw while rendering or in an effect, it shows a quiet
	"This part didn't load" card with Try again and reports the error.

	Browser-only on purpose: during server rendering an error still reaches SvelteKit's
	+error page and server-side handleError logging, exactly as before. Boundaries do not
	catch errors thrown in event handlers, timers or other async callbacks.

	`resetKey`: when it changes while the fallback is showing, the children get another
	try (the root layout passes the URL so navigating away from a broken page recovers).
-->
<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { browser } from '$app/environment';
	import { TriangleAlert } from '$lib/icons/lucide';
	import { reportClientError } from '$lib/utils/client-error-reporting';

	interface Props {
		/** Short id for error reports, e.g. 'chat-message' or 'daily-brief'. */
		area: string;
		/** Extra non-sensitive report context: ids and kinds, never user content. */
		context?: Record<string, unknown>;
		/** `inline` sits in place of the broken piece; `page` is roomier, for a whole page. */
		variant?: 'inline' | 'page';
		/** When this changes while the fallback shows, render the children again. */
		resetKey?: unknown;
		class?: string;
		children: Snippet;
	}

	let {
		area,
		context,
		variant = 'inline',
		resetKey,
		class: className = '',
		children
	}: Props = $props();

	/** Svelte's reset for the current failure; each reset works once. */
	let pendingReset: (() => void) | null = null;

	function retry() {
		const reset = pendingReset;
		pendingReset = null;
		reset?.();
	}

	$effect(() => {
		void resetKey;
		untrack(retry);
	});

	function handleError(error: unknown, reset: () => void) {
		pendingReset = reset;
		console.error(`[ErrorBoundary:${area}]`, error);
		void reportClientError({
			kind: 'runtime',
			error,
			metadata: { source: 'svelte:boundary', boundary: area, ...context }
		});
	}
</script>

{#snippet fallback()}
	<div
		role="status"
		data-error-boundary={area}
		class={[
			'tx tx-static tx-weak wt-paper flex items-center gap-3 bg-card text-foreground',
			variant === 'page' ? 'mx-auto my-10 max-w-md px-5 py-4' : 'px-3 py-2.5',
			className
		]}
	>
		<TriangleAlert class="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
		<p class="min-w-0 flex-1 text-sm">
			{variant === 'page' ? "This page didn't load." : "This part didn't load."}
		</p>
		<button
			type="button"
			onclick={retry}
			class="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-accent hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			Try again
		</button>
	</div>
{/snippet}

<svelte:boundary failed={browser ? fallback : undefined} onerror={handleError}>
	{@render children()}
</svelte:boundary>
