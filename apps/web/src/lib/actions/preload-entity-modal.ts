// apps/web/src/lib/actions/preload-entity-modal.ts
import { preloadProjectEntityModal } from '$lib/components/project/project-entity-modal-loader';

/** Warm editor code on pointer/keyboard intent without fetching editable data. */
export function preloadEntityModal(node: HTMLElement, entityType: string) {
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
	const events = ['pointerenter', 'pointerdown', 'focusin'] as const;
	for (const event of events) node.addEventListener(event, preload, { passive: true });
	return {
		update(nextType: string) {
			if (entityType === nextType) return;
			entityType = nextType;
			pending = false;
		},
		destroy() {
			for (const event of events) node.removeEventListener(event, preload);
		}
	};
}
