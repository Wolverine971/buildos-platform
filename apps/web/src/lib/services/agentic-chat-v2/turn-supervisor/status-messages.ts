// apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/status-messages.ts
import type { TurnDigest } from './types';

export function buildTurnStatusMessage(digest: TurnDigest): string {
	if (digest.risks.includes('repeated_failures')) {
		return 'BuildOS is checking the failed tool results and deciding whether it needs to ask for clarification.';
	}
	if (digest.progress.successfulWrites > 0) {
		return 'BuildOS has made a change and is verifying the final response before finishing.';
	}
	if (digest.risks.includes('low_novelty_reads') || digest.progress.readRounds >= 2) {
		return 'BuildOS has gathered context and is checking whether it has enough to answer now.';
	}
	if (digest.toolCallCount > 0) {
		return 'BuildOS is waiting on a tool result, then it will summarize the next step.';
	}
	return 'BuildOS is still working through the request.';
}
