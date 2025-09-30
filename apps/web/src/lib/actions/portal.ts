// apps/web/src/lib/actions/portal.ts
export function portal(node: HTMLElement, target: string | HTMLElement = 'body') {
	let targetEl: HTMLElement;

	if (typeof target === 'string') {
		targetEl = document.querySelector(target) || document.body;
	} else {
		targetEl = target;
	}

	// Move the node to the target
	targetEl.appendChild(node);

	return {
		destroy() {
			// Remove the node when component is destroyed
			if (node.parentNode) {
				node.parentNode.removeChild(node);
			}
		},
		update(newTarget: string | HTMLElement) {
			// Handle target updates
			if (typeof newTarget === 'string') {
				targetEl = document.querySelector(newTarget) || document.body;
			} else {
				targetEl = newTarget;
			}
			targetEl.appendChild(node);
		}
	};
}
