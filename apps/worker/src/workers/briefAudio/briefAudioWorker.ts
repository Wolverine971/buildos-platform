// apps/worker/src/workers/briefAudio/briefAudioWorker.ts
import type {
	GenerateBriefAudioJobMetadata,
	GenerateBriefAudioResult
} from '@buildos/shared-types';
import { logWorkerError } from '../../lib/errorLogger';
import { uploadBriefAudio } from '../../lib/storage/briefAudio';
import { supabase } from '../../lib/supabase';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { buildBriefNarrationText } from '../../lib/tts/textCleanup';
import {
	resolveBriefAudioProviderForWorker,
	synthesizeBriefAudioForWorker
} from './briefAudioSynthesis';

type BriefRecord = {
	id: string;
	user_id: string;
	brief_date: string;
	executive_summary: string | null;
	llm_analysis: string | null;
	priority_actions: string[] | null;
	audio_status: string | null;
	audio_storage_path: string | null;
	audio_generation_started_at: string | null;
};

type UserRecord = {
	is_admin: boolean | null;
	voice_narration_enabled: boolean | null;
};

const AUDIO_HEARTBEAT_MS = 60_000;
const DEFAULT_SYNTHESIS_TIMEOUT_MS = 2 * 60 * 1000;
let audioChain: Promise<unknown> = Promise.resolve();

function truncateErrorMessage(message: string): string {
	return message.length > 1000 ? `${message.slice(0, 997)}...` : message;
}

async function markAudioFailed(briefId: string, userId: string, message: string): Promise<void> {
	const { error } = await supabase
		.from('ontology_daily_briefs')
		.update({
			audio_status: 'failed',
			audio_error: truncateErrorMessage(message),
			audio_generation_started_at: null,
			updated_at: new Date().toISOString()
		})
		.eq('id', briefId)
		.eq('user_id', userId);

	if (error) {
		console.error(`Failed to mark brief audio failed for ${briefId}:`, error);
	}
}

async function resetAudioState(briefId: string, userId: string): Promise<void> {
	const { error } = await supabase
		.from('ontology_daily_briefs')
		.update({
			audio_status: 'none',
			audio_storage_path: null,
			audio_voice: null,
			audio_model: null,
			audio_duration_ms: null,
			audio_generation_ms: null,
			audio_requested_at: null,
			audio_generation_started_at: null,
			audio_generated_at: null,
			audio_error: null,
			updated_at: new Date().toISOString()
		})
		.eq('id', briefId)
		.eq('user_id', userId);

	if (error) {
		throw new Error(`Failed to reset brief audio state: ${error.message}`);
	}
}

async function fetchUser(userId: string): Promise<UserRecord | null> {
	const { data, error } = await supabase
		.from('users')
		.select('is_admin, voice_narration_enabled')
		.eq('id', userId)
		.maybeSingle();

	if (error) {
		throw new Error(`Failed to load user voice narration settings: ${error.message}`);
	}

	return data as UserRecord | null;
}

async function fetchBrief(briefId: string, userId: string): Promise<BriefRecord> {
	const { data, error } = await supabase
		.from('ontology_daily_briefs')
		.select(
			'id, user_id, brief_date, executive_summary, llm_analysis, priority_actions, audio_status, audio_storage_path, audio_generation_started_at'
		)
		.eq('id', briefId)
		.eq('user_id', userId)
		.maybeSingle();

	if (error || !data) {
		throw new Error(error?.message || 'Brief not found');
	}

	return data as BriefRecord;
}

function isEligible(user: UserRecord | null): boolean {
	return Boolean(user?.is_admin && user.voice_narration_enabled);
}

function startAudioJobHeartbeat(job: ProcessingJob<GenerateBriefAudioJobMetadata>): () => void {
	const update = async () => {
		await job.updateProgress({
			current: 1,
			total: 100,
			message: 'Audio narration job is active'
		});
	};

	void update().catch((error) => {
		console.warn('Failed to update brief audio heartbeat:', error);
	});
	const interval = setInterval(() => {
		void update().catch((error) => {
			console.warn('Failed to update brief audio heartbeat:', error);
		});
	}, AUDIO_HEARTBEAT_MS);

	return () => {
		clearInterval(interval);
	};
}

