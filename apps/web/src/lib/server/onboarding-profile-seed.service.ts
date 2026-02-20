// apps/web/src/lib/server/onboarding-profile-seed.service.ts
// Seeds the user behavioral profile from onboarding data.
// Based on ONBOARDING_BEHAVIORAL_SEED_SPEC.md §4.1

import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { OnboardingIntent, OnboardingStakes } from '$lib/config/onboarding.config';
import type { Json } from '@buildos/shared-types';

export interface OnboardingV3SeedData {
	intent: OnboardingIntent;
	stakes: OnboardingStakes;
	projectsCreated: number;
	tasksCreated: number;
	goalsCreated: number;
	braindumpWordCount?: number;
	braindumpUsedVoice?: boolean;
	timeSpentSeconds?: number;
	stepsSkipped?: string[];
	smsEnabled: boolean;
	emailEnabled: boolean;
}

/**
 * Seed the behavioral profile from V3 onboarding data.
 * Non-fatal: errors are logged but do not block onboarding completion.
 */
export async function seedProfileFromOnboarding(
	userId: string,
	data: OnboardingV3SeedData
): Promise<void> {
	const supabase = createAdminSupabaseClient();

	const dimensions = buildDimensionsFromOnboarding(data);
	const onboardingSeed = buildOnboardingSeed(data);
	const agentInstructions = buildInitialAgentInstructions(data);

	const { error } = await supabase.from('user_behavioral_profiles').upsert(
		{
			user_id: userId,
			dimensions,
			user_context: {
				lifecycle_stage: 'onboarding',
				stakes_level: data.stakes,
				active_project_count: data.projectsCreated,
				platform_features_used: buildFeaturesUsed(data)
			},
			project_summary: {
				avg_complexity: 0,
				complexity_distribution: { simple: 0, moderate: 0, complex: 0, ambitious: 0 },
				income_tied_project_count: data.stakes === 'high' ? data.projectsCreated : 0,
				total_tasks_across_projects: data.tasksCreated
			},
			patterns: {
				topic_affinity: {},
				failure_patterns: [],
				success_patterns: [],
				drift_triggers: []
			},
			onboarding_seed: onboardingSeed,
			agent_instructions: agentInstructions,
			confidence: 0.1,
			session_count: 0,
			analysis_version: 0,
			next_analysis_trigger: {
				type: 'milestone',
				next_session_milestone: 10,
				cadence_days: 3
			},
			computed_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'user_id' }
	);

	if (error) {
		console.error('Failed to seed behavioral profile:', error);
		// Non-fatal — onboarding completes regardless
	}
}

function buildDimensionsFromOnboarding(
	data: OnboardingV3SeedData
): Record<string, string | number> {
	// Start from clean slate defaults
	const dims: Record<string, string | number> = {
		action_orientation: 0.5,
		information_appetite: 0.5,
		session_style: 'mixed',
		autonomy_comfort: 0.3,
		overwhelm_threshold: 'medium',
		engagement_momentum: 0.5,
		intent_clarity: 'exploratory',
		follow_through_rate: 0.5,
		follow_through_rate_raw: 0.5,
		preferred_interaction_depth: 'moderate'
	};

	// Seed from intent
	switch (data.intent) {
		case 'organize':
			dims.action_orientation = 0.6;
			dims.intent_clarity = 'explicit';
			dims.session_style = 'bursty';
			break;
		case 'plan':
			dims.information_appetite = 0.6;
			dims.intent_clarity = 'exploratory';
			dims.preferred_interaction_depth = 'moderate';
			break;
		case 'unstuck':
			dims.overwhelm_threshold = 'low';
			dims.engagement_momentum = 0.3;
			dims.preferred_interaction_depth = 'shallow';
			break;
		case 'explore':
			// Keep defaults
			break;
	}

	// Seed from stakes
	if (data.stakes === 'high') {
		dims.autonomy_comfort = 0.2;
	} else if (data.stakes === 'low') {
		dims.autonomy_comfort = 0.5;
	}

	// Seed from brain dump behavior
	if (data.braindumpWordCount != null) {
		if (data.braindumpWordCount > 200) {
			dims.information_appetite = Math.max(dims.information_appetite as number, 0.6);
		} else if (data.braindumpWordCount < 50 && data.braindumpWordCount > 0) {
			dims.information_appetite = Math.min(dims.information_appetite as number, 0.3);
		}
	}

	// Seed from onboarding pacing
	if (data.timeSpentSeconds != null) {
		if (data.timeSpentSeconds < 120) {
			dims.action_orientation = Math.max(dims.action_orientation as number, 0.6);
			dims.session_style = 'bursty';
		} else if (data.timeSpentSeconds > 600) {
			dims.session_style = 'deep';
		}
	}

	// Skipped steps signal lower patience
	if (data.stepsSkipped && data.stepsSkipped.length > 0) {
		if (dims.overwhelm_threshold === 'medium') {
			dims.overwhelm_threshold = 'low';
		}
	}

	return dims;
}

