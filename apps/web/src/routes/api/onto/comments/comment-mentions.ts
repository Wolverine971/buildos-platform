// apps/web/src/routes/api/onto/comments/comment-mentions.ts
import { parseEntityReferences } from '$lib/utils/entity-reference-parser';
import { createTrackedInAppNotification } from '$lib/server/tracked-in-app-notification.service';

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

		const notificationByUserId = new Map<string, string>();

		const notificationResults = await Promise.all(
			newMentionUserIds.map(async (userId) => ({
				userId,
				result: await createTrackedInAppNotification({
					supabase,
					recipientUserId: userId,
					eventType: 'comment.mentioned',
					actorUserId: author.userId,
					eventSource: 'api_action',
					type: 'comment_mention',
					title: 'You were mentioned',
					message,
					actionUrl: `/projects/${project.id}`,
					payload: {
						project_id: project.id,
						project_name: project.name ?? null,
						comment_id: comment.id,
						root_id: comment.root_id,
						entity_type: comment.entity_type,
						entity_id: comment.entity_id,
						actor_user_id: author.userId,
						actor_name: author.name
					},
					data: {
						comment_id: comment.id,
						project_id: project.id,
						entity_type: comment.entity_type,
						entity_id: comment.entity_id,
						root_id: comment.root_id
					}
				})
			}))
		);

		for (const { userId, result } of notificationResults) {
			if (result.success && result.userNotificationId) {
				notificationByUserId.set(userId, result.userNotificationId);
				continue;
			}
			console.error('[Comments API] Failed to create mention notification', {
				userId,
				error: result.error
			});
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
