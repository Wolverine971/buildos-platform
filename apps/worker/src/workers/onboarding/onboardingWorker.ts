// apps/worker/src/workers/onboarding/onboardingWorker.ts
import { supabase } from '../../lib/supabase';
import {
	OnboardingAnalysisJobData,
	broadcastUserEvent,
	updateJobStatus
} from '../shared/queueUtils';
import { LegacyJob } from '../shared/jobAdapter';
import { OnboardingAnalysisService } from './onboardingAnalysisService';

export async function processOnboardingAnalysisJob(job: LegacyJob<OnboardingAnalysisJobData>) {
	console.log(`🧠 Processing onboarding analysis job ${job.id} for user ${job.data.userId}`);

	try {
		await updateJobStatus(job.id, 'processing', 'onboarding', undefined, job.processingToken);

		const { userId, userContext, options } = job.data;

		// Initialize the analysis service
		const analysisService = new OnboardingAnalysisService(supabase);

		// Generate questions based on onboarding data
		const result = await analysisService.generateOnboardingQuestions(
			userId,
			userContext,
			options
		);

		// Update job status
		await updateJobStatus(job.id, 'completed', 'onboarding', undefined, job.processingToken);

		// Notify user
		await broadcastUserEvent(userId, 'onboarding_analysis_completed', {
			questionsGenerated: result.questions.length,
			analysis: result.analysis,
			message: 'Your personalized questions are ready!'
		});

		// Log activity
		await supabase.from('user_activity_logs').insert({
			user_id: userId,
			activity_type: 'onboarding_questions_generated',
			metadata: {
				job_id: job.id,
				questions_count: result.questions.length,
				analysis_summary: result.analysis
			}
		});

		console.log(
			`✅ Completed onboarding analysis for user ${userId} - Generated ${result.questions.length} questions`
		);

		return result;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error(`❌ Failed to analyze onboarding for user ${job.data.userId}:`, errorMessage);

		await updateJobStatus(job.id, 'failed', 'onboarding', errorMessage, job.processingToken);

		await broadcastUserEvent(job.data.userId, 'onboarding_analysis_failed', {
			error: errorMessage,
			jobId: job.id,
			message: 'Onboarding analysis failed. Please try again.'
		});

		throw error;
	}
}
