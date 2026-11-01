// apps/web/src/lib/attachments/portal.ts
import type { Attachment } from 'svelte/attachments';

/**
 * Moves the element to `target` (default `body`) so overlays escape clipping and
 * stacking contexts of their ancestors. Usage: `<div {@attach portal()}>`.
 */
export function portal(target: string | HTMLElement = 'body'): Attachment<HTMLElement> {
	return (node) => {
		const targetEl =
			typeof target === 'string'
				? (document.querySelector<HTMLElement>(target) ?? document.body)
				: target;
		targetEl.appendChild(node);
		return () => node.remove();
	};
}
