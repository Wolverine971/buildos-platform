<!-- apps/web/src/lib/components/scheduling/CalendarItemDrawer.svelte -->
<script lang="ts">
	import { fly } from 'svelte/transition';
	import { browser } from '$app/environment';
	import { portal } from '$lib/actions/portal';
	import { slideMotion } from '$lib/components/project/v2/board-a11y';
	import { X } from '$lib/icons/lucide';
	import { lockBodyScroll, unlockBodyScroll } from '$lib/utils/body-scroll-lock';
	import { tick, type Snippet } from 'svelte';

	interface InertNodeState {
		node: Element;
		ariaHidden: string | null;
		wasInert: boolean;
	}

	let {
		isOpen = false,
		title = '',
		subtitle = '',
		onClose = () => {},
		children
	}: {
		isOpen?: boolean;
		title?: string;
		subtitle?: string;
		onClose?: () => void;
		children?: Snippet;
	} = $props();

	const propsId = $props.id();
	const titleId = `calendar-item-drawer-${propsId}-title`;
	const subtitleId = `calendar-item-drawer-${propsId}-subtitle`;
	const focusableSelector =
		'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

	let portalRootElement = $state<HTMLElement | null>(null);
	let drawerElement = $state<HTMLElement | null>(null);
	let elementToRestoreFocus: HTMLElement | null = null;
	let inertNodeStates: InertNodeState[] = [];

	function drawerMotion(duration: number): { x: number; duration: number } {
		return { x: 400, ...slideMotion(duration) };
	}

	function getFocusableElements(): HTMLElement[] {
		if (!drawerElement) return [];
		return Array.from(drawerElement.querySelectorAll<HTMLElement>(focusableSelector)).filter(
			(element) => !element.hasAttribute('disabled') && element.tabIndex !== -1
		);
	}

	function closeFromKeyboard(event: KeyboardEvent) {
		if (!isOpen) return;
		if (event.key !== 'Escape') return;
		// Base Modals stack above this drawer and route Escape to their topmost
		// instance; if any is open, the drawer must not also close underneath it.
		if (document.querySelector('.modal-root')) return;
		event.preventDefault();
		onClose();
	}

	function handleDrawerKeydown(event: KeyboardEvent) {
		if (!isOpen) return;
		if (event.key === 'Escape') {
			closeFromKeyboard(event);
			return;
		}
		if (event.key !== 'Tab') return;

		const focusableElements = getFocusableElements();
		const first = focusableElements.at(0);
		const last = focusableElements.at(-1);
		if (!first || !last) {
			event.preventDefault();
			drawerElement?.focus();
			return;
		}

		const activeElement = document.activeElement;
		if (event.shiftKey && activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented) return;
		closeFromKeyboard(event);
	}

	function markBackgroundInert() {
		if (!browser || !portalRootElement) return;
		clearBackgroundInert();
		inertNodeStates = Array.from(document.body.children)
			.filter((node) => node !== portalRootElement)
			.map((node) => ({
				node,
				ariaHidden: node.getAttribute('aria-hidden'),
				wasInert: node.hasAttribute('inert')
			}));

		for (const { node } of inertNodeStates) {
			node.setAttribute('inert', '');
			node.setAttribute('aria-hidden', 'true');
		}
	}

	function clearBackgroundInert() {
		for (const { node, ariaHidden, wasInert } of inertNodeStates) {
			if (!wasInert) node.removeAttribute('inert');
			if (ariaHidden === null) {
				node.removeAttribute('aria-hidden');
			} else {
				node.setAttribute('aria-hidden', ariaHidden);
			}
		}
		inertNodeStates = [];
	}

	$effect(() => {
		if (!browser || !isOpen) return;
		lockBodyScroll();
		elementToRestoreFocus =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;

		let cancelled = false;
		void tick().then(() => {
			if (cancelled) return;
			markBackgroundInert();
			const closeControl = drawerElement?.querySelector<HTMLElement>(
				'[data-calendar-item-drawer-close]'
			);
			const firstFocusable = getFocusableElements().at(0);
			(closeControl ?? firstFocusable ?? drawerElement)?.focus();
		});

		return () => {
			cancelled = true;
			clearBackgroundInert();
			unlockBodyScroll();
			elementToRestoreFocus?.focus?.();
			elementToRestoreFocus = null;
		};
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if isOpen}
	<div bind:this={portalRootElement} use:portal class="fixed inset-0 z-50">
		<button
			type="button"
			class="absolute inset-0 bg-black/30"
			aria-label="Close drawer"
			onclick={onClose}
		></button>
		<div
			bind:this={drawerElement}
			role="dialog"
			aria-modal="true"
			aria-labelledby={titleId}
			aria-describedby={subtitle ? subtitleId : undefined}
			tabindex="-1"
			onkeydown={handleDrawerKeydown}
			class="absolute right-0 top-0 flex h-full w-full max-w-lg flex-col border-l border-border bg-background shadow-ink-strong tx tx-frame tx-weak"
			in:fly={drawerMotion(180)}
			out:fly={drawerMotion(160)}
		>
			<header
				class="shrink-0 border-b border-border px-4 py-3 bg-muted/30 tx tx-strip tx-weak"
			>
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0 flex-1">
						<h2
							id={titleId}
							class="text-sm font-semibold text-foreground leading-tight truncate"
						>
							{title}
						</h2>
						{#if subtitle}
							<p id={subtitleId} class="micro-label mt-0.5">
								{subtitle}
							</p>
						{/if}
					</div>
					<button
						class="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted pressable transition-colors motion-reduce:transition-none"
						aria-label="Close drawer"
						onclick={onClose}
						data-calendar-item-drawer-close
					>
						<X class="h-4 w-4" />
					</button>
				</div>
			</header>
			<div
				class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
			>
				{@render children?.()}
			</div>
		</div>
	</div>
{/if}
