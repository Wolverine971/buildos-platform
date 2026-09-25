<!-- apps/web/src/lib/components/agent/AgentMessageList.svelte -->
<!-- INKPRINT Design System: Message list with semantic textures -->
<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { prefersReducedMotion } from 'svelte/motion';
	import ThinkingBlock from './ThinkingBlock.svelte';
	import CreatedEntityCards from './CreatedEntityCards.svelte';
	import DocumentChangeCards from './DocumentChangeCards.svelte';
	import FreshnessRadarCard from './FreshnessRadarCard.svelte';
	import CaptureReceiptChip from './CaptureReceiptChip.svelte';
	import { ArrowDown } from '$lib/icons/lucide';
	import { getProseClasses } from '$lib/utils/markdown';
	import {
		AgentMarkdownStreamRenderer,
		observeAgentMarkdownTables,
		renderAgentMarkdown,
		renderAgentMessageBlocks
	} from './agent-chat-markdown';
	import type { UIMessage, ThinkingBlockMessage } from './agent-chat.types';
	import { shouldRenderAsMarkdown, formatTime } from './agent-chat-formatters';
	import {
		classifyMessageListUpdate,
		followStateAfter,
		hiddenContentBelow,
		latestScrollTop,
		messageRenderKey,
		pinScrollTop,
		replyRoomFloor,
		shouldFollowLatest,
		type MessageListUpdate,
		type ScrollerGeometry
	} from './agent-chat-scroll-policy';
	import {
		REVEAL_DEFAULT_WINDOW_MS,
		nextRevealLength,
		nextRevealWindow
	} from './agent-chat-stream-reveal';
	import { dev } from '$app/environment';
	import VoiceNoteGroupPanel from '$lib/components/voice-notes/VoiceNoteGroupPanel.svelte';
	import type { VoiceNote } from '$lib/types/voice-notes';
	import type { ChatContextType, FreshnessCardPayloadV1 } from '@buildos/shared-types';
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import type { AgentClientActionCompletion } from './agent-chat-client-actions';
	import type { DocumentChangeCard } from './document-change-cards';

	interface Props {
		messages: UIMessage[];
		onToggleThinkingBlock: (blockId: string) => void;
		onScroll: () => void;
		displayContextLabel: string;
		container?: HTMLElement;
		voiceNotesByGroupId?: Record<string, VoiceNote[]>;
		onDeleteVoiceNote?: (groupId: string, noteId: string) => void;
		onSelectSuggestion?: (text: string) => void;
		onClientActionComplete?: (completion: AgentClientActionCompletion) => void | Promise<void>;
		/** Freshness radar card "Fix in chat": pre-fill the composer with this text. */
		onDraftInChat?: (text: string) => void;
		onReviewDeeper?: (card: FreshnessCardPayloadV1) => void;
		/** A document change card's Undo succeeded (refresh open views, persist "Undone"). */
		onDocumentChangeUndone?: (
			messageId: string,
			card: DocumentChangeCard,
			document: Record<string, unknown> | null
		) => void;
		reviewProjectId?: string | null;
		reviewDisabled?: boolean;
		selectedContextType?: ChatContextType | null;
		resolvedProjectFocus?: ProjectFocus | null;
		/** Id of the assistant message currently receiving streamed text, if any. */
		streamingMessageId?: string | null;
		/**
		 * Display-only live answer preview for the streaming bubble of this turn.
		 * Rendered after the durable text; never part of the message itself.
		 */
		livePreview?: { turnRunId: string; text: string } | null;
		/** Reduce empty-state and message chrome for constrained embedded conversations. */
		compact?: boolean;
	}

	let {
		messages,
		onToggleThinkingBlock,
		onScroll,
		displayContextLabel,
		container = $bindable(),
		voiceNotesByGroupId = {},
		onDeleteVoiceNote,
		onSelectSuggestion,
		onClientActionComplete,
		onDraftInChat,
		onReviewDeeper,
		onDocumentChangeUndone,
		reviewProjectId = null,
		reviewDisabled = false,
		selectedContextType = null,
		resolvedProjectFocus = null,
		streamingMessageId = null,
		livePreview = null,
		compact = false
	}: Props = $props();

	const proseClasses = getProseClasses('sm');
	const rowKey = messageRenderKey;

	// ── Streaming text ──────────────────────────────────────────────────────
	// Streaming and finalized assistant bubbles share one render branch: a
	// keyed list of sanitized markdown blocks. While streaming, only the tail
	// block is re-parsed (AgentMarkdownStreamRenderer); when the turn ends the
	// finalized pass reuses the cached block HTML, so every `{@html}` except
	// possibly the tail is a no-op and the bubble keeps its DOM (and selection).
	let streamRenderer: { key: string; renderer: AgentMarkdownStreamRenderer } | null = null;
	/** Rows that streamed as markdown keep that mode once finalized (no flip). */
	const markdownRowKeys = new Set<string>();

	// Reveal: the displayed length of the streaming message eases toward the
	// received length (agent-chat-stream-reveal), ~30 steps/s, whole words. It
	// only lags the stream by about one chunk interval and snaps to full text
	// when the message stops streaming, on reduced motion, or for resumed text.
	let reveal = $state.raw<{ key: string; shown: number } | null>(null);
	let revealText = '';
	let revealWindowMs = REVEAL_DEFAULT_WINDOW_MS;
	let lastChunkAt = 0;
	let lastRevealStepAt = 0;
	let revealFrame: number | null = null;
	const REVEAL_STEP_MIN_MS = 32;
	/** Text already this long when streaming starts (a resume) paints at once. */
	const REVEAL_SNAP_INITIAL_CHARS = 400;
	/** Follow-after-tap (scroll policy below): set only by the pill mid-stream. */
	let followingLatest = false;

	function hasLivePreview(message: UIMessage): boolean {
		return (
			livePreview !== null &&
			message.id === streamingMessageId &&
			message.metadata?.turn_run_id === livePreview.turnRunId
		);
	}

	/** Durable text, plus the live preview on the streaming bubble. */
	function assistantDisplayText(message: UIMessage): string {
		const content = message.content ?? '';
		return hasLivePreview(message) ? content + livePreview!.text : content;
	}

	const streamingMessage = $derived.by(() => {
		if (!streamingMessageId) return null;
		for (let index = messages.length - 1; index >= 0; index -= 1) {
			const message = messages[index];
			if (message?.id === streamingMessageId) {
				return message.type === 'assistant' ? message : null;
			}
		}
		return null;
	});

	function cancelRevealFrame() {
		if (revealFrame !== null && typeof cancelAnimationFrame === 'function') {
			cancelAnimationFrame(revealFrame);
		}
		revealFrame = null;
	}

	function scheduleRevealFrame() {
		if (revealFrame !== null || typeof requestAnimationFrame !== 'function') return;
		revealFrame = requestAnimationFrame(stepReveal);
	}

	function stepReveal(now: number) {
		revealFrame = null;
		const current = reveal;
		if (!current || current.shown >= revealText.length) return;
		const elapsed = now - lastRevealStepAt;
		if (elapsed < REVEAL_STEP_MIN_MS) {
			scheduleRevealFrame();
			return;
		}
		lastRevealStepAt = now;
		const shown = nextRevealLength(
			revealText,
			current.shown,
			Math.min(elapsed, 120),
			revealWindowMs
		);
		reveal = { key: current.key, shown };
		if (shown < revealText.length) scheduleRevealFrame();
	}

	function syncReveal(key: string | null, text: string) {
		if (!key || prefersReducedMotion.current || typeof requestAnimationFrame !== 'function') {
			cancelRevealFrame();
			if (reveal !== null) reveal = null;
			revealText = text;
			return;
		}
		const now = performance.now();
		const previous = reveal;
		let next: { key: string; shown: number };
		if (!previous || previous.key !== key) {
			next = { key, shown: text.length > REVEAL_SNAP_INITIAL_CHARS ? text.length : 0 };
			revealWindowMs = REVEAL_DEFAULT_WINDOW_MS;
			lastChunkAt = now;
			lastRevealStepAt = now - REVEAL_STEP_MIN_MS;
		} else {
			next = previous;
			if (text !== revealText) {
				// Upstream rewrote already-shown text: show the new text as-is.
				if (!text.startsWith(revealText.slice(0, previous.shown))) {
					next = { key, shown: text.length };
				}
				revealWindowMs = nextRevealWindow(revealWindowMs, now - lastChunkAt);
				lastChunkAt = now;
			}
		}
		if (next !== previous) reveal = next;
		revealText = text;
		if (next.shown < text.length) scheduleRevealFrame();
	}

	// Pre-effect: the first paint of a new chunk must already use the reveal
	// length, or the whole chunk would flash for a frame.
	$effect.pre(() => {
		const message = streamingMessage;
		const key = message ? rowKey(message) : null;
		const text = message ? assistantDisplayText(message) : '';
		untrack(() => {
			syncReveal(key, text);
			// Stream over: stop following and leave the scroll where it is.
			if (!key && followingLatest) followingLatest = followStateAfter('stream-end', false);
		});
	});

	/** Text + block HTML for an assistant bubble; `blocks === null` → plain text. */
	function assistantBody(
		message: UIMessage,
		isStreaming: boolean
	): { text: string; blocks: string[] | null } {
		const key = rowKey(message);
		const content = assistantDisplayText(message);
		if (!isStreaming) {
			return {
				text: content,
				blocks: renderAgentMessageBlocks(content, {
					forceMarkdown: markdownRowKeys.has(key)
				})
			};
		}
		const current = reveal;
		const text =
			current && current.key === key && current.shown < content.length
				? content.slice(0, current.shown)
				: content;
		if (streamRenderer?.key !== key) {
			streamRenderer = { key, renderer: new AgentMarkdownStreamRenderer() };
		}
		const blocks = streamRenderer.renderer.render(text);
		if (blocks) markdownRowKeys.add(key);
		return { text, blocks };
	}

	// ── Conversation scroll policy ──────────────────────────────────────────
	// Claude.ai-style turns: a message sent from this client is pinned to the
	// top of the viewport and the reply fills the room below it. Streamed growth
	// is never auto-followed; a "Jump to latest" pill appears instead. Session
	// restores jump straight to the latest content. Scrolls started here are
	// not reported to `onScroll` until they settle, so the parent's
	// userHasScrolled flag only ever reflects where the reader really is.
	//
	// Reply room: rather than a flow spacer resized after layout (which lets
	// the browser clamp scrollTop for a frame when the turn shrinks — the
	// "collapse jump"), an absolutely positioned floor marks the lowest point
	// content must reach: pinned offset + one viewport. It persists until the
	// next pin or a wholesale reset.

	let contentEnd = $state<HTMLDivElement | undefined>(undefined);
	let replyFloor = $state<HTMLDivElement | undefined>(undefined);
	let showJumpToLatest = $state(false);
	let renderedKeys: ReadonlySet<string> = new Set();
	let pinnedKey: string | null = null;
	let pinnedRow: HTMLElement | null = null;
	let liveTurnStart: { key: string; row: HTMLElement } | null = null;
	/** Per-row entrance decision, fixed at first render so it never replays. */
	const entranceByKey = new Map<string, boolean>();
	let programmaticScroll = false;
	/** The in-flight programmatic scroll is a smooth glide (don't cut it short). */
	let smoothScrollInFlight = false;
	let settleTimer: ReturnType<typeof setTimeout> | null = null;
	let settleDeadline = 0;
	let loadCorrectionFrame: number | null = null;
	let loadCorrectionsLeft = 0;
	let measureFrame: number | null = null;
	let resizeObserver: ResizeObserver | null = null;
	const observedRows = new Set<Element>();
	let paddingCache: { top: number; bottom: number } | null = null;

	const JUMP_PILL_THRESHOLD_PX = 48;
	const SETTLE_IDLE_MS = 140;
	const SETTLE_MAX_MS = 1200;
	/** Frames to re-land a restore while off-screen rows swap placeholders for real sizes. */
	const LOAD_CORRECTION_FRAMES = 6;

	const lastUserKey = $derived.by(() => {
		for (let index = messages.length - 1; index >= 0; index -= 1) {
			const message = messages[index];
			if (message?.type === 'user') return rowKey(message);
		}
		return null;
	});

	/**
	 * Client-originated sends (delivery set when first seen) get the send
	 * entrance; other rows animate only when they arrive after the first
	 * population. Restored history never animates.
	 */
	function playsEntrance(message: UIMessage): boolean {
		const key = rowKey(message);
		let plays = entranceByKey.get(key);
		if (plays === undefined) {
			plays =
				message.type === 'user' ? message.delivery !== undefined : renderedKeys.size > 0;
			entranceByKey.set(key, plays);
		}
		return plays;
	}

	function readGeometry(scroller: HTMLElement): ScrollerGeometry {
		if (!paddingCache) {
			const style = getComputedStyle(scroller);
			paddingCache = {
				top: parseFloat(style.paddingTop) || 0,
				bottom: parseFloat(style.paddingBottom) || 0
			};
		}
		return {
			scrollTop: scroller.scrollTop,
			clientHeight: scroller.clientHeight,
			scrollerTop: scroller.getBoundingClientRect().top,
			paddingTop: paddingCache.top,
			paddingBottom: paddingCache.bottom
		};
	}

	function findRow(key: string): HTMLElement | null {
		const scroller = container;
		if (!scroller) return null;
		for (const child of scroller.children) {
			if (child instanceof HTMLElement && child.dataset.rowKey === key) return child;
		}
		return null;
	}

	let appliedReplyFloor: { element: HTMLElement; top: number | null } | null = null;

	function setReplyFloor(floor: number | null) {
		if (!replyFloor) return;
		const top = floor === null ? null : Math.max(0, Math.round(floor) - 1);
		if (appliedReplyFloor?.element === replyFloor && appliedReplyFloor.top === top) return;
		appliedReplyFloor = { element: replyFloor, top };
		if (top === null) {
			replyFloor.style.display = 'none';
			return;
		}
		replyFloor.style.display = '';
		replyFloor.style.top = `${top}px`;
	}

	function armSettle() {
		if (settleTimer !== null) clearTimeout(settleTimer);
		const remaining = Math.max(0, settleDeadline - performance.now());
		settleTimer = setTimeout(finishProgrammaticScroll, Math.min(SETTLE_IDLE_MS, remaining));
	}

	function finishProgrammaticScroll() {
		if (settleTimer !== null) clearTimeout(settleTimer);
		settleTimer = null;
		smoothScrollInFlight = false;
		if (!programmaticScroll) return;
		programmaticScroll = false;
		// One report of where the scroll landed, never the frames in between.
		onScroll();
		scheduleMeasure();
	}

	function cancelLoadCorrection() {
		if (loadCorrectionFrame !== null && typeof cancelAnimationFrame === 'function') {
			cancelAnimationFrame(loadCorrectionFrame);
		}
		loadCorrectionFrame = null;
		loadCorrectionsLeft = 0;
	}

	/** Wheel / touch / pointer / key input: the reader owns the scroll now. */
	function handleUserIntent() {
		cancelLoadCorrection();
		followingLatest = followStateAfter('user-input', streamingMessage !== null);
		smoothScrollInFlight = false;
		if (!programmaticScroll) return;
		if (settleTimer !== null) clearTimeout(settleTimer);
		settleTimer = null;
		programmaticScroll = false;
	}

	function scrollScrollerTo(top: number, smooth: boolean) {
		const scroller = container;
		if (!scroller) return;
		const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
		const target = Math.min(Math.max(0, Math.round(top)), maxTop);
		if (Math.abs(scroller.scrollTop - target) < 1) return;
		programmaticScroll = true;
		settleDeadline = performance.now() + SETTLE_MAX_MS;
		armSettle();
		const behavior: ScrollBehavior =
			smooth && !prefersReducedMotion.current ? 'smooth' : 'auto';
		smoothScrollInFlight = behavior === 'smooth';
		if (typeof scroller.scrollTo === 'function') {
			scroller.scrollTo({ top: target, behavior });
		} else {
			scroller.scrollTop = target;
		}
	}

	function scrollToLatestNow(smooth: boolean) {
		const scroller = container;
		if (!scroller || !contentEnd) return;
		const geometry = readGeometry(scroller);
		const target = latestScrollTop(geometry, contentEnd.getBoundingClientRect().top);
		// The latest content is already in view (e.g. inside the reply room).
		if (target <= geometry.scrollTop + 1) return;
		scrollScrollerTo(target, smooth);
	}

	/**
	 * Scroll to the end of real content (never into the reply room below it).
	 * No-op when the latest content is already visible. The modal calls this
	 * when the mobile keyboard opens.
	 */
	export function scrollToLatest(options: { smooth?: boolean } = {}): void {
		cancelLoadCorrection();
		scrollToLatestNow(options.smooth ?? false);
	}

	/** The pill: glide to the latest; mid-stream, keep following its growth. */
	function jumpToLatestFromPill() {
		followingLatest = followStateAfter('jump-tap', streamingMessage !== null);
		scrollToLatest({ smooth: true });
		if (followingLatest) showJumpToLatest = false;
	}

	function pinRow(key: string) {
		const scroller = container;
		cancelLoadCorrection();
		followingLatest = followStateAfter('pin', streamingMessage !== null);
		pinnedKey = key;
		pinnedRow = findRow(key);
		if (!scroller || !pinnedRow) {
			setReplyFloor(null);
			return;
		}
		const geometry = readGeometry(scroller);
		const target = pinScrollTop(geometry, pinnedRow.getBoundingClientRect().top);
		// Floor first, so the target is reachable before the scroll starts.
		setReplyFloor(replyRoomFloor(target, geometry.clientHeight));
		scrollScrollerTo(target, true);
	}

	function jumpToLatestAfterLoad() {
		cancelLoadCorrection();
		followingLatest = followStateAfter('load', streamingMessage !== null);
		pinnedKey = null;
		pinnedRow = null;
		setReplyFloor(null);
		loadCorrectionsLeft = LOAD_CORRECTION_FRAMES;
		const land = () => {
			loadCorrectionFrame = null;
			scrollToLatestNow(false);
			loadCorrectionsLeft -= 1;
			if (loadCorrectionsLeft > 0 && typeof requestAnimationFrame === 'function') {
				loadCorrectionFrame = requestAnimationFrame(land);
			}
		};
		land();
	}

	function resetScrollPolicy() {
		cancelLoadCorrection();
		followingLatest = followStateAfter('reset', false);
		pinnedKey = null;
		pinnedRow = null;
		liveTurnStart = null;
		setReplyFloor(null);
		entranceByKey.clear();
		markdownRowKeys.clear();
		streamRenderer = null;
		showJumpToLatest = false;
	}

	/** Watch the live turn's rows so growth updates the pill without polling. */
	function observeLiveTurn() {
		if (!resizeObserver || !contentEnd) return;
		const key = lastUserKey;
		if (!key) {
			liveTurnStart = null;
		} else if (liveTurnStart?.key !== key || !liveTurnStart.row.isConnected) {
			const row = findRow(key);
			liveTurnStart = row ? { key, row } : null;
		}
		const wanted = new Set<Element>();
		let row: Element | null = liveTurnStart?.row ?? contentEnd.previousElementSibling;
		while (row && row !== contentEnd) {
			wanted.add(row);
			row = row.nextElementSibling;
		}
		for (const observed of observedRows) {
			if (wanted.has(observed)) continue;
			resizeObserver.unobserve(observed);
			observedRows.delete(observed);
		}
		for (const target of wanted) {
			if (observedRows.has(target)) continue;
			resizeObserver.observe(target);
			observedRows.add(target);
		}
	}

	function scheduleMeasure() {
		if (measureFrame !== null || typeof requestAnimationFrame !== 'function') return;
		measureFrame = requestAnimationFrame(measure);
	}

	/** One batched read pass, then writes: reply floor and pill visibility. */
	function measure() {
		measureFrame = null;
		const scroller = container;
		if (!scroller || !contentEnd) {
			if (showJumpToLatest) showJumpToLatest = false;
			return;
		}
		const geometry = readGeometry(scroller);
		const contentEndTop = contentEnd.getBoundingClientRect().top;
		if (pinnedKey && !pinnedRow?.isConnected) pinnedRow = findRow(pinnedKey);
		const pinnedTop = pinnedRow ? pinnedRow.getBoundingClientRect().top : null;

		if (pinnedKey) {
			if (pinnedTop === null) {
				pinnedKey = null;
				setReplyFloor(null);
			} else {
				setReplyFloor(
					replyRoomFloor(pinScrollTop(geometry, pinnedTop), geometry.clientHeight)
				);
			}
		}
		const hiddenBelow = hiddenContentBelow(geometry, contentEndTop);
		if (shouldFollowLatest({ following: followingLatest, smoothScrollInFlight, hiddenBelow })) {
			scrollScrollerTo(latestScrollTop(geometry, contentEndTop), false);
		}
		const next = !followingLatest && hiddenBelow > JUMP_PILL_THRESHOLD_PX;
		if (next !== showJumpToLatest) showJumpToLatest = next;
	}

	function handleScroll() {
		if (programmaticScroll) {
			armSettle();
		} else {
			// A scroll we didn't start (scrollbar, keys from outside) ends following.
			if (followingLatest) followingLatest = followStateAfter('user-scroll', true);
			onScroll();
		}
		scheduleMeasure();
	}

	/** Scroller wiring that needs passive native listeners and cleanup. */
	const trackScroller: Attachment<HTMLElement> = (scroller) => {
		const passive = { passive: true } as const;
		const intentEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
		const handleScrollEnd = () => {
			if (programmaticScroll) finishProgrammaticScroll();
		};
		for (const type of intentEvents) scroller.addEventListener(type, handleUserIntent, passive);
		scroller.addEventListener('scrollend', handleScrollEnd, passive);

		if (typeof ResizeObserver !== 'undefined') {
			resizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) {
					if (entry.target === scroller) paddingCache = null;
				}
				scheduleMeasure();
			});
			resizeObserver.observe(scroller);
			// Untracked: reading reactive refs here would re-run (tear down) the attachment.
			untrack(observeLiveTurn);
		}

		return () => {
			for (const type of intentEvents) scroller.removeEventListener(type, handleUserIntent);
			scroller.removeEventListener('scrollend', handleScrollEnd);
			resizeObserver?.disconnect();
			resizeObserver = null;
			observedRows.clear();
		};
	};

	// Runs after the DOM reflects `messages`, so new rows can be measured.
	$effect(() => {
		const list = messages;
		untrack(() => {
			const { update, keys } = classifyMessageListUpdate(renderedKeys, list);
			renderedKeys = keys;
			applyListUpdate(update);
		});
	});

	function applyListUpdate(update: MessageListUpdate) {
		if (update.kind === 'reset') resetScrollPolicy();
		else if (update.kind === 'load') jumpToLatestAfterLoad();
		else if (update.kind === 'pin') pinRow(update.key);
		observeLiveTurn();
		scheduleMeasure();
	}

	// Reveal steps change the bubble between messages updates; keep the pill honest.
	$effect(() => {
		if (reveal) scheduleMeasure();
	});

	onDestroy(() => {
		cancelRevealFrame();
		cancelLoadCorrection();
		if (settleTimer !== null) clearTimeout(settleTimer);
		settleTimer = null;
		if (measureFrame !== null && typeof cancelAnimationFrame === 'function') {
			cancelAnimationFrame(measureFrame);
		}
		measureFrame = null;
	});

	// Per-context suggestion sets shown in the empty-state card.
	// Project context branches further on focus type so entity-focused chats
	// get prompts that operate on the focused entity rather than the project.
	const emptyStateSuggestions = $derived.by<string[]>(() => {
		const focusType = resolvedProjectFocus?.focusType ?? null;
		const focusName = resolvedProjectFocus?.focusEntityName ?? null;

		switch (selectedContextType) {
			case 'global':
				return [
					'What should I work on today?',
					'Summarize what is in flight across my projects',
					'Help me plan this week'
				];
			case 'project_create':
				return [
					'I have a rough idea for a project',
					'Help me structure a vague goal',
					'Turn this brain dump into a project'
				];
			case 'project':
				if (focusType && focusType !== 'project-wide' && focusName) {
					return [
						`Tell me about ${focusName}`,
						`What needs to happen next on ${focusName}?`,
						`Update ${focusName}`
					];
				}
				return [
					'Summarize where this project stands',
					'Draft the next update',
					'What should we do next?'
				];
			case 'calendar':
				return [
					"What's on my calendar this week?",
					'Find time for a deep-work block',
					'Reschedule low-priority items'
				];
			case 'daily_brief':
				return [
					"Summarize today's brief",
					'What did I miss?',
					'What should I tackle first?'
				];
			case 'daily_brief_update':
				return [
					'Add more on a specific project',
					'Reduce noise in my brief',
					'Drop reminders I no longer need'
				];
			default:
				return [
					'Summarize where this stands',
					'Draft the next update',
					'What should we do next?'
				];
		}
	});

	const USER_MESSAGE_PREVIEW_LINES = 10;
	const USER_MESSAGE_COLLAPSE_CHAR_THRESHOLD = 800;

	let expandedUserMessages = $state<Record<string, boolean>>({});

	function getLineCount(content: string): number {
		return content.split(/\r\n|\r|\n/).length;
	}

	function isCollapsibleUserMessage(message: UIMessage): boolean {
		if (message.type !== 'user') return false;
		const content = message.content?.trim() ?? '';
		if (!content) return false;
		if (message.metadata?.attachment_only === true) return false;
		return (
			getLineCount(content) > USER_MESSAGE_PREVIEW_LINES ||
			content.length > USER_MESSAGE_COLLAPSE_CHAR_THRESHOLD
		);
	}

	function hasVisibleUserText(message: UIMessage): boolean {
		return Boolean(message.content?.trim()) && message.metadata?.attachment_only !== true;
	}

	function attachmentPreviewUrl(
		attachment: NonNullable<UIMessage['attachments']>[number]
	): string | null {
		const previewUrl = attachment.metadata?.preview_url;
		if (typeof previewUrl === 'string') return previewUrl;
		if (attachment.attachment_kind === 'onto_asset' && attachment.asset_id) {
			return `/api/onto/assets/${attachment.asset_id}/render?width=160`;
		}
		return null;
	}

	function isUserMessageExpanded(messageId: string): boolean {
		return expandedUserMessages[messageId] ?? false;
	}

	function toggleUserMessageExpansion(messageId: string): void {
		expandedUserMessages = {
			...expandedUserMessages,
			[messageId]: !(expandedUserMessages[messageId] ?? false)
		};
	}