function buildOnboardingSeed(data: OnboardingV3SeedData): Json {
	return {
		intent: data.intent,
		stakes: data.stakes,
		braindump_word_count: data.braindumpWordCount ?? 0,
		braindump_used_voice: data.braindumpUsedVoice ?? false,
		projects_created: data.projectsCreated,
		tasks_created: data.tasksCreated,
		goals_created: data.goalsCreated,
		time_spent_seconds: data.timeSpentSeconds ?? 0,
		steps_skipped: data.stepsSkipped ?? [],
		notifications_enabled: data.smsEnabled || data.emailEnabled,
		completed_at: new Date().toISOString(),
		onboarding_version: 'v3'
	} as Json;
}

function buildFeaturesUsed(data: OnboardingV3SeedData): string[] {
	const features = ['onboarding'];
	if (data.projectsCreated > 0) features.push('braindump');
	if (data.smsEnabled) features.push('sms');
	if (data.emailEnabled) features.push('daily_brief');
	return features;
}

function buildInitialAgentInstructions(data: OnboardingV3SeedData): string {
	const intentDescriptions: Record<OnboardingIntent, string> = {
		organize: 'organize existing work. They have projects that need structure.',
		plan: 'plan and figure out where to start. They need guidance turning ideas into action.',
		unstuck: 'get unstuck. They feel overwhelmed and need help sorting things out.',
		explore: 'try BuildOS out. They are exploring without specific commitments.'
	};

	const stakesGuidance: Record<OnboardingStakes, string> = {
		high: 'This is tied to their work or income — be precise, confirm before acting, surface deadlines proactively.',
		medium: 'This is personally important to them — be supportive and encouraging.',
		low: 'This is casual — keep things relaxed, no pressure on timelines.'
	};

	const intentGuidelines: Record<OnboardingIntent, string> = {
		organize:
			'- They are action-oriented. Start by asking which project they want to focus on.\n- Keep responses concise. They want structure, not philosophy.\n- Be precise and confirm before making changes.',
		plan: '- Help them clarify their goals. Ask questions to narrow scope.\n- Offer options and explain trade-offs.\n- Break big goals into manageable first steps.',
		unstuck:
			'- Keep it simple. One thing at a time.\n- Do NOT present multi-step plans — offer single actions.\n- Ask "What is the most important thing on your plate right now?"\n- Be encouraging. Small wins matter.\n- If they go quiet, simplify further.',
		explore:
			'- Show them what BuildOS can do through doing, not explaining.\n- Suggest a quick brain dump if they have not tried one.\n- Keep things light and low-commitment.'
	};

	const projectContext =
		data.projectsCreated > 0
			? `They created ${data.projectsCreated} project${data.projectsCreated !== 1 ? 's' : ''} with ${data.tasksCreated} task${data.tasksCreated !== 1 ? 's' : ''} during onboarding.`
			: 'They did not create any projects during onboarding.';

	return `## User Profile: New User (Just Onboarded)

This user came to BuildOS to ${intentDescriptions[data.intent]}
${stakesGuidance[data.stakes]}

${projectContext}

Guidelines:
- They are new to BuildOS — be helpful but do not over-explain.
${intentGuidelines[data.intent]}
- Keep responses concise until we learn their preferred depth.
- This is their first chat — make it productive so they come back.

Note: This profile is based on onboarding signals only (confidence: 0.1).
It will be refined after 10 sessions.`;
}
