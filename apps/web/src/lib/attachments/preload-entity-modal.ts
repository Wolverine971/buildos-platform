// apps/web/src/lib/attachments/preload-entity-modal.ts
import type { Attachment } from 'svelte/attachments';
import { preloadProjectEntityModal } from '$lib/components/project/project-entity-modal-loader';

const INTENT_EVENTS = ['pointerenter', 'pointerdown', 'focusin'] as const;

/**
 * Warms editor code on pointer/keyboard intent without fetching editable data.
 * Usage: `<button {@attach preloadEntityModal('task')}>`.
 */
export function preloadEntityModal(entityType: string): Attachment<HTMLElement> {
	return (node) => {
		let pending = false;
		function preload() {
			const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
				.connection;
			if (pending || connection?.saveData) return;
			pending = true;
			void preloadProjectEntityModal(entityType).catch(() => {
				// The actual open path reports failures; another interaction can retry.
				pending = false;
			});
		}
		for (const event of INTENT_EVENTS) node.addEventListener(event, preload, { passive: true });
		return () => {
			for (const event of INTENT_EVENTS) node.removeEventListener(event, preload);
		};
	};
}