async function processBriefAudioInner(
	job: ProcessingJob<GenerateBriefAudioJobMetadata>
): Promise<GenerateBriefAudioResult> {
	const userId = job.userId;
	let briefId: string | null = null;
	let stage: 'eligibility' | 'fetch' | 'mark_generating' | 'synthesize' | 'upload' | 'persist' =
		'eligibility';
	let model: string | undefined;
	let provider: string | undefined;

	try {
		briefId =
			job.data && typeof job.data === 'object' && typeof job.data.briefId === 'string'
				? job.data.briefId
				: null;

		if (!briefId) {
			throw new Error('Missing briefId in brief audio job metadata');
		}

		await job.log(`Brief audio job started for brief ${briefId}`);
		await job.updateProgress({
			current: 10,
			total: 100,
			message: 'Checking voice narration eligibility'
		});

		let user = await fetchUser(userId);
		if (!isEligible(user)) {
			await resetAudioState(briefId, userId);
			return { success: true, briefId, skipped: true, reason: 'voice_narration_disabled' };
		}

		stage = 'fetch';
		await job.updateProgress({
			current: 20,
			total: 100,
			message: 'Loading brief content'
		});
		const brief = await fetchBrief(briefId, userId);
		if (brief.audio_status === 'ready' && brief.audio_storage_path) {
			return {
				success: true,
				briefId,
				storagePath: brief.audio_storage_path,
				skipped: true,
				reason: 'already_ready'
			};
		}

		stage = 'mark_generating';
		const startedAt = new Date().toISOString();
		const { data: claimedBrief, error: markError } = await supabase
			.from('ontology_daily_briefs')
			.update({
				audio_status: 'generating',
				audio_generation_started_at: startedAt,
				audio_error: null,
				updated_at: startedAt
			})
			.eq('id', briefId)
			.eq('user_id', userId)
			.in('audio_status', ['pending', 'generating', 'failed', 'none'])
			.select('id, audio_status, audio_storage_path')
			.maybeSingle();

		if (markError) {
			throw new Error(`Failed to mark brief audio generating: ${markError.message}`);
		}

		if (!claimedBrief) {
			const refreshedBrief = await fetchBrief(briefId, userId);
			if (refreshedBrief.audio_status === 'ready' && refreshedBrief.audio_storage_path) {
				return {
					success: true,
					briefId,
					storagePath: refreshedBrief.audio_storage_path,
					skipped: true,
					reason: 'already_ready'
				};
			}

			return { success: true, briefId, skipped: true, reason: 'not_pending' };
		}

		user = await fetchUser(userId);
		if (!isEligible(user)) {
			await resetAudioState(briefId, userId);
			return { success: true, briefId, skipped: true, reason: 'voice_narration_disabled' };
		}

		const narrationText = buildBriefNarrationText({
			briefDate: brief.brief_date,
			executiveSummary: brief.executive_summary,
			llmAnalysis: brief.llm_analysis,
			priorityActions: brief.priority_actions
		});

		stage = 'synthesize';
		provider = resolveBriefAudioProviderForWorker();
		await job.updateProgress({
			current: 40,
			total: 100,
			message: 'Generating audio narration'
		});
		const synthesis = await synthesizeBriefAudioForWorker(
			narrationText,
			DEFAULT_SYNTHESIS_TIMEOUT_MS
		);
		model = synthesis.model;

		stage = 'upload';
		await job.updateProgress({
			current: 80,
			total: 100,
			message: 'Uploading audio narration'
		});
		const storagePath = await uploadBriefAudio({
			userId,
			briefId,
			audio: synthesis.mp3
		});

		stage = 'persist';
		await job.updateProgress({
			current: 90,
			total: 100,
			message: 'Saving audio metadata'
		});
		const completedAt = new Date().toISOString();
		const { error: updateError } = await supabase
			.from('ontology_daily_briefs')
			.update({
				audio_status: 'ready',
				audio_storage_path: storagePath,
				audio_voice: synthesis.voice,
				audio_model: synthesis.model,
				audio_duration_ms: synthesis.durationMs,
				audio_generation_ms: synthesis.generationMs,
				audio_generated_at: completedAt,
				audio_generation_started_at: null,
				audio_error: null,
				updated_at: completedAt
			})
			.eq('id', briefId)
			.eq('user_id', userId);

		if (updateError) {
			throw new Error(`Failed to persist brief audio metadata: ${updateError.message}`);
		}

		await job.log(
			`Brief audio generated in ${synthesis.generationMs}ms, duration ${
				synthesis.durationMs === null ? 'unknown' : `${synthesis.durationMs}ms`
			}`
		);
		await job.updateProgress({
			current: 100,
			total: 100,
			message: 'Audio narration ready'
		});

		return {
			success: true,
			briefId,
			storagePath,
			durationMs: synthesis.durationMs ?? undefined,
			generationMs: synthesis.generationMs
		};
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Brief audio generation failed';
		if (briefId) {
			await markAudioFailed(briefId, userId, message);
		}
		await logWorkerError(error, {
			userId,
			tableName: 'ontology_daily_briefs',
			recordId: briefId ?? job.id,
			operationType: 'generate_brief_audio',
			llmProvider: provider ?? 'brief_audio',
			llmModel: model,
			errorType: 'llm_error',
			metadata: {
				stage,
				queue_job_id: job.id
			}
		});
		throw error;
	}
}

export function processBriefAudio(
	job: ProcessingJob<GenerateBriefAudioJobMetadata>
): Promise<GenerateBriefAudioResult> {
	const next = audioChain.then(() => {
		const stopHeartbeat = startAudioJobHeartbeat(job);
		return processBriefAudioInner(job).finally(() => {
			stopHeartbeat();
		});
	});
	audioChain = next.catch(() => undefined);
	return next;
}
