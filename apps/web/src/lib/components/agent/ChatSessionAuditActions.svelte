<!-- apps/web/src/lib/components/agent/ChatSessionAuditActions.svelte -->
<!--
	Admin session-audit actions for an agentic chat session: a Logs link plus an
	Export dropdown (markdown / zip bundle). Self-contained — owns admin gating,
	export state, and toasts — so any host surface (AgentChatHeader, the Daily
	Brief header bar, future embeds) can drop it in with just a sessionId.

	Renders nothing for non-admin users or when no session exists yet.

	Desktop (sm+): Logs link + Export dropdown.
	Mobile: single "..." menu containing all actions.

	Design: INKPRINT tactile buttons matching AgentChatHeader controls.
-->
<script lang="ts">
	import {
		ChevronDown,
		Download,
		ExternalLink,
		FileArchive,
		LoaderCircle,
		MoreHorizontal
	} from 'lucide-svelte';
	import { page } from '$app/stores';
	import { portal } from '$lib/actions/portal';
	import { toastService } from '$lib/stores/toast.store';
	import {
		downloadChatSessionAuditMarkdown,
		fetchChatSessionAuditPayload
	} from '$lib/services/admin/chat-session-audit-export';
	import { downloadChatSessionAuditBundle } from '$lib/services/admin/chat-session-audit-bundle';

	interface Props {
		sessionId?: string | null;
	}

	let { sessionId = null }: Props = $props();

	let exportMenuOpen = $state(false);
	let mobileMenuOpen = $state(false);
	let isExporting = $state(false);
	let exportButtonEl = $state<HTMLButtonElement | undefined>(undefined);
	let exportMenuPosition = $state({ top: 0, left: 0 });

	const isAdminUser = $derived(Boolean($page.data?.user?.is_admin));
	const visible = $derived(isAdminUser && Boolean(sessionId));
	const adminSessionHref = $derived(
		sessionId ? `/admin/chat/sessions?chat_session_id=${encodeURIComponent(sessionId)}` : null
	);

	async function exportAudit(format: 'markdown' | 'bundle') {
		if (!sessionId) return;

		isExporting = true;
		try {
			const payload = await fetchChatSessionAuditPayload(sessionId);
			if (format === 'markdown') {
				downloadChatSessionAuditMarkdown(payload);
				toastService.success('Session audit exported as markdown');
			} else {
				downloadChatSessionAuditBundle(payload);
				toastService.success('Session audit bundle exported as zip');
			}
		} catch (err) {
			console.error('Failed exporting chat session audit', err);
			toastService.error(
				err instanceof Error ? err.message : 'Failed to export session audit'
			);
		} finally {
			isExporting = false;
		}
	}

	function updateExportMenuPosition() {
		if (!exportButtonEl) return;
		const rect = exportButtonEl.getBoundingClientRect();
		// Position dropdown to the right of the button, accounting for menu width
		const menuWidth = 208; // min-w-52 = 13rem = 208px
		const viewportPadding = 8;
		let left = rect.right - menuWidth;

		// Ensure dropdown doesn't go off-screen to the left
		if (left < viewportPadding) {
			left = viewportPadding;
		}
		// Ensure dropdown doesn't go off-screen to the right
		const menuRight = left + menuWidth;
		if (menuRight > window.innerWidth - viewportPadding) {
			left = window.innerWidth - menuWidth - viewportPadding;
		}

		exportMenuPosition = {
			top: rect.bottom + 6,
			left: Math.max(0, left)
		};
	}

	function toggleExportMenu() {
		exportMenuOpen = !exportMenuOpen;
		// Update position after state change and DOM render
		if (exportMenuOpen) {
			requestAnimationFrame(() => updateExportMenuPosition());
		}
	}
</script>

