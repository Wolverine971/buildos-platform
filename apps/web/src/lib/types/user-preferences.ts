// apps/web/src/lib/types/user-preferences.ts
/**
 * User Preferences Type Definitions
 *
 * Two-tier preference system:
 * - UserPreferences: Global preferences stored in users.preferences JSONB
 * - ProjectPreferences: Project-specific overrides stored in onto_projects.props.preferences
 *
 * @see /apps/web/docs/features/preferences/README.md - Full preferences system documentation
 * @see /apps/web/src/lib/services/agent-context-service.ts - Prompt injection (lines 567-684)
 */

export type CommunicationStyle = 'direct' | 'supportive' | 'socratic';
export type ResponseLength = 'concise' | 'detailed' | 'adaptive';
export type ProactivityLevel = 'minimal' | 'moderate' | 'high';

export type PlanningDepth = 'lightweight' | 'detailed' | 'rigorous';
export type CollaborationMode = 'solo' | 'async_team' | 'realtime';
export type RiskTolerance = 'cautious' | 'balanced' | 'aggressive';
export type DeadlineFlexibility = 'strict' | 'flexible' | 'aspirational';

export interface UserPreferences {
	communication_style?: CommunicationStyle;
	response_length?: ResponseLength;
	proactivity_level?: ProactivityLevel;
	working_hours?: {
		start: string;
		end: string;
		timezone?: string;
		tz?: string;
	};
	primary_role?: string;
	domain_context?: string;
}

export interface ProjectPreferences {
	planning_depth?: PlanningDepth;
	update_frequency?: 'daily' | 'weekly' | 'as_needed';
	collaboration_mode?: CollaborationMode;
	risk_tolerance?: RiskTolerance;
	deadline_flexibility?: DeadlineFlexibility;
}
