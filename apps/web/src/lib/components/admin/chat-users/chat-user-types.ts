// apps/web/src/lib/components/admin/chat-users/chat-user-types.ts
import type {
	AdminChatClassificationJobSummary,
	AdminChatRedactedSessionResponse,
	AdminChatRedactedSessionTimelineEvent,
	AdminChatRedactedTurn,
	AdminChatSessionMetric,
	AdminChatUserAnalyticsQuery,
	AdminChatUserAnalyticsTimeframe,
	AdminChatUserDetailResponse,
	AdminChatUserMetric,
	AdminChatUserSortField,
	AdminChatUsersResponse
} from '$lib/types/admin-chat-user-analytics';

export type Timeframe = AdminChatUserAnalyticsTimeframe;
export type SortOrder = AdminChatUserAnalyticsQuery['sort_order'];
export type ErrorFilter = AdminChatUserAnalyticsQuery['errors'];
export type ToolBucketFilter = AdminChatUserAnalyticsQuery['tool_bucket'];
export type ClassificationFilter = AdminChatUserAnalyticsQuery['classification'];
export type EntityActionFilter = AdminChatUserAnalyticsQuery['entity_action'];

export type SortField = AdminChatUserSortField;
export type UserMetric = AdminChatUserMetric;
export type ClassificationJobSummary = AdminChatClassificationJobSummary;
export type SessionMetric = AdminChatSessionMetric;
export type UsersResponse = AdminChatUsersResponse;
export type UserDetail = AdminChatUserDetailResponse;
export type RedactedTurn = AdminChatRedactedTurn;
export type RedactedTimelineEvent = AdminChatRedactedSessionTimelineEvent;
export type RedactedSession = AdminChatRedactedSessionResponse;

export type ComparisonTone = 'neutral' | 'good' | 'warning' | 'bad';
export type ComparisonPreference = 'neutral' | 'lower' | 'higher';

export type ComparisonMetric = {
	label: string;
	user_value: string;
	cohort_value: string;
	delta: string;
	tone: ComparisonTone;
	description: string;
};

export type AlertBadge = {
	label: string;
	tone: Exclude<ComparisonTone, 'good'>;
	title: string;
};

export type IssueCluster = {
	key: string;
	source: string;
	message: string;
	severity: string | null;
	count: number;
	latest_at: string;
	session_id: string | null;
};
