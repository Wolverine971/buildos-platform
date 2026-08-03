import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAiInboxCount } from '$lib/stores/aiInboxCount.store';
import { toastService, TOAST_DURATION } from '$lib/stores/toast.store';
import { startGmailOAuth } from '$lib/services/gmail-oauth.client';

type IntegrationAttentionRow = {
	id: string;
	source_type: string;
	source_ref_id: string;
	status: string;
	title: string | null;
	created_at: string | null;
	source_payload?: Record<string, unknown> | null;
};

const SURFACED_KEY = 'buildos:gmail-reconnect-attention:surfaced';
const toastIds = new Map<string, string>();
let activeChannel: ReturnType<SupabaseClient['channel']> | null = null;
let activeSupabase: SupabaseClient | null = null;
let initializedForUserId: string | null = null;

function readSurfacedKeys(): Set<string> {
	if (typeof sessionStorage === 'undefined') return new Set();
	try {
		const parsed = JSON.parse(sessionStorage.getItem(SURFACED_KEY) ?? '[]');
		return new Set(
			Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : []
		);
	} catch {
		return new Set();
	}
}

function rememberSurfaced(key: string): void {
	if (typeof sessionStorage === 'undefined') return;
	const keys = readSurfacedKeys();
	keys.add(key);
	// Reconnect recurrences re-date created_at, so a small rolling set is enough
	// to suppress duplicates during one browser session without hiding a later
	// recurrence of the same connection.
	sessionStorage.setItem(SURFACED_KEY, JSON.stringify([...keys].slice(-50)));
}

function displayName(row: IntegrationAttentionRow): string {
	const payload = row.source_payload;
	const label = payload?.account_label;
	const email = payload?.email_address;
	if (typeof label === 'string' && label.trim()) return label.trim();
	if (typeof email === 'string' && email.trim()) return email.trim();
	return row.title?.replace(/^Reconnect\s+/i, '').trim() || 'Gmail';
}

async function reconnect(row: IntegrationAttentionRow): Promise<void> {
	const currentToastId = toastIds.get(row.id);
	if (currentToastId) toastService.remove(currentToastId);

	try {
		const connection = await startGmailOAuth({
			connectionId: row.source_ref_id,
			fallbackRedirectPath: '/profile?tab=email&gmail=1'
		});
		toastService.success(`${connection.accountLabel} reconnected with read-only access`);
		window.dispatchEvent(new CustomEvent('buildosaiinboxchanged'));
	} catch (error) {
		toastService.error(error instanceof Error ? error.message : 'Gmail reconnect failed');
	} finally {
		void loadAiInboxCount({ force: true });
	}
}

function clearAttention(rowId: string): void {
	const toastId = toastIds.get(rowId);
	if (toastId) toastService.remove(toastId);
	toastIds.delete(rowId);
}

function surfaceAttention(row: IntegrationAttentionRow): void {
	if (row.source_type !== 'integration_attention') return;
	if (row.status !== 'pending') {
		clearAttention(row.id);
		return;
	}

	const surfacedKey = `${row.id}:${row.created_at ?? 'unknown'}`;
	if (toastIds.has(row.id) || readSurfacedKeys().has(surfacedKey)) return;
	rememberSurfaced(surfacedKey);

	const toastId = toastService.warning(`${displayName(row)} needs to be reconnected`, {
		duration: TOAST_DURATION.PERSISTENT,
		dismissible: true,
		action: {
			label: 'Reconnect',
			onClick: () => void reconnect(row)
		}
	});
	toastIds.set(row.id, toastId);
}

async function loadCurrentAttention(): Promise<void> {
	try {
		const response = await fetch(
			'/api/inbox?status=pending&source_type=integration_attention&include_payload=1&limit=10&repair=none',
			{ headers: { accept: 'application/json' } }
		);
		const payload = await response.json().catch(() => null);
		if (!response.ok || !payload?.success) return;
		const rows = Array.isArray(payload.data?.items)
			? (payload.data.items as IntegrationAttentionRow[])
			: [];
		for (const row of rows) surfaceAttention(row);
	} catch (error) {
		console.warn('[GmailReconnectAttention] Initial load failed:', error);
	}
}

export function initGmailReconnectAttentionBridge(supabase: SupabaseClient, userId: string): void {
	if (typeof window === 'undefined') return;
	if (initializedForUserId === userId && activeChannel) return;
	destroyGmailReconnectAttentionBridge();

	initializedForUserId = userId;
	activeSupabase = supabase;
	activeChannel = supabase
		.channel(`gmail-reconnect-attention:${userId}`)
		.on(
			'postgres_changes',
			{
				event: '*',
				schema: 'public',
				table: 'inbox_items',
				filter: `user_id=eq.${userId}`
			},
			(payload) => {
				const current = (payload.new ?? payload.old) as Partial<IntegrationAttentionRow>;
				if (current.source_type !== 'integration_attention' || !current.id) return;
				if (payload.eventType === 'DELETE') clearAttention(current.id);
				else surfaceAttention(current as IntegrationAttentionRow);
				void loadAiInboxCount({ force: true });
				window.dispatchEvent(new CustomEvent('buildosaiinboxchanged'));
			}
		)
		.subscribe((status) => {
			if (status === 'SUBSCRIBED') void loadCurrentAttention();
		});
}

export function destroyGmailReconnectAttentionBridge(): void {
	for (const toastId of toastIds.values()) toastService.remove(toastId);
	toastIds.clear();
	if (activeChannel && activeSupabase) void activeSupabase.removeChannel(activeChannel);
	activeChannel = null;
	activeSupabase = null;
	initializedForUserId = null;
}
