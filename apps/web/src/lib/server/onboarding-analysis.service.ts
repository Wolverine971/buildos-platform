// apps/web/src/lib/server/onboarding-analysis.service.ts
import { PUBLIC_RAILWAY_WORKER_URL } from '$env/static/public';
import { PRIVATE_RAILWAY_WORKER_TOKEN } from '$env/static/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { addQueueJobWithPublicId } from '$lib/server/queue-job-id';

const WORKER_URL = PUBLIC_RAILWAY_WORKER_URL;
const REQUEST_TIMEOUT_MS = 8000;

type OnboardingAnalysisContext = {
	input_projects?: string | null;
	input_work_style?: string | null;
	input_challenges?: string | null;
	input_help_focus?: string | null;
};

type OnboardingAnalysisOptions = {
	forceRegenerate?: boolean;
	maxQuestions?: number;
};

async function queueOnboardingAnalysisDirect(params: {
	userId: string;
	userContext?: OnboardingAnalysisContext;
	options?: OnboardingAnalysisOptions;
}): Promise<{ queued: boolean; jobId?: string; reason?: string }> {
	try {
		const supabase = createAdminSupabaseClient();
		const dedupKey = params.options?.forceRegenerate
			? `onboarding-analysis-${params.userId}-${Date.now()}`
			: `onboarding-analysis-${params.userId}`;
		const { queueJobId } = await addQueueJobWithPublicId(supabase, {
			p_user_id: params.userId,
			p_job_type: 'onboarding_analysis',
			p_metadata: {
				userId: params.userId,
				userContext: params.userContext ?? {},
				options: params.options
			},
			p_priority: 1,
			p_scheduled_for: new Date().toISOString(),
			p_dedup_key: dedupKey
		});

		return { queued: true, jobId: queueJobId, reason: 'direct_queue' };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Direct queue failed';
		return { queued: false, reason: message };
	}
}

export async function queueOnboardingAnalysis(params: {
	userId: string;
	userContext?: OnboardingAnalysisContext;
	options?: OnboardingAnalysisOptions;
}): Promise<{ queued: boolean; jobId?: string; reason?: string }> {
	if (!WORKER_URL) {
		console.warn(
			'[Onboarding Analysis] Worker URL not configured. Falling back to direct queue.'
		);
		return queueOnboardingAnalysisDirect(params);
	}

	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	};

	if (PRIVATE_RAILWAY_WORKER_TOKEN) {
		headers.Authorization = `Bearer ${PRIVATE_RAILWAY_WORKER_TOKEN}`;
	}

	try {
		const response = await fetch(`${WORKER_URL}/queue/onboarding`, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				userId: params.userId,
				userContext: params.userContext,
				options: params.options
			}),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});

		if (response.status === 409) {
			const payload = await response.json().catch(() => null);
			return {
				queued: true,
				jobId: payload?.existingJobId,
				reason: 'already_queued'
			};
		}

		if (!response.ok) {
			const payload = await response.json().catch(() => null);
			const message = payload?.error || `HTTP ${response.status}`;
			return { queued: false, reason: message };
		}

		let result: { jobId?: string } | null = null;
		try {
			result = (await response.json()) as { jobId?: string } | null;
		} catch (parseError) {
			console.warn(
				'[Onboarding Analysis] Failed to parse worker success response; falling back to direct queue',
				parseError
			);
			return queueOnboardingAnalysisDirect(params);
		}
		return { queued: true, jobId: result?.jobId };
	} catch (error) {
		console.warn(
			'[Onboarding Analysis] Worker unreachable. Falling back to direct queue.',
			error
		);
		return queueOnboardingAnalysisDirect(params);
	}
}
