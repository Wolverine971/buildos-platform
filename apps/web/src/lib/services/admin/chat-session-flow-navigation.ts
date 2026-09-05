// apps/web/src/lib/services/admin/chat-session-flow-navigation.ts
import { tick } from 'svelte';
import type { SessionFlowTarget } from './chat-session-flow-targets';

export async function revealSessionFlowTarget(
	target: SessionFlowTarget,
	controls: {
		isExpanded: (id: string) => boolean;
		expandEvent: (id: string) => void;
		resetFilters: () => void;
	}
): Promise<void> {
	if (target.auditEventId && !controls.isExpanded(target.auditEventId)) {
		controls.expandEvent(target.auditEventId);
	}
	await tick();
	let element = document.getElementById(target.domId);
	if (!element && target.kind === 'audit') {
		controls.resetFilters();
		await tick();
		element = document.getElementById(target.domId);
	}
	element ??= target.fallbackDomId ? document.getElementById(target.fallbackDomId) : null;
	if (!element) return;

	let ancestor: HTMLElement | null = element;
	while (ancestor) {
		if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
		ancestor = ancestor.parentElement;
	}
	if (target.kind === 'message') {
		element.querySelectorAll('details').forEach((details) => {
			details.open = true;
		});
	}
	await tick();

	document.querySelectorAll('[data-flow-selected]').forEach((previous) => {
		previous.removeAttribute('data-flow-selected');
	});
	element.setAttribute('data-flow-selected', 'true');
	const heading =
		element instanceof HTMLDetailsElement
			? (element.querySelector<HTMLElement>(':scope > summary') ?? element)
			: element;
	// Centering a tall, expanded payload puts its title above the viewport.
	// Land at the heading after opening every enclosing disclosure instead.
	heading.focus({ preventScroll: true });
	heading.scrollIntoView({
		behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
		block: 'start',
		inline: 'nearest'
	});
}