</script>

<!-- INKPRINT message container with muted background -->
<!--
	Scroll policy lives in this component (see "Conversation scroll policy"):
	pin-to-top on send, no auto-follow, jump-to-latest pill. Native scroll
	anchoring stays off (overflow-anchor: none) so streamed growth never drags
	the reader. The scroller is `relative` so the reply-room floor (absolute)
	extends its scrollable area.
-->
<div class="agent-chat-list relative flex min-h-0 flex-1 flex-col">
	<div
		bind:this={container}
		{@attach observeAgentMarkdownTables}
		{@attach trackScroller}
		onscroll={handleScroll}
		class="agent-chat-scroll relative flex-1 min-h-0 overflow-y-auto overscroll-contain {compact
			? 'agent-chat-scroll-compact space-y-2 bg-card p-2 sm:p-3'
			: 'space-y-3 bg-muted p-3 sm:p-4 lg:px-6 lg:py-4'}"
		style="overflow-anchor: none; -webkit-overflow-scrolling: touch;"
	>
		{#if messages.length === 0}
			{#if compact}
				<div class="flex h-full min-h-24 items-center justify-center px-4 text-center">
					<p class="max-w-md text-xs leading-relaxed text-muted-foreground">
						Ask BuildOS to explain, rewrite, or update this document.
					</p>
				</div>
			{:else}
				<!-- INKPRINT empty state card with Bloom texture (creation/new) -->
				<div
					class="rounded-lg border border-dashed border-border bg-card p-3 tx tx-bloom tx-weak shadow-ink sm:p-4"
				>
					<div class="space-y-2.5">
						<!-- INKPRINT micro-label heading -->
						<p class="micro-label font-semibold text-accent">
							New chat · {displayContextLabel}
						</p>
						<!-- Body text -->
						<p class="text-sm font-medium leading-relaxed text-foreground">
							Ask BuildOS to plan, explain, or take the next step — or try one of
							these:
						</p>
						<!-- Suggestion buttons: prefill the composer on click -->
						<ul class="space-y-1.5">
							{#each emptyStateSuggestions as suggestion}
								<li>
									<button
										type="button"
										class="group flex w-full items-start gap-2 rounded-lg border border-border bg-background/60 px-2.5 py-2 text-left text-sm font-medium text-muted-foreground shadow-ink pressable hover:border-accent hover:bg-accent/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
										disabled={!onSelectSuggestion}
										onclick={() => onSelectSuggestion?.(suggestion)}
									>
										<span
											aria-hidden="true"
											class="mt-0.5 text-accent transition-transform group-hover:translate-x-0.5"
											>▸</span
										>
										<span class="min-w-0 flex-1">{suggestion}</span>
									</button>
								</li>
							{/each}
						</ul>
					</div>
				</div>
			{/if}
		{:else}
			{#each messages as message (rowKey(message))}
				{#if message.type === 'user'}
					{@const key = rowKey(message)}
					<!-- INKPRINT user message with accent border -->
					<!-- Flex column: message bubble + voice panel (when expanded, takes full width) -->
					<!-- data-live-turn-start: this row through the end skip content-visibility. -->
					<div
						class="flex flex-col items-end gap-1.5"
						data-row-key={key}
						data-live-turn-start={key === lastUserKey ? '' : undefined}
					>
						<!-- Message bubble -->
						<div
							data-testid="agent-chat-user-message"
							class="max-w-[88%] min-w-0 overflow-hidden rounded-lg border border-accent/30 bg-accent/5 p-3 text-sm font-medium text-foreground shadow-ink sm:max-w-[85%] sm:p-4"
							class:bubble-send={playsEntrance(message)}
						>
							{#if message.attachments?.length}
								<div class="mb-2 grid max-w-full gap-2 sm:grid-cols-2">
									{#each message.attachments as attachment, index (attachment.asset_id ?? index)}
										{@const previewUrl = attachmentPreviewUrl(attachment)}
										<div
											class="flex min-w-0 gap-2 rounded-lg border border-accent/20 bg-background/70 p-2"
										>
											{#if previewUrl}
												<img
													src={previewUrl}
													alt={attachment.file_name ?? 'Attached image'}
													class="h-14 w-14 shrink-0 rounded-md border border-border object-cover bg-muted"
													loading="lazy"
													decoding="async"
												/>
											{:else}
												<div
													class="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-2xs font-bold uppercase text-muted-foreground"
												>
													IMG
												</div>
											{/if}
											<div class="min-w-0 flex-1">
												<p class="truncate text-xs font-semibold">
													{attachment.file_name ?? 'Attached image'}
												</p>
												<p
													class="mt-1 truncate text-2xs text-muted-foreground"
												>
													{attachment.attachment_kind === 'temporary_file'
														? 'Ready for visual analysis'
														: attachment.ocr_status === 'complete'
															? 'OCR ready'
															: attachment.ocr_status
																? `OCR ${attachment.ocr_status}`
																: 'OCR queued'}
												</p>
											</div>
										</div>
									{/each}
								</div>
							{/if}
							{#if hasVisibleUserText(message)}
								<div
									class="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed"
									class:user-message-content-collapsed={isCollapsibleUserMessage(
										message
									) && !isUserMessageExpanded(key)}
								>
									{message.content}
								</div>
							{/if}
							<div class="message-footer mt-1">
								{#if isCollapsibleUserMessage(message)}
									<button
										type="button"
										class="message-expand-button"
										onclick={() => toggleUserMessageExpansion(key)}
										aria-expanded={isUserMessageExpanded(key)}
									>
										{isUserMessageExpanded(key) ? 'Less' : 'More'}
									</button>
								{:else}
									<span aria-hidden="true"></span>
								{/if}
								<div class="message-meta">
									<span class="message-timestamp text-accent/60">
										{formatTime(message.timestamp)}
									</span>
									{#if message.metadata?.voice_note_group_id}
										{@const groupId = message.metadata
											.voice_note_group_id as string}
										<VoiceNoteGroupPanel
											{groupId}
											voiceNotes={voiceNotesByGroupId[groupId] ?? []}
											onDeleteNote={onDeleteVoiceNote}
											inline
										/>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{:else if message.type === 'assistant'}
					{@const body = assistantBody(message, message.id === streamingMessageId)}
					<!-- INKPRINT assistant message with Frame texture -->
					<div
						data-testid="agent-chat-assistant-message"
						class="agent-resp-div clarity-zone min-w-0 overflow-hidden rounded-lg border border-border bg-card p-3 text-sm font-medium leading-relaxed text-foreground shadow-ink tx tx-frame tx-weak sm:p-4"
					>
						<!-- BuildOS assistant avatar -->
						<div
							class="float-left mt-0.5 mr-3 mb-1 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card shadow-ink sm:h-9 sm:w-9"
						>
							<img
								src="/brain-bolt.webp"
								alt="BuildOS"
								class="h-full w-full object-cover"
								loading="lazy"
							/>
						</div>
						<!-- One branch for streaming and finalized text: blocks are keyed by
					     position, so a finished turn only re-renders a changed tail. -->
						{#if body.blocks}
							<div
								class="agent-markdown {proseClasses} min-w-0 overflow-x-auto break-words"
								class:agent-live-preview={hasLivePreview(message)}
							>
								{#each body.blocks as blockHtml, blockIndex (blockIndex)}
									{@html blockHtml}
								{/each}
							</div>
						{:else}
							<div
								class="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed"
								class:agent-live-preview={hasLivePreview(message)}
							>
								{body.text}
							</div>
						{/if}
						{#if message.metadata?.interrupted}
							<div
								class="clear-both mt-1 micro-label font-semibold text-warning"
								role="status"
								aria-live="polite"
							>
								Response interrupted
							</div>
						{/if}
						<span
							class="clear-both mt-1 block text-right text-2xs leading-none tabular-nums text-muted-foreground/70"
						>
							{formatTime(message.timestamp)}
						</span>
					</div>
				{:else if message.type === 'agent_peer'}
					<!-- INKPRINT agent peer: neutral palette + round avatar (amber reserved for warnings) -->
					<div class="flex min-w-0 gap-2 sm:gap-3">
						<div
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted micro-label font-semibold text-muted-foreground shadow-ink tx tx-thread tx-weak sm:h-9 sm:w-9"
						>
							AI↔
						</div>
						<div
							class="max-w-[88%] min-w-0 overflow-hidden rounded-lg border border-border bg-muted/40 p-3 text-sm font-medium leading-relaxed text-foreground shadow-ink tx tx-thread tx-weak sm:max-w-[85%] sm:p-4"
						>
							{#if shouldRenderAsMarkdown(message.content)}
								<div
									class="agent-markdown {proseClasses} overflow-x-auto break-words"
								>
									{@html renderAgentMarkdown(message.content)}
								</div>
							{:else}
								<div
									class="whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
								>
									{message.content}
								</div>
							{/if}
							<span
								class="mt-1 block text-right text-2xs leading-none tabular-nums text-muted-foreground/70"
							>
								{formatTime(message.timestamp)}
							</span>
						</div>
					</div>
				{:else if message.type === 'thinking_block'}
					<ThinkingBlock
						block={message as ThinkingBlockMessage}
						onToggleCollapse={onToggleThinkingBlock}
						{onClientActionComplete}
					/>
				{:else if message.type === 'clarification'}
					<!-- INKPRINT clarification: accent palette ("your turn" kin to user bubble) -->
					<div class="flex min-w-0 gap-2 sm:gap-3">
						<div
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 micro-label font-semibold text-accent shadow-ink tx tx-bloom tx-weak sm:h-9 sm:w-9"
						>
							AI
						</div>
						<div
							class="max-w-[90%] min-w-0 overflow-hidden rounded-lg border border-accent/20 bg-accent/5 p-3 text-sm font-medium leading-relaxed text-foreground shadow-ink tx tx-bloom tx-weak sm:max-w-[88%] sm:p-4"
						>
							<!-- INKPRINT micro-label heading -->
							<p class="micro-label font-semibold text-foreground">
								{message.content}
							</p>

							{#if message.data?.questions?.length}
								<!-- INKPRINT questions list -->
								<ol class="mt-3 space-y-2 text-sm text-foreground">
									{#each message.data.questions as question, i}
										<li
											class="flex gap-2 font-medium leading-relaxed sm:gap-2.5"
										>
											<!-- INKPRINT number badge -->
											<span
												class="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-foreground text-2xs font-bold text-background shadow-ink"
											>
												{i + 1}
											</span>
											<span class="min-w-0 flex-1">{question}</span>
										</li>
									{/each}
								</ol>
							{/if}

							<!-- INKPRINT hint -->
							<p class="mt-3 micro-label font-semibold text-muted-foreground">
								Share the answers in your next message to continue
							</p>
							<span
								class="mt-1 block text-right text-2xs leading-none tabular-nums text-accent/60"
							>
								{formatTime(message.timestamp)}
							</span>
						</div>
					</div>
				{:else if message.type === 'created_entities'}
					{#if message.data?.entities?.length}
						<CreatedEntityCards
							entities={message.data.entities}
							animateEntrance={playsEntrance(message)}
						/>
					{/if}
				{:else if message.type === 'document_changes'}
					{#if message.data?.changes?.length}
						<DocumentChangeCards
							changes={message.data.changes}
							animateEntrance={playsEntrance(message)}
							onUndone={(card, document) =>
								onDocumentChangeUndone?.(message.id, card, document)}
						/>
					{/if}
				{:else if message.type === 'freshness_card'}
					{#if message.data?.card}
						<FreshnessRadarCard
							card={message.data.card}
							{onDraftInChat}
							onReviewDeeper={message.data.card.projectId === reviewProjectId
								? onReviewDeeper
								: undefined}
							{reviewDisabled}
						/>
					{/if}
				{:else if message.type === 'capture_receipt'}
					{#if message.data?.receipt}
						<CaptureReceiptChip receipt={message.data.receipt} />
					{/if}
				{:else if message.type === 'activity'}
					{#if dev}
						<div
							class="rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1.5 micro-label font-semibold text-warning tx tx-static tx-weak"
						>
							⚠️ Dev Warning: Legacy activity message
						</div>
					{/if}
					<!-- Legacy activity with INKPRINT styling -->
					<div class="flex gap-1.5 text-2xs text-muted-foreground">
						<div class="w-12 shrink-0 pt-1 font-mono uppercase tracking-[0.1em]">
							{formatTime(message.timestamp)}
						</div>
						<div
							class="max-w-[65%] rounded-lg border border-border bg-muted px-2.5 py-1.5 text-sm font-medium italic leading-tight text-muted-foreground shadow-ink"
						>
							<p class="leading-snug">{message.content}</p>
						</div>
					</div>
				{:else}
					<!-- Default message with INKPRINT styling -->
					<div class="flex gap-1.5 text-2xs text-muted-foreground">
						<div class="w-12 shrink-0 pt-1 font-mono uppercase tracking-[0.1em]">
							{formatTime(message.timestamp)}
						</div>
						<div
							class="max-w-[65%] rounded-lg border border-border bg-muted px-2.5 py-1.5 text-sm font-medium italic leading-tight text-muted-foreground shadow-ink"
						>
							<p class="leading-snug">{message.content}</p>
						</div>
					</div>
				{/if}
			{/each}
		{/if}
		<!-- End of real content: "latest" and the pill measure to here, never the reply room. -->
		<div
			bind:this={contentEnd}
			class="agent-chat-aux"
			style="height: 0; margin: 0;"
			aria-hidden="true"
		></div>
		<!-- Reply-room floor: positioned at pinned offset + one viewport while a turn is pinned. -->
		<div
			bind:this={replyFloor}
			class="agent-chat-aux agent-chat-reply-floor"
			style="display: none; margin: 0;"
			aria-hidden="true"
		></div>
	</div>
	{#if showJumpToLatest && messages.length > 0}
		<button
			type="button"
			class="agent-chat-jump pressable absolute inset-x-0 bottom-3 z-10 mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-ink-strong hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:w-9"
			aria-label="Jump to latest message"
			title="Jump to latest"
			onclick={jumpToLatestFromPill}
		>
			<ArrowDown class="h-4 w-4" aria-hidden="true" />
		</button>
	{/if}
</div>

<style>
	/* Skip rendering off-screen chat messages for scroll performance.
	   `auto 120px` tells the browser to remember the last rendered height
	   (falling back to 120px for never-rendered items), which prevents
	   layout estimation jumps when messages first appear on screen. */
	.agent-chat-scroll > :global(*:not(.agent-chat-aux)) {
		content-visibility: auto;
		contain-intrinsic-size: auto 120px;
	}

	/* The live turn (latest user message → end) always lays out for real: the
	   pin target and the pill measure it, and a 120px placeholder there would
	   make a pin land short. Declared after the rule above so it wins the tie. */
	.agent-chat-scroll > :global([data-live-turn-start]),
	.agent-chat-scroll > :global([data-live-turn-start] ~ *) {
		content-visibility: visible;
	}

	.agent-chat-reply-floor {
		position: absolute;
		left: 0;
		width: 1px;
		height: 1px;
		pointer-events: none;
		visibility: hidden;
	}

	/* Jump-to-latest pill: enters with opacity/transform only, leaves instantly. */
	.agent-chat-jump {
		animation: agent-chat-jump-in 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	@keyframes agent-chat-jump-in {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.agent-chat-jump {
			animation: none;
		}
	}

	.agent-chat-scroll-compact :global([data-testid='agent-chat-user-message']),
	.agent-chat-scroll-compact :global([data-testid='agent-chat-assistant-message']) {
		padding: 0.625rem;
		box-shadow: none;
	}

	.agent-resp-div :global(p) {
		margin-bottom: 0.2rem;
	}

	/* INKPRINT Scrollbar Styling - Ink on Paper aesthetic */
	.agent-chat-scroll {
		scrollbar-gutter: stable;
		scrollbar-width: thin;
		scrollbar-color: hsl(var(--muted-foreground) / 0.3) hsl(var(--muted));
	}

	:global(.agent-chat-scroll::-webkit-scrollbar) {
		width: 8px;
	}

	:global(.agent-chat-scroll::-webkit-scrollbar-track) {
		background: hsl(var(--muted));
		border-radius: 0.5rem; /* 8px - rounded-md */
	}

	:global(.agent-chat-scroll::-webkit-scrollbar-thumb) {
		background: hsl(var(--muted-foreground) / 0.3);
		border-radius: 0.5rem; /* 8px - rounded-md */
	}

	:global(.agent-chat-scroll::-webkit-scrollbar-thumb:hover) {
		background: hsl(var(--muted-foreground) / 0.5);
	}

	:global(.dark .agent-chat-scroll::-webkit-scrollbar-track) {
		background: hsl(var(--muted));
	}

	:global(.dark .agent-chat-scroll::-webkit-scrollbar-thumb) {
		background: hsl(var(--muted-foreground) / 0.4);
	}

	:global(.dark .agent-chat-scroll::-webkit-scrollbar-thumb:hover) {
		background: hsl(var(--accent));
	}

	/* Compact spacing for landscape mobile (short viewport) */
	@media (orientation: landscape) and (max-height: 500px) {
		:global(.agent-chat-scroll::-webkit-scrollbar) {
			width: 4px;
		}
	}

	.user-message-content-collapsed {
		max-height: calc(10 * 1.625em);
		overflow: hidden;
	}

	.message-footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.25rem 0.5rem;
	}

	.message-expand-button {
		flex: 0 0 auto;
		color: hsl(var(--accent));
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.15em;
		line-height: 1;
		text-transform: uppercase;
		transition: opacity 160ms ease;
	}

	.message-expand-button:hover {
		opacity: 0.8;
	}

	.message-meta {
		display: contents;
	}

	.message-timestamp {
		flex: 0 0 auto;
		margin-left: auto;
		font-size: 0.65rem;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	/* Send-confirmation microinteraction: fire-and-forget on bubble mount.
	   Only bubbles sent from this client get the class (never restored history),
	   and the stable row key means an id swap never replays it. Honors reduced motion. */
	@keyframes bubble-send {
		from {
			transform: scale(0.96);
			opacity: 0;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}

	.bubble-send {
		animation: bubble-send 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
		transform-origin: bottom right;
	}

	@media (prefers-reduced-motion: reduce) {
		.bubble-send {
			animation: none;
		}
	}

	.agent-markdown {
		color: hsl(var(--foreground));
		overflow-wrap: anywhere;
	}

	/* Live answer preview: a soft caret after the text while the model is still
	   writing it. Only exists during a preview; still under reduced motion. */
	.agent-live-preview.agent-markdown :global(> :last-child::after),
	.agent-live-preview:not(.agent-markdown)::after {
		content: '';
		display: inline-block;
		width: 2px;
		height: 1em;
		margin-left: 2px;
		vertical-align: text-bottom;
		border-radius: 1px;
		background: hsl(var(--muted-foreground));
		opacity: 0.6;
		animation: agent-live-caret 1.1s ease-in-out infinite;
	}

	@keyframes agent-live-caret {
		50% {
			opacity: 0.15;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.agent-live-preview.agent-markdown :global(> :last-child::after),
		.agent-live-preview:not(.agent-markdown)::after {
			animation: none;
		}
	}

	.agent-markdown :global(> :first-child) {
		margin-top: 0;
	}

	.agent-markdown :global(> :last-child) {
		margin-bottom: 0;
	}

	.agent-markdown :global(p) {
		margin-top: 0.4rem;
		margin-bottom: 0.4rem;
	}

	.agent-markdown :global(ul),
	.agent-markdown :global(ol) {
		margin-top: 0.5rem;
		margin-bottom: 0.5rem;
		padding-left: 1.35rem;
	}

	.agent-markdown :global(li) {
		margin-top: 0.18rem;
		margin-bottom: 0.18rem;
	}

	/* prose-sm gives <hr> ~40px of margin on each side, which reads as a
	   dead gap when the model uses `---` as a section divider. */
	.agent-markdown :global(hr) {
		margin-top: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.agent-markdown :global(pre) {
		margin-top: 0.75rem;
		margin-bottom: 0.75rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
	}

	.agent-markdown :global(pre code) {
		white-space: pre;
		overflow-wrap: normal;
	}

	.agent-markdown :global(.agent-markdown-table-shell) {
		display: flex;
		flex-direction: column;
		margin-top: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.agent-markdown :global(.agent-markdown-table-scroll) {
		overflow-x: auto;
		overscroll-behavior-inline: contain;
		border-radius: 0.5rem;
		scrollbar-width: thin;
	}

	.agent-markdown :global(.agent-markdown-table-scroll:focus-visible) {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 2px;
	}

	.agent-markdown :global(.agent-markdown-table-cue) {
		align-self: flex-end;
		display: none;
		order: -1;
		margin-bottom: 0.35rem;
		border: 1px solid hsl(var(--foreground) / 0.16);
		border-radius: 999px;
		background: hsl(var(--foreground) / 0.08);
		color: hsl(var(--foreground));
		font-size: 0.625rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		line-height: 1;
		opacity: 0;
		padding: 0.3rem 0.45rem;
		pointer-events: none;
		text-transform: uppercase;
		transition: opacity 120ms ease-out;
	}

	.agent-markdown
		:global(.agent-markdown-table-shell[data-scrollable='true'] > .agent-markdown-table-cue) {
		display: inline-flex;
	}

	.agent-markdown
		:global(
			.agent-markdown-table-shell[data-scrollable='true'][data-at-end='false']
				> .agent-markdown-table-cue
		) {
		opacity: 1;
	}

	.agent-markdown :global(table) {
		width: max-content;
		min-width: 100%;
		max-width: none;
		margin: 0;
		border-collapse: separate;
		border-spacing: 0;
		overflow: hidden;
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		font-size: 0.8rem;
		line-height: 1.45;
		table-layout: auto;
	}

	/* Column minimums scale with the viewport instead of a fixed rem floor, so a
	 narrow 2-column table doesn't force the same horizontal scroll as a wide one
	 inside the 85%-width message bubble. */
	.agent-markdown :global(th),
	.agent-markdown :global(td) {
		border-right: 1px solid hsl(var(--border));
		border-bottom: 1px solid hsl(var(--border));
		min-width: clamp(4.5rem, 24vw, 7rem);
		padding: 0.65rem 0.9rem;
		text-align: left;
		vertical-align: top;
		white-space: normal;
	}

	.agent-markdown :global(th:first-child),
	.agent-markdown :global(td:first-child) {
		min-width: clamp(6rem, 32vw, 14rem);
	}

	.agent-markdown :global(th:nth-child(2)),
	.agent-markdown :global(td:nth-child(2)) {
		min-width: clamp(7rem, 38vw, 18rem);
	}

	/* A true 2-column table should fit the narrow peer bubble when its content can
	 wrap; reserve the wider first/second-column heuristics for 3+ column data. */
	.agent-markdown :global(tr > :first-child:nth-last-child(2)),
	.agent-markdown :global(tr > :first-child:nth-last-child(2) ~ *) {
		min-width: clamp(4.5rem, 24vw, 7rem);
	}

	.agent-markdown :global(th) {
		background: hsl(var(--muted) / 0.75);
		color: hsl(var(--foreground));
		font-weight: 700;
	}

	.agent-markdown :global(td) {
		background: hsl(var(--card) / 0.86);
		color: hsl(var(--foreground));
	}

	.agent-markdown :global(tbody tr:nth-child(even) td) {
		background: hsl(var(--muted) / 0.32);
	}

	.agent-markdown :global(th:last-child),
	.agent-markdown :global(td:last-child) {
		border-right: 0;
	}

	.agent-markdown :global(tbody tr:last-child td) {
		border-bottom: 0;
	}

	.agent-markdown :global(th[align='center']),
	.agent-markdown :global(td[align='center']) {
		text-align: center;
	}

	.agent-markdown :global(th[align='right']),
	.agent-markdown :global(td[align='right']) {
		text-align: right;
	}

	@media (prefers-reduced-motion: reduce) {
		.agent-markdown :global(.agent-markdown-table-cue) {
			transition: none;
		}
	}
</style>
