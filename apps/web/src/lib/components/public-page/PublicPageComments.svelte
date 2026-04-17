<!-- apps/web/src/lib/components/public-page/PublicPageComments.svelte -->
<!--
	Minimal comments surface for a public page. Reuses the existing
	onto_comments API (the access check has been extended to allow anonymous
	reads + authenticated writes on documents with a live public page).

	- Anonymous viewers: see threaded comments, see a "Sign in to comment" CTA.
	- Authenticated viewers: see a composer and can reply inline.
	- Document author (page owner): see a delete button on every comment, not
	  just their own.

	Threading is one-level-deep visually; deeper replies flatten into the
	parent thread to keep the reading experience simple on mobile.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { MessageSquare, Send, Trash2 } from 'lucide-svelte';
	import { toastService } from '$lib/stores/toast.store';

	interface CommentAuthor {
		id: string;
		name: string | null;
		user_id: string | null;
		kind: string | null;
	}

	interface Comment {
		id: string;
		project_id: string;
		entity_type: string;
		entity_id: string;
		parent_id: string | null;
		root_id: string;
		body: string;
		body_format: string | null;
		created_by: string;
		created_at: string;
		updated_at: string;
		edited_at: string | null;
		deleted_at: string | null;
		author: CommentAuthor | null;
	}

	interface Props {
		projectId: string;
		documentId: string;
		isAuthor: boolean;
		currentUser: { id: string; email?: string | null } | null;
		signInHref: string;
	}

	let { projectId, documentId, isAuthor, currentUser, signInHref }: Props = $props();

	let comments = $state<Comment[]>([]);
	let actorId = $state<string | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let composerBody = $state('');
	let composerReplyTo = $state<Comment | null>(null);
	let submitting = $state(false);

	const rootComments = $derived(comments.filter((c) => c.parent_id === null));
	function repliesFor(rootId: string): Comment[] {
		return comments.filter((c) => c.root_id === rootId && c.id !== rootId);
	}

	async function fetchComments() {
		loading = true;
		error = null;
		try {
			const params = new URLSearchParams({
				project_id: projectId,
				entity_type: 'document',
				entity_id: documentId,
				limit: '200'
			});
			const res = await fetch(`/api/onto/comments?${params.toString()}`);
			const payload = await res.json().catch(() => null);
			if (!res.ok) {
				throw new Error(payload?.error || 'Failed to load comments');
			}
			comments = Array.isArray(payload?.data?.comments) ? payload.data.comments : [];
			actorId = typeof payload?.data?.actorId === 'string' ? payload.data.actorId : null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load comments';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void fetchComments();
	});

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!currentUser) return;
		const body = composerBody.trim();
		if (!body) return;
		submitting = true;
		try {
			const res = await fetch('/api/onto/comments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project_id: projectId,
					entity_type: 'document',
					entity_id: documentId,
					parent_id: composerReplyTo?.id ?? null,
					body
				})
			});
			const payload = await res.json().catch(() => null);
			if (!res.ok) {
				throw new Error(payload?.error || 'Failed to post comment');
			}
			composerBody = '';
			composerReplyTo = null;
			await fetchComments();
		} catch (err) {
			toastService.error(err instanceof Error ? err.message : 'Failed to post comment');
		} finally {
			submitting = false;
		}
	}

	async function handleDelete(comment: Comment) {
		const ok = typeof window !== 'undefined' ? window.confirm('Delete this comment?') : true;
		if (!ok) return;
		try {
			const res = await fetch(`/api/onto/comments/${comment.id}`, { method: 'DELETE' });
			const payload = await res.json().catch(() => null);
			if (!res.ok) {
				throw new Error(payload?.error || 'Failed to delete comment');
			}
			await fetchComments();
		} catch (err) {
			toastService.error(err instanceof Error ? err.message : 'Failed to delete comment');
		}
	}

	function canDelete(comment: Comment): boolean {
		if (!currentUser) return false;
		if (isAuthor) return true;
		if (actorId && comment.created_by === actorId) return true;
		return false;
	}

	function formatCommentDate(iso: string): string {
		const d = new Date(iso);
		const diffMs = Date.now() - d.getTime();
		const diffMin = Math.floor(diffMs / 60000);
		if (diffMin < 1) return 'just now';
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffH = Math.floor(diffMin / 60);
		if (diffH < 24) return `${diffH}h ago`;
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function authorInitials(author: CommentAuthor | null): string {
		const name = author?.name || '?';
		return name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((p) => p[0]?.toUpperCase() ?? '')
			.join('');
	}
</script>

<section id="comments" class="mt-10 border-t border-border pt-6" aria-labelledby="comments-heading">
	<div class="mb-4 flex items-center gap-2">
		<MessageSquare class="w-4 h-4 text-muted-foreground" />
		<h2 id="comments-heading" class="text-sm font-semibold text-foreground">
			Comments {#if !loading && comments.length > 0}
				<span class="ml-1 text-muted-foreground font-normal">({rootComments.length})</span>
			{/if}
		</h2>
	</div>

	{#if loading}
		<p class="text-[12px] text-muted-foreground">Loading…</p>
	{:else if error}
		<div class="text-[12px] text-destructive">
			{error}
			<button type="button" class="ml-2 underline underline-offset-2" onclick={fetchComments}>
				Retry
			</button>
		</div>
	{:else}
		{#if rootComments.length === 0}
			<p class="text-[12px] text-muted-foreground italic">
				No comments yet. {currentUser
					? 'Be the first to share feedback.'
					: 'Sign in to be the first to share feedback.'}
			</p>
		{/if}

		<ul class="space-y-4">
			{#each rootComments as root (root.id)}
				<li>
					<article class="flex gap-2.5">
						<span
							aria-hidden="true"
							class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent text-[10px] font-bold shrink-0 mt-0.5"
						>
							{authorInitials(root.author)}
						</span>
						<div class="min-w-0 flex-1">
							<div
								class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px]"
							>
								<span class="font-semibold text-foreground">
									{root.author?.name || 'Someone'}
								</span>
								<span class="text-muted-foreground">·</span>
								<span class="text-muted-foreground">
									{formatCommentDate(root.created_at)}
								</span>
								{#if root.edited_at}
									<span class="text-muted-foreground">(edited)</span>
								{/if}
							</div>
							<p
								class="mt-0.5 text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words"
							>
								{root.body}
							</p>
							<div class="mt-1.5 flex items-center gap-3 text-[11px]">
								{#if currentUser}
									<button
										type="button"
										onclick={() => (composerReplyTo = root)}
										class="text-muted-foreground hover:text-foreground transition-colors"
									>
										Reply
									</button>
								{/if}
								{#if canDelete(root)}
									<button
										type="button"
										onclick={() => handleDelete(root)}
										class="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive transition-colors"
									>
										<Trash2 class="w-3 h-3" />
										Delete
									</button>
								{/if}
							</div>

							{#each repliesFor(root.id) as reply (reply.id)}
								<article class="mt-3 flex gap-2.5 pl-3 border-l border-border">
									<span
										aria-hidden="true"
										class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-accent text-[9px] font-bold shrink-0 mt-0.5"
									>
										{authorInitials(reply.author)}
									</span>
									<div class="min-w-0 flex-1">
										<div
											class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]"
										>
											<span class="font-semibold text-foreground">
												{reply.author?.name || 'Someone'}
											</span>
											<span class="text-muted-foreground">·</span>
											<span class="text-muted-foreground">
												{formatCommentDate(reply.created_at)}
											</span>
										</div>
										<p
											class="mt-0.5 text-[13px] leading-relaxed text-foreground whitespace-pre-wrap break-words"
										>
											{reply.body}
										</p>
										{#if canDelete(reply)}
											<button
												type="button"
												onclick={() => handleDelete(reply)}
												class="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition-colors"
											>
												<Trash2 class="w-3 h-3" />
												Delete
											</button>
										{/if}
									</div>
								</article>
							{/each}
						</div>
					</article>
				</li>
			{/each}
		</ul>
	{/if}

	<div class="mt-6">
		{#if currentUser}
			<form onsubmit={handleSubmit} class="space-y-2">
				{#if composerReplyTo}
					<div
						class="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground"
					>
						<span>
							Replying to
							<span class="font-semibold text-foreground"
								>{composerReplyTo.author?.name || 'Someone'}</span
							>
						</span>
						<button
							type="button"
							onclick={() => (composerReplyTo = null)}
							class="text-muted-foreground hover:text-foreground underline underline-offset-2"
						>
							Cancel
						</button>
					</div>
				{/if}
				<textarea
					bind:value={composerBody}
					placeholder={composerReplyTo
						? 'Write a reply…'
						: 'Share feedback, ask a question…'}
					rows="3"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-y"
					maxlength={10000}
					required
				></textarea>
				<div class="flex items-center justify-end">
					<button
						type="submit"
						disabled={submitting || composerBody.trim().length === 0}
						class="inline-flex min-h-[36px] items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground hover:bg-accent/90 transition-colors pressable disabled:opacity-50"
					>
						<Send class="w-3.5 h-3.5" />
						{submitting ? 'Posting…' : 'Post comment'}
					</button>
				</div>
			</form>
		{:else}
			<a
				href={signInHref}
				class="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-accent/10 transition-colors pressable"
			>
				Sign in to comment
			</a>
		{/if}
	</div>
</section>
