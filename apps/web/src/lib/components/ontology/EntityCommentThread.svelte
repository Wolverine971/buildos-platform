<!-- apps/web/src/lib/components/ontology/EntityCommentThread.svelte -->
<script lang="ts" module>
	export type CommentNode = {
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
		author?: {
			id: string;
			name: string;
			user_id: string | null;
			kind: string;
		} | null;
		children: CommentNode[];
	};
</script>

<script lang="ts">
	import { Reply, Edit3, Trash2, LoaderCircle } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CommentTextareaWithVoice from '$lib/components/ui/CommentTextareaWithVoice.svelte';
	import { getProseClasses, renderMarkdown } from '$lib/utils/markdown';
	import { formatDistanceToNow } from 'date-fns';
	import Self from './EntityCommentThread.svelte';

	interface Props {
		comment: CommentNode;
		actorId: string | null;
		replyingToId: string | null;
		replyBody: string;
		editingId: string | null;
		editingBody: string;
		isReplying: boolean;
		isEditing: boolean;
		deletingId: string | null;
		onReplyStart: (id: string) => void;
		onReplyCancel: () => void;
		onReplySubmit: (parentId: string | null) => void;
		onEditStart: (comment: CommentNode) => void;
		onEditCancel: () => void;
		onEditSubmit: (commentId: string) => void;
		onDelete: (commentId: string) => void;
		onReplyBodyChange: (value: string) => void;
		onEditBodyChange: (value: string) => void;
	}

	let {
		comment,
		actorId,
		replyingToId,
		replyBody,
		editingId,
		editingBody,
		isReplying,
		isEditing,
		deletingId,
		onReplyStart,
		onReplyCancel,
		onReplySubmit,
		onEditStart,
		onEditCancel,
		onEditSubmit,
		onDelete,
		onReplyBodyChange,
		onEditBodyChange
	}: Props = $props();

	function canEditComment(current: CommentNode) {
		return Boolean(actorId && current.created_by === actorId && !current.deleted_at);
	}

	function canReplyComment(current: CommentNode) {
		return Boolean(actorId && !current.deleted_at);
	}

	function formatTimestamp(dateString: string) {
		try {
			return formatDistanceToNow(new Date(dateString), { addSuffix: true });
		} catch {
			return '';
		}
	}

	function renderBody(body: string) {
		const mentionFormatted = body.replace(/\[\[user:[\w-]+\|([^\]]+)\]\]/gi, '@$1');
		return renderMarkdown(mentionFormatted);
	}
</script>

<div class="space-y-2">
	<div class="rounded-lg border border-border bg-card p-2.5 shadow-ink tx tx-thread tx-weak">
		<div class="flex items-center justify-between text-xs text-muted-foreground">
			<div class="flex items-center gap-1.5">
				<span class="font-semibold text-foreground"
					>{comment.author?.name || 'Unknown'}</span
				>
				<span class="text-muted-foreground/80">{formatTimestamp(comment.created_at)}</span>
				{#if comment.edited_at}
					<span
						class="text-[0.65rem] uppercase tracking-[0.1em] text-muted-foreground/60"
					>
						edited
					</span>
				{/if}
			</div>
			<div class="flex items-center gap-0.5">
				{#if canReplyComment(comment)}
					<Button
						variant="ghost"
						size="sm"
						class="pressable"
						onclick={() => onReplyStart(comment.id)}
					>
						<Reply class="w-3 h-3" />
					</Button>
				{/if}
				{#if canEditComment(comment)}
					<Button
						variant="ghost"
						size="sm"
						class="pressable"
						onclick={() => onEditStart(comment)}
					>
						<Edit3 class="w-3 h-3" />
					</Button>
					<Button
						variant="ghost"
						size="sm"
						class="pressable hover:text-red-600"
						onclick={() => onDelete(comment.id)}
						disabled={deletingId === comment.id}
					>
						{#if deletingId === comment.id}
							<LoaderCircle class="w-3 h-3 animate-spin" />
						{:else}
							<Trash2 class="w-3 h-3" />
						{/if}
					</Button>
				{/if}
			</div>
		</div>

		{#if comment.deleted_at}
			<p class="mt-1.5 text-xs text-muted-foreground italic">Comment deleted.</p>
		{:else if editingId === comment.id}
			<div class="mt-1.5">
				<CommentTextareaWithVoice
					value={editingBody}
					rows={3}
					size="sm"
					voiceBlocked={isEditing}
					voiceNoteSource="entity-comment-edit"
					oninput={(event) =>
						onEditBodyChange((event.target as HTMLTextAreaElement).value)}
				>
					{#snippet actions()}
						<Button
							variant="primary"
							size="sm"
							class="pressable"
							onclick={() => onEditSubmit(comment.id)}
							disabled={isEditing || !editingBody.trim()}
						>
							{#if isEditing}
								<LoaderCircle class="w-3 h-3 animate-spin" />
								Saving...
							{:else}
								Save
							{/if}
						</Button>
						<Button variant="ghost" size="sm" class="pressable" onclick={onEditCancel}
							>Cancel</Button
						>
					{/snippet}
				</CommentTextareaWithVoice>
			</div>
		{:else}
			<div class="mt-1.5 {getProseClasses('sm')}">{@html renderBody(comment.body)}</div>
		{/if}

		{#if replyingToId === comment.id}
			<div class="mt-2 border-t border-border pt-2">
				<CommentTextareaWithVoice
					value={replyBody}
					rows={2}
					size="sm"
					placeholder="Write a reply..."
					voiceBlocked={isReplying}
					voiceNoteSource="entity-comment-reply"
					oninput={(event) =>
						onReplyBodyChange((event.target as HTMLTextAreaElement).value)}
				>
					{#snippet actions()}
						<Button
							variant="secondary"
							size="sm"
							class="pressable"
							onclick={() => onReplySubmit(comment.id)}
							disabled={isReplying || !replyBody.trim()}
						>
							{#if isReplying}
								<LoaderCircle class="w-3 h-3 animate-spin" />
								Replying...
							{:else}
								Reply
							{/if}
						</Button>
						<Button variant="ghost" size="sm" class="pressable" onclick={onReplyCancel}
							>Cancel</Button
						>
					{/snippet}
				</CommentTextareaWithVoice>
			</div>
		{/if}
	</div>

	{#if comment.children.length > 0}
		<div class="space-y-2 pl-3 border-l-2 border-border/50">
			{#each comment.children as child (child.id)}
				<Self
					comment={child}
					{actorId}
					{replyingToId}
					{replyBody}
					{editingId}
					{editingBody}
					{isReplying}
					{isEditing}
					{deletingId}
					{onReplyStart}
					{onReplyCancel}
					{onReplySubmit}
					{onEditStart}
					{onEditCancel}
					{onEditSubmit}
					{onDelete}
					{onReplyBodyChange}
					{onEditBodyChange}
				/>
			{/each}
		</div>
	{/if}
</div>
