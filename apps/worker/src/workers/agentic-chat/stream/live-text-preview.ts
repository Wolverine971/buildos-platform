// apps/worker/src/workers/agentic-chat/stream/live-text-preview.ts

import {
	AGENTIC_CHAT_REALTIME_PREVIEW_EVENT,
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION
} from '@buildos/shared-types';
import type {
	AgenticChatLiveTextPreviewPortV1,
	AgenticChatLiveTextPreviewUpdateV1,
	AgenticChatTurnProviderClientPortV1
} from '../provider/contracts';
import type { AgenticChatBroadcastPortV1, AgenticChatStreamPublisher } from './stream-publisher';

export type AgenticChatLiveTextPreviewStatsV1 = {
	sent: number;
	failed: number;
	skipped: number;
};

/** Turn generations whose first preview failure was reported; oldest dropped first. */
const MAX_REPORTED_PREVIEW_FAILURE_TURNS = 256;

/**
 * Broadcasts display-only live previews on the turn's private user channel
 * (AGENTIC_CHAT_LIVE_TEXT_PREVIEW). Every publish is fire-and-forget: nothing is
 * persisted, nothing is awaited by the provider, and a failed or throwing
 * broadcast is counted and logged once per turn generation, never surfaced to
 * the turn. Frames the transport skips (no ready channel, backlog) are counted
 * as skipped, not failed.
 *
 * `seq` comes from one process-wide counter that never runs behind the wall
 * clock, so it strictly increases across all updates of a turn generation even
 * across passes, and would stay ordered across a same-generation restart.
 */
export class AgenticChatLiveTextPreviewBroadcaster implements AgenticChatLiveTextPreviewPortV1 {
	private lastSeq = 0;
	private readonly reportedFailureTurns = new Set<string>();
	private readonly stats: AgenticChatLiveTextPreviewStatsV1 = { sent: 0, failed: 0, skipped: 0 };

	constructor(
		private readonly ports: {
			publisher: Pick<AgenticChatStreamPublisher, 'getLiveTextPreviewTarget'>;
			broadcast: AgenticChatBroadcastPortV1;
			now?: () => number;
			/** Called on a turn generation's first failure; later ones are only counted. */
			onFirstFailure?: (error: unknown, turn: { turnRunId: string }) => void;
		}
	) {}

	publish(update: AgenticChatLiveTextPreviewUpdateV1): void {
		try {
			const target = this.ports.publisher.getLiveTextPreviewTarget(update.turnRunId);
			if (!target || target.executionGeneration !== update.executionGeneration) {
				this.stats.skipped += 1;
				return;
			}
			const seq = this.nextSeq();
			const delivery = this.ports.broadcast.publish({
				kind: 'live_text_preview',
				topic: target.topic,
				event: AGENTIC_CHAT_REALTIME_PREVIEW_EVENT,
				payload: {
					contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
					turn_run_id: update.turnRunId,
					session_id: target.sessionId,
					execution_generation: target.executionGeneration,
					pass_key: update.passKey,
					seq,
					text: update.text,
					state: update.state,
					durable_sequence_floor: target.durableSequenceFloor
				}
			});
			void Promise.resolve(delivery).then(
				(result) => {
					if (result === 'sent') this.stats.sent += 1;
					else if (result === 'skipped') this.stats.skipped += 1;
					else
						this.observeFailure(
							update,
							new Error('Live text preview broadcast failed')
						);
				},
				(error: unknown) => this.observeFailure(update, error)
			);
		} catch (error) {
			this.observeFailure(update, error);
		}
	}

	getStats(): AgenticChatLiveTextPreviewStatsV1 {
		return { ...this.stats };
	}

	private nextSeq(): number {
		const now = this.ports.now?.() ?? Date.now();
		this.lastSeq = Math.max(this.lastSeq + 1, Math.floor(now));
		return this.lastSeq;
	}

	private observeFailure(update: AgenticChatLiveTextPreviewUpdateV1, error: unknown): void {
		this.stats.failed += 1;
		const turnKey = `${update.turnRunId}:${update.executionGeneration}`;
		if (this.reportedFailureTurns.has(turnKey)) return;
		this.reportedFailureTurns.add(turnKey);
		if (this.reportedFailureTurns.size > MAX_REPORTED_PREVIEW_FAILURE_TURNS) {
			const oldest = this.reportedFailureTurns.values().next().value;
			if (oldest !== undefined) this.reportedFailureTurns.delete(oldest);
		}
		try {
			const turn = { turnRunId: update.turnRunId };
			if (this.ports.onFirstFailure) this.ports.onFirstFailure(error, turn);
			else console.warn('Agentic Chat live text preview broadcast failed', turn, error);
		} catch {
			// Preview diagnostics can never reach the turn.
		}
	}
}

/**
 * The acting client, carrying the preview port. Only `stream` and the optional
 * repair hook are forwarded, so the provider sees the same client behaviour.
 */
export function withAgenticChatLiveTextPreviewV1(
	client: AgenticChatTurnProviderClientPortV1,
	livePreview: AgenticChatLiveTextPreviewPortV1
): AgenticChatTurnProviderClientPortV1 {
	const acting: AgenticChatTurnProviderClientPortV1 = {
		stream: (input) => client.stream(input),
		livePreview
	};
	if (client.rejectRepeatedInvalidToolResponse) {
		acting.rejectRepeatedInvalidToolResponse = (input) =>
			client.rejectRepeatedInvalidToolResponse!(input);
	}
	return acting;
}
