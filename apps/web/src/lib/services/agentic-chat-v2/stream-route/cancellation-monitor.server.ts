import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import {
	consumeTransientFastChatCancelHint,
	readFastChatCancelReasonFromMetadata,
	type FastChatCancelReason
} from '../cancel-reason-channel';

type Logger = {
	warn(message: string, data?: Record<string, unknown>): void;
};

type CancellationMonitorOptions = {
	supabase: SupabaseClient<Database>;
	userId: string;
	sessionId: string;
	streamRunId: string;
	intervalMs: number;
	reasonRetryDelayMs: number;
	signal: AbortSignal;
	onCancel: (reason: FastChatCancelReason) => void;
	logger: Logger;
};

/** Owns polling, retry, and teardown for a single stream's cancellation channel. */
export class FastChatCancellationMonitor {
	private stopped = true;
	private timeoutId: ReturnType<typeof setTimeout> | null = null;

	constructor(private readonly options: CancellationMonitorOptions) {}

	start(): void {
		if (!this.stopped) return;
		this.stopped = false;
		this.schedule();
	}

	stop(): void {
		this.stopped = true;
		if (this.timeoutId) clearTimeout(this.timeoutId);
		this.timeoutId = null;
	}

	async resolveInterruptedReason(
		requestAborted: boolean
	): Promise<FastChatCancelReason | 'disconnect' | 'cancelled'> {
		if (!requestAborted) return 'cancelled';

		const immediateReason = this.consumeTransientReason() ?? (await this.readSessionReason());
		if (immediateReason) return immediateReason;

		if (this.options.reasonRetryDelayMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, this.options.reasonRetryDelayMs));
		}

		return this.consumeTransientReason() ?? (await this.readSessionReason()) ?? 'disconnect';
	}

	private consumeTransientReason(): FastChatCancelReason | null {
		return consumeTransientFastChatCancelHint({
			userId: this.options.userId,
			streamRunId: this.options.streamRunId
		});
	}

	private async readSessionReason(): Promise<FastChatCancelReason | null> {
		const { data, error } = await this.options.supabase
			.from('chat_sessions')
			.select('agent_metadata')
			.eq('id', this.options.sessionId)
			.eq('user_id', this.options.userId)
			.maybeSingle();

		if (error || !data) return null;
		return readFastChatCancelReasonFromMetadata({
			agentMetadata: data.agent_metadata,
			streamRunId: this.options.streamRunId
		});
	}

	private schedule(): void {
		if (this.stopped || this.options.signal.aborted) return;
		if (this.timeoutId) clearTimeout(this.timeoutId);
		this.timeoutId = setTimeout(
			() => void this.check(),
			Math.max(250, this.options.intervalMs)
		);
	}

	private async check(): Promise<void> {
		if (this.stopped || this.options.signal.aborted) return;
		try {
			const reason = await this.readSessionReason();
			if (reason) {
				this.options.onCancel(reason);
				return;
			}
		} catch (error) {
			this.options.logger.warn('Failed to poll FastChat cancel state', {
				error,
				sessionId: this.options.sessionId,
				streamRunId: this.options.streamRunId
			});
		}
		this.schedule();
	}
}
