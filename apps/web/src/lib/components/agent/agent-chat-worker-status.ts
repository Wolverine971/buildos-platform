// apps/web/src/lib/components/agent/agent-chat-worker-status.ts
import type { ChatTurnStatusV1 } from '@buildos/shared-types';

/**
 * One projection for every worker-backed waiting/processing surface. Calm,
 * plain copy: the user sees what BuildOS is doing, never the infrastructure
 * (no "worker", "queue", or transport words). A turn normally sits in `queued`
 * for well under a second, so it reads as the same "Thinking…" as running.
 */
export function workerActivityForStatus(status: ChatTurnStatusV1): string {
	if (status === 'queued' || status === 'running') return 'Thinking…';
	return '';
}
