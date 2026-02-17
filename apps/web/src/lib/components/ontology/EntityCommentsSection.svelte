<!-- apps/web/src/lib/components/ontology/EntityCommentsSection.svelte -->
<script lang="ts">
	import { MessageSquare, LoaderCircle } from 'lucide-svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CommentTextareaWithVoice from '$lib/components/ui/CommentTextareaWithVoice.svelte';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import EntityCommentThread from '$lib/components/ontology/EntityCommentThread.svelte';

	type CommentAuthor = {
		id: string;
		name: string;
		user_id: string | null;
		kind: string;
	};

	type Comment = {
		id: string;
		project_id: string;
		entity_type: string;
		entity_id: string;
		parent_id: string | null;
		root_id: string;
		body: string;
		body_format: string;
		metadata: Record<string, unknown> | null;
		created_by: string;
		created_at: string;
		updated_at: string;
		edited_at: string | null;
		deleted_at: string | null;
		author?: CommentAuthor | null;
	};

	type CommentNode = Comment & { children: CommentNode[] };

	interface Props {
		projectId: string;
		entityType: string;
		entityId: string;
		onCountChange?: (count: number) => void;
	}

	let { projectId, entityType, entityId, onCountChange }: Props = $props();

	let comments = $state<Comment[]>([]);
	let actorId = $state<string | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	let newComment = $state('');
	let isSubmitting = $state(false);

	let replyingToId = $state<string | null>(null);
	let replyBody = $state('');
	let isReplying = $state(false);

	let editingId = $state<string | null>(null);
	let editingBody = $state('');
	let isEditing = $state(false);

	let deletingId = $state<string | null>(null);

	let lastKey = $state('');

	const threads = $derived.by(() => buildThreads(comments));
	const commentCount = $derived(comments.length);
	const canWrite = $derived(Boolean(actorId));

	// Notify parent when comment count changes
	$effect(() => {
		onCountChange?.(commentCount);
	});

	$effect(() => {
		const key = `${projectId}:${entityType}:${entityId}`;
		if (!projectId || !entityType || !entityId) return;
		if (key === lastKey) return;
		lastKey = key;
		comments = [];
		actorId = null;
		error = null;
		loadComments();
	});

	async function loadComments() {
		isLoading = true;
		error = null;

		try {
			const params = new URLSearchParams({
				project_id: projectId,
				entity_type: entityType,
				entity_id: entityId,
				include_deleted: 'true'
			});
			const response = await fetch(`/api/onto/comments?${params.toString()}`);
			const payload = await response.json();

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to load comments');
			}

			const data = payload.data as { comments: Comment[]; actorId?: string | null };
			comments = data?.comments ?? [];
			actorId = data?.actorId ?? null;

			void markThreadsRead(data?.comments ?? [], data?.actorId ?? null);
		} catch (err) {
			console.error('[Comments] Failed to load:', err);
			void logOntologyClientError(err, {
				endpoint: '/api/onto/comments',
				method: 'GET',
				entityType,
				entityId,
				projectId,
				operation: 'comments_load'
			});
			error = err instanceof Error ? err.message : 'Failed to load comments';
		} finally {
			isLoading = false;
		}
	}

	async function markThreadsRead(loadedComments: Comment[], currentActorId: string | null) {
		if (!currentActorId || loadedComments.length === 0) return;
		try {
			const threadsByRoot = new Map<string, Comment[]>();
			for (const comment of loadedComments) {
				const list = threadsByRoot.get(comment.root_id) ?? [];
				list.push(comment);
				threadsByRoot.set(comment.root_id, list);
			}

			await Promise.all(
				Array.from(threadsByRoot.entries()).map(([rootId, threadComments]) => {
					const latest = threadComments.reduce((acc, item) => {
						if (!acc) return item;
						return new Date(item.created_at).getTime() >
							new Date(acc.created_at).getTime()
							? item
							: acc;
					}, threadComments[0]);

					return fetch('/api/onto/comments/read', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							project_id: projectId,
							entity_type: entityType,
							entity_id: entityId,
							root_id: rootId,
							last_read_comment_id: latest?.id ?? null
						})
					});
				})
			);
		} catch (err) {
			console.warn('[Comments] Failed to mark threads read:', err);
		}
	}

	function buildThreads(list: Comment[]): CommentNode[] {
		const nodes = new Map<string, CommentNode>();
		const roots: CommentNode[] = [];

		for (const comment of list) {
			nodes.set(comment.id, { ...comment, children: [] });
		}

		for (const node of nodes.values()) {
			if (node.parent_id && nodes.has(node.parent_id)) {
				nodes.get(node.parent_id)!.children.push(node);
			} else {
				roots.push(node);
			}
		}

		const sortTree = (items: CommentNode[]) => {
			items.sort(
				(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
			);
			for (const item of items) {
				sortTree(item.children);
			}
		};

		sortTree(roots);
		return roots;
	}

	function startReply(commentId: string) {
		replyingToId = commentId;
		replyBody = '';
		editingId = null;
		editingBody = '';
	}

	function cancelReply() {
		replyingToId = null;
		replyBody = '';
	}

	function startEdit(comment: Comment) {
		editingId = comment.id;
		editingBody = comment.body;
		replyingToId = null;
		replyBody = '';
	}

	function cancelEdit() {
		editingId = null;
		editingBody = '';
	}

	async function submitComment(parentId: string | null) {
		const bodyText = (parentId ? replyBody : newComment).trim();
		if (!bodyText) return;

		if (parentId) {
			isReplying = true;
		} else {
			isSubmitting = true;
		}

		try {
			const response = await fetch('/api/onto/comments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project_id: projectId,
					entity_type: entityType,
					entity_id: entityId,
					body: bodyText,
					parent_id: parentId
				})
			});

			const payload = await response.json();
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to create comment');
			}

			if (parentId) {
				replyBody = '';
				replyingToId = null;
			} else {
				newComment = '';
			}

			await loadComments();
		} catch (err) {
			console.error('[Comments] Failed to submit:', err);
			void logOntologyClientError(err, {
				endpoint: '/api/onto/comments',
				method: 'POST',
				entityType,
				entityId,
				projectId,
				operation: 'comment_create'
			});
			error = err instanceof Error ? err.message : 'Failed to create comment';
		} finally {
			isSubmitting = false;
			isReplying = false;
		}
	}

	async function submitEdit(commentId: string) {
		const bodyText = editingBody.trim();
		if (!bodyText) return;

		isEditing = true;

		try {
			const response = await fetch(`/api/onto/comments/${commentId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ body: bodyText })
			});

			const payload = await response.json();
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to update comment');
			}

			editingId = null;
			editingBody = '';
			await loadComments();
		} catch (err) {
			console.error('[Comments] Failed to edit:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/comments/${commentId}`,
				method: 'PATCH',
				entityType,
				entityId,
				projectId,
				operation: 'comment_edit'
			});
			error = err instanceof Error ? err.message : 'Failed to update comment';
		} finally {
			isEditing = false;
		}
	}

	async function deleteComment(commentId: string) {
		if (!confirm('Delete this comment?')) return;
		deletingId = commentId;

		try {
			const response = await fetch(`/api/onto/comments/${commentId}`, { method: 'DELETE' });
			const payload = await response.json();
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to delete comment');
			}
			await loadComments();
		} catch (err) {
			console.error('[Comments] Failed to delete:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/comments/${commentId}`,
				method: 'DELETE',
				entityType,
				entityId,
				projectId,
				operation: 'comment_delete'
			});
			error = err instanceof Error ? err.message : 'Failed to delete comment';
		} finally {
			deletingId = null;
		}
	}
