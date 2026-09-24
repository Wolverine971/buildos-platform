// apps/worker/src/workers/agentic-chat/tools/email-scan-ledger.ts
//
// The scan cursor for `scan_email_inbox`: which inbox messages an earlier scan
// already scored for one relevance scope. A repeat scan ("anything new since
// this morning?") skips re-reading and re-scoring those messages, and only
// re-reads the ones that were relevant so it can show them again.
//
// Nothing here stores email content (supabase/migrations/20260924120000):
// message ids are HMAC'd with a key derived from the Gmail token secret, scope
// keys are fixed labels or hashes, and a row holds only a relevance score.
//
// The ledger is an optimization, never a dependency: every failure degrades to
// "nothing checked yet", which costs one extra scoring pass.
import { createHash, createHmac } from 'node:crypto';

export const EMAIL_SCAN_LEDGER_TABLE = 'email_scan_checks';
/** Bump when the relevance question changes so old scores stop counting. */
export const EMAIL_SCAN_SCOPE_VERSION = 1;
const LEDGER_KEY_CONTEXT = 'buildos:email-scan-ledger:v1';
const MESSAGE_KEYS_PER_QUERY = 100;

export type EmailScanLedgerEntry = { relevance: number; relevant: boolean };

export interface EmailScanLedger {
	/** Earlier scores for these messages in this scope, keyed by message id. */
	load(input: {
		userId: string;
		connectionId: string;
		scopeKey: string;
		messageIds: readonly string[];
	}): Promise<Map<string, EmailScanLedgerEntry>>;
	record(input: {
		userId: string;
		connectionId: string;
		scopeKey: string;
		rows: ReadonlyArray<{ messageId: string } & EmailScanLedgerEntry>;
	}): Promise<void>;
}

/**
 * The relevance scope a score belongs to. A project scope is stable across
 * phrasings ("anything about 9takes today?" twice hits the same rows); a
 * `looking_for` scope is a hash, so the model's text is never stored.
 */
export function emailScanScopeKey(input: {
	scope: 'project' | 'request' | 'attention';
	projectId: string | null;
	lookingFor: string | null;
}): string {
	const version = `v${EMAIL_SCAN_SCOPE_VERSION}`;
	if (input.scope === 'project' && input.projectId) {
		return `project:${input.projectId.toLowerCase()}:${version}`;
	}
	if (input.scope === 'request' && input.lookingFor) {
		const normalized = input.lookingFor.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
		const digest = createHash('sha256')
			.update(`${input.projectId ?? ''}|${normalized.trim()}`, 'utf8')
			.digest('hex')
			.slice(0, 32);
		return `request:${digest}:${version}`;
	}
	return `attention:0:${version}`;
}

type LedgerQuery = {
	select(columns: string): LedgerQuery;
	eq(column: string, value: string): LedgerQuery;
	in(column: string, values: readonly string[]): LedgerQuery;
	gt(column: string, value: string): LedgerQuery;
	lt(column: string, value: string): LedgerQuery;
	delete(): LedgerQuery;
	upsert(
		rows: readonly Record<string, unknown>[],
		options: { onConflict: string }
	): PromiseLike<{ error: { message?: string } | null }>;
	then: PromiseLike<{ data: unknown; error: { message?: string } | null }>['then'];
};
export type EmailScanLedgerClient = { from(table: string): LedgerQuery };

export class SupabaseEmailScanLedger implements EmailScanLedger {
	private readonly hmacKey: Buffer;

	constructor(
		private readonly client: EmailScanLedgerClient,
		secret: string,
		private readonly options: {
			now?: () => Date;
			ttlDays?: number;
			onError?: (operation: 'load' | 'record', error: unknown) => void;
		} = {}
	) {
		this.hmacKey = createHash('sha256').update(`${LEDGER_KEY_CONTEXT}:${secret}`).digest();
	}

	messageKey(connectionId: string, messageId: string): string {
		return createHmac('sha256', this.hmacKey)
			.update(`${connectionId}:${messageId}`, 'utf8')
			.digest('hex')
			.slice(0, 32);
	}

	private now(): Date {
		return this.options.now?.() ?? new Date();
	}

	async load(input: {
		userId: string;
		connectionId: string;
		scopeKey: string;
		messageIds: readonly string[];
	}): Promise<Map<string, EmailScanLedgerEntry>> {
		const found = new Map<string, EmailScanLedgerEntry>();
		if (input.messageIds.length === 0) return found;
		const idByKey = new Map(
			input.messageIds.map((messageId) => [
				this.messageKey(input.connectionId, messageId),
				messageId
			])
		);
		const keys = [...idByKey.keys()];
		try {
			const nowIso = this.now().toISOString();
			const pages: Promise<{ data: unknown; error: { message?: string } | null }>[] = [];
			for (let index = 0; index < keys.length; index += MESSAGE_KEYS_PER_QUERY) {
				pages.push(
					Promise.resolve(
						this.client
							.from(EMAIL_SCAN_LEDGER_TABLE)
							.select('message_key,relevance,relevant')
							.eq('user_id', input.userId)
							.eq('connection_id', input.connectionId)
							.eq('scope_key', input.scopeKey)
							.gt('expires_at', nowIso)
							.in('message_key', keys.slice(index, index + MESSAGE_KEYS_PER_QUERY))
					)
				);
			}
			for (const page of await Promise.all(pages)) {
				if (page.error) throw new Error(page.error.message ?? 'ledger read failed');
				for (const row of (page.data ?? []) as Array<Record<string, unknown>>) {
					const messageId = idByKey.get(String(row.message_key));
					const relevance = Number(row.relevance);
					if (!messageId || !Number.isFinite(relevance)) continue;
					found.set(messageId, { relevance, relevant: row.relevant === true });
				}
			}
			return found;
		} catch (error) {
			this.options.onError?.('load', error);
			return new Map();
		}
	}

	async record(input: {
		userId: string;
		connectionId: string;
		scopeKey: string;
		rows: ReadonlyArray<{ messageId: string } & EmailScanLedgerEntry>;
	}): Promise<void> {
		if (input.rows.length === 0) return;
		const now = this.now();
		const expiresAt = new Date(
			now.getTime() + (this.options.ttlDays ?? 30) * 86_400_000
		).toISOString();
		try {
			const { error } = await this.client.from(EMAIL_SCAN_LEDGER_TABLE).upsert(
				input.rows.map((row) => ({
					user_id: input.userId,
					connection_id: input.connectionId,
					scope_key: input.scopeKey,
					message_key: this.messageKey(input.connectionId, row.messageId),
					relevance: Math.max(0, Math.min(1, row.relevance)),
					relevant: row.relevant,
					checked_at: now.toISOString(),
					expires_at: expiresAt
				})),
				{ onConflict: 'user_id,connection_id,scope_key,message_key' }
			);
			if (error) throw new Error(error.message ?? 'ledger write failed');
			// Opportunistic retention for this user; the 30-day expiry is also
			// enforced on read, so a failed sweep only delays cleanup.
			const sweep = await this.client
				.from(EMAIL_SCAN_LEDGER_TABLE)
				.delete()
				.eq('user_id', input.userId)
				.lt('expires_at', now.toISOString());
			if (sweep.error) throw new Error(sweep.error.message ?? 'ledger sweep failed');
		} catch (error) {
			this.options.onError?.('record', error);
		}
	}
}
