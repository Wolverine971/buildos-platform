<!-- apps/web/src/routes/(public)/share/[token]/+page.svelte -->
<script lang="ts">
	import SEOHead from '$lib/components/SEOHead.svelte';
	import SharedChatTranscript from '$lib/components/agent/SharedChatTranscript.svelte';
	import { captureEvent } from '$lib/services/posthog';
	import type { SharedChatSnapshotV1 } from '$lib/types/chat-share';
	import { ArrowUpRight } from '$lib/icons/lucide';

	let {
		data
	}: {
		data: {
			share: {
				id: string;
				/** Non-reversible analytics handle; the token never goes to analytics. */
				ref: string;
				title: string;
				snapshot: SharedChatSnapshotV1;
				showAuthor: boolean;
				authorName: string | null;
				updatedAt: string;
				createdAt: string;
			};
			viewerSignedIn: boolean;
		};
	} = $props();
	const share = $derived(data.share);
	const author = $derived(share.showAuthor ? share.authorName : null);
	const description = $derived(author ? `A BuildOS chat shared by ${author}` : 'A BuildOS chat');
	const canonical = $derived(`https://build-os.com/share/${encodeURIComponent(share.id)}`);
	const date = $derived(
		new Date(share.updatedAt).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		})
	);
	const signupHref = '/signup?utm_source=shared-chat&utm_medium=share&utm_campaign=chat-share';
	let lastViewed: string | null = null;

	$effect(() => {
		const token = share.id;
		const ref = share.ref;
		const signedIn = data.viewerSignedIn;
		if (token === lastViewed) return;
		lastViewed = token;
		if (navigator.doNotTrack === '1') return;
		captureEvent('shared_chat_viewed', { share_id: ref, viewer_signed_in: signedIn });
		void fetch(`/api/share/${encodeURIComponent(token)}/view`, {
			method: 'POST',
			credentials: 'same-origin',
			keepalive: true
		}).catch(() => {});
	});
</script>

<SEOHead title={share.title} {description} {canonical} author={author ?? 'BuildOS'} noindex />

<div class="min-h-screen bg-background px-4 py-8 sm:px-6 sm:py-12">
	<div class="mx-auto max-w-3xl">
		<header class="mb-8 border-b border-border pb-6 sm:mb-10 sm:pb-8">
			<p class="mb-4 micro-label text-muted-foreground">Shared conversation · Read only</p>
			<h1 class="text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
				{share.title}
			</h1>
			<p class="mt-3 text-sm text-muted-foreground">
				{#if author}Shared by {author} ·
				{/if}<time datetime={share.updatedAt}>{date}</time>
			</p>
		</header>
		<SharedChatTranscript snapshot={share.snapshot} />
		<footer class="mt-10 border-t border-border pb-6 pt-7 sm:mt-14 sm:pt-9">
			<p class="micro-label text-muted-foreground">Made with BuildOS</p>
			<div
				class="mt-4 flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center"
			>
				<p
					class="max-w-md text-xl font-semibold leading-snug tracking-tight text-foreground sm:text-2xl"
				>
					Turn messy thinking into structured work.
				</p>
				<a
					href={signupHref}
					onclick={() => captureEvent('shared_chat_cta_clicked', { share_id: share.ref })}
					class="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground shadow-ink transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>Try BuildOS <ArrowUpRight class="h-4 w-4" /></a
				>
			</div>
		</footer>
	</div>
</div>