</script>

<Card variant="outline" class="mt-4">
	<CardHeader class="flex items-center justify-between gap-2 py-2">
		<div class="flex items-center gap-1.5">
			<MessageSquare class="w-4 h-4 text-accent" />
			<h3 class="text-sm font-semibold text-foreground">Comments</h3>
		</div>
		<span class="text-[0.65rem] uppercase tracking-[0.1em] text-muted-foreground"
			>{commentCount}</span
		>
	</CardHeader>
	<CardBody padding="sm" class="space-y-3">
		<div class="space-y-1.5">
			<label for="new-comment-input" class="text-xs font-medium text-muted-foreground"
				>Add a comment</label
			>
			<CommentTextareaWithVoice
				id="new-comment-input"
				bind:value={newComment}
				rows={2}
				placeholder="Share an update or ask a question..."
				disabled={isSubmitting || !canWrite}
				voiceBlocked={isSubmitting}
				enableVoice={canWrite}
				voiceNoteSource="entity-comment-new"
				size="sm"
			>
				{#snippet footer({ isRecording, isTranscribing })}
					{#if !isRecording && !isTranscribing}
						{#if !canWrite}
							<span class="text-muted-foreground">Sign in to add a comment.</span>
						{:else}
							<span>
								Mentions: <span class="font-mono bg-muted px-1 rounded"
									>[[user:id|Name]]</span
								>
							</span>
						{/if}
					{/if}
				{/snippet}
				{#snippet actions()}
					<Button
						variant="primary"
						size="sm"
						class="pressable"
						onclick={() => submitComment(null)}
						disabled={isSubmitting || !newComment.trim() || !canWrite}
					>
						{#if isSubmitting}
							<LoaderCircle class="w-3 h-3 animate-spin" />
							Posting...
						{:else}
							Post
						{/if}
					</Button>
				{/snippet}
			</CommentTextareaWithVoice>
		</div>

		{#if error}
			<div
				class="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-destructive/10 border border-destructive/30 tx tx-static tx-weak"
			>
				<p class="text-xs text-destructive">{error}</p>
			</div>
		{/if}

		{#if isLoading}
			<div class="flex items-center gap-1.5 text-sm text-muted-foreground">
				<LoaderCircle class="w-3.5 h-3.5 animate-spin" />
				Loading comments...
			</div>
		{:else if threads.length === 0}
			<p class="text-xs text-muted-foreground py-2">No comments yet.</p>
		{:else}
			<div class="space-y-2">
				{#each threads as thread (thread.id)}
					<EntityCommentThread
						comment={thread}
						{actorId}
						{replyingToId}
						{replyBody}
						{editingId}
						{editingBody}
						{isReplying}
						{isEditing}
						{deletingId}
						onReplyStart={startReply}
						onReplyCancel={cancelReply}
						onReplySubmit={submitComment}
						onEditStart={startEdit}
						onEditCancel={cancelEdit}
						onEditSubmit={submitEdit}
						onDelete={deleteComment}
						onReplyBodyChange={(value) => (replyBody = value)}
						onEditBodyChange={(value) => (editingBody = value)}
					/>
				{/each}
			</div>
		{/if}
	</CardBody>
</Card>
