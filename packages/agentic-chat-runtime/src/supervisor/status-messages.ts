// packages/agentic-chat-runtime/src/supervisor/status-messages.ts
import type { TurnDigest } from './types';

export const AGENTIC_CHAT_SUPERVISOR_BLOCKED_RETRY_ERROR_V1 =
	'Supervisor blocked this exact write retry because the same tool arguments already failed earlier in the turn. Use corrected arguments, the correct tool for the entity kind, or ask one concise clarifying question.';

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
