// apps/web/scripts/migrate-legacy-calendar-connections.ts
import { createCustomClient } from '@buildos/supabase-client';
import {
	GoogleCalendarConnectionError,
	GoogleCalendarConnectionService
} from '../src/lib/server/google-calendar-connection.service';

type MigrationResult = {
	userId: string;
	status: 'migrated' | 'already_migrated' | 'no_legacy_token' | 'reconnect_required' | 'failed';
	connectionId: string | null;
	reason?: string;
};

function createMigrationAdminClient() {
	const supabaseUrl = process.env.PUBLIC_SUPABASE_URL?.trim();
	const serviceKey = process.env.PRIVATE_SUPABASE_SERVICE_KEY?.trim();
	if (!supabaseUrl || !serviceKey) {
		throw new Error(
			'Missing PUBLIC_SUPABASE_URL or PRIVATE_SUPABASE_SERVICE_KEY for Calendar migration'
		);
	}
	return createCustomClient(supabaseUrl, serviceKey);
}

function readArgument(name: string): string | null {
	const prefix = `${name}=`;
	const inline = process.argv.slice(2).find((value) => value.startsWith(prefix));
	if (inline) return inline.slice(prefix.length).trim() || null;
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1]?.trim() || null : null;
}

function parseLimit(): number {
	const raw = readArgument('--limit');
	if (!raw) return 25;
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
		throw new Error('--limit must be an integer between 1 and 100');
	}
	return parsed;
}

function parseOffset(): number {
	const raw = readArgument('--offset');
	if (!raw) return 0;
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed < 0) {
		throw new Error('--offset must be a non-negative integer');
	}
	return parsed;
}

async function main(): Promise<void> {
	const execute = process.argv.includes('--execute');
	const userId = readArgument('--user-id');
	const limit = parseLimit();
	const offset = parseOffset();
	const admin = createMigrationAdminClient();
	let query = admin
		.from('user_calendar_tokens')
		.select('user_id, updated_at')
		.order('updated_at', { ascending: true })
		.order('user_id', { ascending: true })
		.range(offset, offset + limit - 1);
	if (userId) query = query.eq('user_id', userId);

	const { data, error } = await query;
	if (error) throw error;
	const candidates = (data ?? []).map((row) => row.user_id);

	if (!execute) {
		console.log(
			JSON.stringify(
				{
					mode: 'dry_run',
					offset,
					limit,
					candidateCount: candidates.length,
					userIds: candidates,
					nextOffset: candidates.length === limit ? offset + limit : null,
					nextCommand: `pnpm --filter @buildos/web calendar:migrate-connections -- --execute --offset=${offset} --limit=${limit}`
				},
				null,
				2
			)
		);
		return;
	}

	const service = new GoogleCalendarConnectionService(admin);
	if (!service.isConfigured()) {
		throw new Error(
			'Calendar migration is not configured. Set the dedicated Calendar OAuth client and PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1 before executing.'
		);
	}
	const results: MigrationResult[] = [];
	for (const candidateUserId of candidates) {
		try {
			const result = await service.migrateLegacyConnection(candidateUserId);
			results.push({ userId: candidateUserId, ...result });
		} catch (migrationError) {
			results.push({
				userId: candidateUserId,
				status: 'failed',
				connectionId: null,
				reason:
					migrationError instanceof GoogleCalendarConnectionError
						? migrationError.code
						: 'unexpected_error'
			});
		}
	}

	console.log(
		JSON.stringify(
			{
				mode: 'execute',
				offset,
				limit,
				candidateCount: candidates.length,
				nextOffset: candidates.length === limit ? offset + limit : null,
				counts: results.reduce<Record<string, number>>((counts, result) => {
					counts[result.status] = (counts[result.status] ?? 0) + 1;
					return counts;
				}, {}),
				results
			},
			null,
			2
		)
	);
}

main().catch((error) => {
	const fatalError =
		error instanceof Error
			? { message: error.message, name: error.name }
			: error && typeof error === 'object'
				? {
						message: 'Migration request failed',
						code: 'code' in error ? String(error.code) : undefined,
						details: 'details' in error ? String(error.details) : undefined,
						hint: 'hint' in error ? String(error.hint) : undefined
					}
				: { message: String(error) };
	console.error(
		JSON.stringify({
			mode: process.argv.includes('--execute') ? 'execute' : 'dry_run',
			fatalError
		})
	);
	process.exitCode = 1;
});