{#if visible}
	<!-- Desktop: Logs link + Export dropdown -->
	<div class="hidden items-center gap-1.5 sm:flex">
		{#if adminSessionHref}
			<a
				href={adminSessionHref}
				target="_blank"
				rel="noopener noreferrer"
				class="flex h-7 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground shadow-ink transition-all touch-manipulation pressable hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				style="-webkit-tap-highlight-color: transparent;"
				title="Open this chat session in admin audit logs"
			>
				<ExternalLink class="h-3.5 w-3.5 shrink-0" />
				<span>Logs</span>
			</a>
		{/if}

		<div>
			<button
				bind:this={exportButtonEl}
				type="button"
				onclick={() => toggleExportMenu()}
				disabled={isExporting}
				class="flex h-7 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground shadow-ink transition-all touch-manipulation pressable hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
				style="-webkit-tap-highlight-color: transparent;"
				title="Export this chat session"
				aria-haspopup="menu"
				aria-expanded={exportMenuOpen}
			>
				{#if isExporting}
					<LoaderCircle class="h-3.5 w-3.5 shrink-0 animate-spin" />
				{:else}
					<Download class="h-3.5 w-3.5 shrink-0" />
				{/if}
				<span>Export</span>
				<ChevronDown class="h-3 w-3 shrink-0" />
			</button>

			{#if exportMenuOpen}
				<div use:portal>
					<!-- Click-away backdrop -->
					<button
						type="button"
						class="fixed inset-0 z-[10000] cursor-default"
						aria-label="Close export menu"
						tabindex="-1"
						onclick={() => (exportMenuOpen = false)}
					></button>
					<div
						class="fixed z-[10001] min-w-52 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-ink tx tx-frame tx-weak"
						role="menu"
						style="left: {exportMenuPosition.left}px; top: {exportMenuPosition.top}px;"
					>
						<button
							type="button"
							onclick={() => {
								exportMenuOpen = false;
								void exportAudit('markdown');
							}}
							disabled={isExporting}
							class="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
							role="menuitem"
							title="Export this chat session as a single markdown file"
						>
							<Download class="h-3.5 w-3.5 shrink-0" />
							<span>Export as markdown</span>
						</button>
						<button
							type="button"
							onclick={() => {
								exportMenuOpen = false;
								void exportAudit('bundle');
							}}
							disabled={isExporting}
							class="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
							role="menuitem"
							title="Export this chat session as a multi-file zip bundle (README gist + transcript + raw JSON)"
						>
							<FileArchive class="h-3.5 w-3.5 shrink-0" />
							<span>Export as separate files</span>
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Mobile: single "..." menu -->
	<div class="relative sm:hidden">
		<button
			type="button"
			onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
			class="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-ink transition-all touch-manipulation pressable hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			style="-webkit-tap-highlight-color: transparent;"
			aria-label="Open session actions"
			aria-haspopup="menu"
			aria-expanded={mobileMenuOpen}
		>
			{#if isExporting}
				<LoaderCircle class="h-4 w-4 animate-spin" />
			{:else}
				<MoreHorizontal class="h-4 w-4" />
			{/if}
		</button>

		{#if mobileMenuOpen}
			<!-- Click-away backdrop -->
			<button
				type="button"
				class="fixed inset-0 z-40 cursor-default"
				aria-label="Close session actions menu"
				tabindex="-1"
				onclick={() => (mobileMenuOpen = false)}
			></button>
			<div
				class="absolute right-0 top-[calc(100%+0.35rem)] z-50 min-w-52 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-ink tx tx-frame tx-weak"
				role="menu"
			>
				{#if adminSessionHref}
					<a
						href={adminSessionHref}
						target="_blank"
						rel="noopener noreferrer"
						class="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none"
						role="menuitem"
						onclick={() => (mobileMenuOpen = false)}
					>
						<ExternalLink class="h-3.5 w-3.5 shrink-0" />
						<span>Logs</span>
					</a>
				{/if}
				<button
					type="button"
					onclick={() => {
						mobileMenuOpen = false;
						void exportAudit('markdown');
					}}
					disabled={isExporting}
					class="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
					role="menuitem"
				>
					<Download class="h-3.5 w-3.5 shrink-0" />
					<span>Export as markdown</span>
				</button>
				<button
					type="button"
					onclick={() => {
						mobileMenuOpen = false;
						void exportAudit('bundle');
					}}
					disabled={isExporting}
					class="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
					role="menuitem"
				>
					<FileArchive class="h-3.5 w-3.5 shrink-0" />
					<span>Export as separate files</span>
				</button>
			</div>
		{/if}
	</div>
{/if}
