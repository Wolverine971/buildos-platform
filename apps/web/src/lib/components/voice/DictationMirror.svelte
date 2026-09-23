<!-- apps/web/src/lib/components/voice/DictationMirror.svelte -->
<!--
	Draws dictated words inside a textarea while the user talks: confirmed words
	solid, draft words grey, a pulse where new words arrive. It mirrors the
	textarea's box and typography exactly and sits on top of it; the textarea's
	own glyphs are made transparent by the host, so wrapping and height stay
	the textarea's own.
-->
<script lang="ts">
	import type { DictationPieces } from '$lib/voice/textarea-dictation';

	let {
		target,
		pieces,
		listening
	}: {
		target: HTMLTextAreaElement | null;
		pieces: DictationPieces;
		listening: boolean;
	} = $props();

	let overlay = $state<HTMLDivElement | null>(null);
	let caret = $state<HTMLSpanElement | null>(null);
	let boxStyle = $state('');

	const COPIED_PROPERTIES = [
		'font-family',
		'font-size',
		'font-weight',
		'font-style',
		'font-variant',
		'line-height',
		'letter-spacing',
		'word-spacing',
		'text-transform',
		'text-indent',
		'text-align',
		'tab-size',
		'padding-top',
		'padding-left',
		'padding-bottom',
		'border-top-width',
		'border-right-width',
		'border-bottom-width',
		'border-left-width',
		'border-radius'
	];

	function measure() {
		if (!target || !overlay?.parentElement) return;
		const computed = getComputedStyle(target);
		const container = overlay.parentElement.getBoundingClientRect();
		const rect = target.getBoundingClientRect();
		const borderX =
			parseFloat(computed.borderLeftWidth) + parseFloat(computed.borderRightWidth);
		// A visible scrollbar narrows the text column; pad the mirror to match.
		const scrollbar = Math.max(0, target.offsetWidth - target.clientWidth - borderX);
		const copied = COPIED_PROPERTIES.map(
			(property) => `${property}:${computed.getPropertyValue(property)}`
		).join(';');
		boxStyle = [
			copied,
			`padding-right:${parseFloat(computed.paddingRight) + scrollbar}px`,
			`top:${rect.top - container.top}px`,
			`left:${rect.left - container.left}px`,
			`width:${rect.width}px`,
			`height:${rect.height}px`
		].join(';');
	}

	function keepCaretInView() {
		if (!target || !overlay || !caret) return;
		const lineHeight = parseFloat(getComputedStyle(target).lineHeight) || 20;
		const caretBottom = caret.offsetTop + lineHeight * 1.4;
		const visibleBottom = target.scrollTop + target.clientHeight;
		if (caretBottom > visibleBottom) {
			target.scrollTop = caretBottom - target.clientHeight;
		} else if (caret.offsetTop < target.scrollTop) {
			target.scrollTop = Math.max(0, caret.offsetTop - lineHeight * 0.4);
		}
		overlay.scrollTop = target.scrollTop;
	}

	$effect(() => {
		if (!target) return;
		measure();
		const observer = new ResizeObserver(() => measure());
		observer.observe(target);
		const onScroll = () => {
			if (overlay && target) overlay.scrollTop = target.scrollTop;
		};
		target.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', measure);
		return () => {
			observer.disconnect();
			target.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', measure);
		};
	});

	$effect(() => {
		// Re-run whenever the dictated text changes.
		void pieces.value;
		queueMicrotask(() => {
			measure();
			keepCaretInView();
		});
	});
</script>

<div bind:this={overlay} class="dictation-mirror" style={boxStyle} aria-hidden="true">
	{pieces.prefix}<span class="text-foreground">{pieces.confirmed}</span>{pieces.separator}<span
		class="text-muted-foreground">{pieces.draft}</span
	><span
		bind:this={caret}
		class="dictation-caret"
		class:dictation-caret-live={listening}
	></span>{pieces.suffix}{'​'}
</div>

<style>
	.dictation-mirror {
		position: absolute;
		z-index: 20;
		box-sizing: border-box;
		overflow: hidden;
		pointer-events: none;
		white-space: pre-wrap;
		overflow-wrap: break-word;
		word-break: normal;
		border-style: solid;
		border-color: transparent;
		background: transparent;
		color: hsl(var(--foreground));
	}

	.dictation-caret {
		display: inline-block;
		width: 2px;
		height: 1em;
		margin-left: 2px;
		vertical-align: text-bottom;
		border-radius: 1px;
		background: hsl(var(--muted-foreground) / 0.5);
	}

	.dictation-caret-live {
		background: hsl(var(--destructive));
		animation: dictation-caret-pulse 1.1s ease-in-out infinite;
	}

	@keyframes dictation-caret-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.25;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.dictation-caret-live {
			animation: none;
		}
	}
</style>
