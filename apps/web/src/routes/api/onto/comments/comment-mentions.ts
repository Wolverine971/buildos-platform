// apps/web/src/routes/api/onto/comments/comment-mentions.ts
import { parseEntityReferences } from '$lib/utils/entity-reference-parser';

type SupabaseClient = App.Locals['supabase'];

type ProjectContext = {
	id: string;
	name: string | null;
	is_public: boolean | null;
	created_by: string;
};

type CommentContext = {
	id: string;
	root_id: string;
	entity_type: string;
	entity_id: string;
};

type MentionContext = {
	supabase: SupabaseClient;
	body: string;
	project: ProjectContext;
	comment: CommentContext;
	author: {
		userId: string;
		name: string;
	};
	existingMentionUserIds?: string[];
};

const ENTITY_LABELS: Record<string, string> = {
	project: 'project',
	task: 'task',
	plan: 'plan',
	document: 'document',
	goal: 'goal',
	requirement: 'requirement',
	milestone: 'milestone',
	risk: 'risk',
	event: 'event',
	metric: 'metric',
	metric_point: 'metric point',
	source: 'source',
	signal: 'signal',
	insight: 'insight',
	note: 'note'
};

function formatEntityLabel(entityType: string): string {
	return ENTITY_LABELS[entityType] ?? entityType.replace(/_/g, ' ');
}

export async function handleCommentMentions({
	supabase,
	body,
	project,
	comment,
	author,
	existingMentionUserIds = []
}: MentionContext): Promise<void> {
	try {
		const parsed = parseEntityReferences(body);
		const mentionUserIds = Array.from(
			new Set(
				parsed.entities
					.filter((entity) => entity.type === 'user')
					.map((entity) => entity.id)
			)
		).filter((userId) => userId !== author.userId);

		if (mentionUserIds.length === 0) return;

		const { data: actors, error: actorError } = await supabase
			.from('onto_actors')
			.select('id, user_id')
			.in('user_id', mentionUserIds);

		if (actorError) {
			console.error('[Comments API] Failed to resolve mention actors:', actorError);
			return;
		}

		if (!actors || actors.length === 0) return;

		const actorByUserId = new Map<string, string>();
		const actorIds: string[] = [];

		for (const actor of actors) {
			if (!actor.user_id) continue;
			actorByUserId.set(actor.user_id, actor.id);
			actorIds.push(actor.id);
		}

		if (actorByUserId.size === 0) return;

		let allowedUserIds: string[];

		if (project.is_public) {
			allowedUserIds = Array.from(actorByUserId.keys());
		} else {
			const { data: members, error: memberError } = await supabase
				.from('onto_project_members')
				.select('actor_id')
				.eq('project_id', project.id)
				.is('removed_at', null)
				.in('actor_id', actorIds);

			if (memberError) {
				console.error('[Comments API] Failed to check mention access:', memberError);
				return;
			}

			const allowedActorIds = new Set<string>(members?.map((m) => m.actor_id) ?? []);
			allowedActorIds.add(project.created_by);

			allowedUserIds = Array.from(actorByUserId.entries())
				.filter(([, actorId]) => allowedActorIds.has(actorId))
				.map(([userId]) => userId);
		}

		const existingSet = new Set(existingMentionUserIds);
		const newMentionUserIds = allowedUserIds.filter((userId) => !existingSet.has(userId));

		if (newMentionUserIds.length === 0) return;

		const entityLabel = formatEntityLabel(comment.entity_type);
		const projectName = project.name || 'project';
		const message = `${author.name} mentioned you in a comment on ${entityLabel} in ${projectName}.`;

		const notifications = newMentionUserIds.map((userId) => ({
			user_id: userId,
			type: 'comment_mention',
			title: 'You were mentioned',
			message,
			action_url: `/projects/${project.id}`,
			data: {
				comment_id: comment.id,
				project_id: project.id,
				entity_type: comment.entity_type,
				entity_id: comment.entity_id,
				root_id: comment.root_id
			}
		}));

		const { data: insertedNotifications, error: notificationError } = await supabase
			.from('user_notifications')
			.insert(notifications)
			.select('id, user_id');

		if (notificationError) {
			console.error(
				'[Comments API] Failed to create mention notifications:',
				notificationError
			);
			return;
		}

		const notificationByUserId = new Map<string, string>();
		for (const notification of insertedNotifications ?? []) {
			notificationByUserId.set(notification.user_id, notification.id);
		}

		const mentions = newMentionUserIds.map((userId) => ({
			comment_id: comment.id,
			mentioned_user_id: userId,
			notification_id: notificationByUserId.get(userId) ?? null
		}));

		const { error: mentionError } = await supabase
			.from('onto_comment_mentions')
			.insert(mentions);

		if (mentionError) {
			console.error('[Comments API] Failed to create mention rows:', mentionError);
		}
	} catch (error) {
		console.error('[Comments API] Mention handling failed:', error);
	}
}
