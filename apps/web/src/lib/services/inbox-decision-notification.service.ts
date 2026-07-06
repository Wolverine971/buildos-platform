// apps/web/src/lib/services/inbox-decision-notification.service.ts
import { notificationStore } from '$lib/stores/notification.store';
import { toastService } from '$lib/stores/toast.store';

type InboxDecisionSourceType = 'agent_run' | 'project_suggestion' | 'calendar_suggestion';
type InboxDecisionAction = 'approve' | 'reject' | 'snooze';

type InboxDecisionNotificationItem = {
	id: string;
	source_type: InboxDecisionSourceType;
	title: string;
};

const COMPLETE_REMOVE_MS = 1800;
const ERROR_REMOVE_MS = 5000;

function decisionVerb(item: InboxDecisionNotificationItem, action: InboxDecisionAction): string {
	if (action === 'snooze') return 'Snoozing';
	if (action === 'reject') {
		return item.source_type === 'calendar_suggestion' ? 'Rejecting' : 'Dismissing';
	}
	if (item.source_type === 'calendar_suggestion') return 'Accepting';
	return 'Applying';
}

function decisionNoun(item: InboxDecisionNotificationItem): string {
	if (item.source_type === 'calendar_suggestion') return 'calendar suggestion';
	if (item.source_type === 'agent_run') return 'agent proposal';
	return 'review item';
}

function removeLater(notificationId: string, delayMs: number): void {
	if (typeof window === 'undefined') return;
	window.setTimeout(() => {
		notificationStore.remove(notificationId);
	}, delayMs);
}

export function startInboxDecisionNotification(
	item: InboxDecisionNotificationItem,
	action: InboxDecisionAction
): string {
	const verb = decisionVerb(item, action);
	const noun = decisionNoun(item);

	return notificationStore.add({
		type: 'generic',
		status: 'processing',
		isMinimized: true,
		isPersistent: true,
		autoCloseMs: null,
		data: {
			title: `${verb} ${noun}`,
			subtitle: item.title,
			message: 'Processing your decision...',
			metadata: {
				source: 'ai_inbox',
				item_id: item.id,
				source_type: item.source_type,
				action
			}
		},
		progress: {
			type: 'indeterminate',
			message: 'Processing your decision...'
		},
		actions: {}
	});
}

export function startInboxBatchDecisionNotification(count: number): string {
	const itemLabel = count === 1 ? 'review item' : 'review items';

	return notificationStore.add({
		type: 'generic',
		status: 'processing',
		isMinimized: true,
		isPersistent: true,
		autoCloseMs: null,
		data: {
			title: `Applying ${count} ${itemLabel}`,
			message: 'Processing your decisions...',
			metadata: {
				source: 'ai_inbox',
				action: 'batch_approve',
				count
			}
		},
		progress: {
			type: 'indeterminate',
			message: 'Processing your decisions...'
		},
		actions: {}
	});
}

export function completeInboxDecisionNotification(
	notificationId: string,
	message: string,
	options: { toastKind?: 'success' | 'info' | 'error'; title?: string } = {}
): void {
	const toastKind = options.toastKind ?? 'success';
	notificationStore.update(notificationId, {
		status: toastKind === 'error' ? 'error' : 'success',
		data: {
			title: options.title ?? 'Inbox decision handled',
			message
		},
		progress: {
			type: 'binary',
			message
		}
	});

	if (toastKind === 'error') toastService.error(message);
	else if (toastKind === 'info') toastService.info(message);
	else toastService.success(message);

	removeLater(notificationId, toastKind === 'error' ? ERROR_REMOVE_MS : COMPLETE_REMOVE_MS);
}

export function failInboxDecisionNotification(notificationId: string, message: string): void {
	notificationStore.update(notificationId, {
		status: 'error',
		data: {
			title: 'Inbox decision failed',
			message,
			error: message
		},
		progress: {
			type: 'binary',
			message
		}
	});
	toastService.error(message);
	removeLater(notificationId, ERROR_REMOVE_MS);
}
