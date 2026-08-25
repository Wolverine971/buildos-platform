import type { ChatTurnStatusV1 } from '@buildos/shared-types';

/** One projection for every worker-backed waiting/processing surface. */
export function workerActivityForStatus(status: ChatTurnStatusV1): string {
	if (status === 'queued') return 'Waiting for an available worker...';
	if (status === 'running') return 'Processing...';
	return '';
}
