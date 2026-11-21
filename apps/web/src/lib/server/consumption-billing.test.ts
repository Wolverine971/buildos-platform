// apps/web/src/lib/server/consumption-billing.test.ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	classifyFrozenMutationCapability,
	shouldGuardMutationForConsumptionBilling
} from './consumption-billing';

const RUN = '0b6f2f1e-1c1d-4f7a-9a51-2f7c3a1d9e10';

describe('frozen-account spend gate', () => {
	it.each([
		'/api/agent-runs',
		`/api/agent-runs/${RUN}/answer`,
		`/api/agent-runs/${RUN}/resume`,
		`/api/agent-runs/${RUN}/steer`,
		`/api/agent-operatives/${RUN}/run`,
		`/api/cycles/${RUN}/run`
	])('treats %s as AI spend', (path) => {
		expect(classifyFrozenMutationCapability(path)).toBe('ai_compute');
		expect(shouldGuardMutationForConsumptionBilling(path, 'POST')).toBe(true);
	});

	// Each of these starts a model call, a web-research run, or a worker job that does. They
	// were open to frozen accounts while the gate listed areas to block instead of blocking
	// by default.
	it.each([
		'/api/consolidation/runs',
		`/api/consolidation/runs/${RUN}/merge`,
		`/api/consolidation/questions/${RUN}`,
		'/api/workspace/find/best',
		'/api/workspace/capture/sort',
		'/api/workspace/suggestions/auto-file',
		'/api/workspace/suggestions/refresh',
		'/api/inbox/decide',
		'/api/knowledge/enrich',
		'/api/profile/builder/draft',
		'/api/profile/builder/updates',
		'/api/brief-jobs/queue',
		'/api/libri/ocr-batches/confirm'
	])('blocks paid work at %s for a frozen account', (path) => {
		expect(shouldGuardMutationForConsumptionBilling(path, 'POST')).toBe(true);
		expect(classifyFrozenMutationCapability(path)).toBe('ai_compute');
	});

	it.each(['/api/workspace/capture', '/api/knowledge/entities', '/api/profile/contacts'])(
		'blocks the edit at %s as a workspace write',
		(path) => {
			expect(shouldGuardMutationForConsumptionBilling(path, 'POST')).toBe(true);
			expect(classifyFrozenMutationCapability(path)).toBe('workspace_write');
		}
	);

	it('blocks an endpoint nobody has classified yet', () => {
		expect(shouldGuardMutationForConsumptionBilling('/api/next-feature/run', 'POST')).toBe(true);
		expect(classifyFrozenMutationCapability('/api/next-feature/run')).toBe('other_mutation');
	});

	it.each([
		`/api/agent-runs/${RUN}/cancel`,
		`/api/agent-runs/${RUN}/pause`,
		`/api/agent-runs/${RUN}/commit`,
		`/api/agent-operatives/${RUN}`,
		`/api/cycles/${RUN}`,
		'/api/brief-jobs/cancel',
		'/api/daily-briefs/cancel',
		`/api/consolidation/runs/${RUN}/cancel`,
		`/api/consolidation/runs/${RUN}/undo`,
		'/api/knowledge/research/cancel',
		'/api/workspace/capture/sort/undo',
		'/api/workspace/graduate/undo'
	])('lets a frozen account still stop or undo things: %s', (path) => {
		expect(shouldGuardMutationForConsumptionBilling(path, 'POST')).toBe(false);
	});

	it.each([
		'/api/stripe/checkout',
		'/api/billing/activate',
		'/api/auth/logout',
		'/api/account/delete',
		'/api/users/timezone',
		'/api/profile/me/username',
		'/api/search',
		'/api/integrations/gmail/connections',
		'/api/webhooks/stripe'
	])('keeps paying, leaving, preferences and reads open: %s', (path) => {
		expect(shouldGuardMutationForConsumptionBilling(path, 'POST')).toBe(false);
	});

	it('ignores reads, pages and scheduled jobs', () => {
		expect(shouldGuardMutationForConsumptionBilling('/api/agent-runs', 'GET')).toBe(false);
		expect(shouldGuardMutationForConsumptionBilling('/projects', 'POST')).toBe(false);
		expect(shouldGuardMutationForConsumptionBilling('/api/cron/dunning', 'POST')).toBe(false);
	});
});

// Every write endpoint under /api/ that a frozen account can still call, read from the route
// files themselves. A new route that lands under an open prefix shows up here, so opening
// something to frozen accounts is always a reviewed change to this list.
describe('write endpoints open to a frozen account', () => {
	const API_ROOT = join(process.cwd(), 'src/routes/api');
	const MUTATING_EXPORT = /export (?:const|async function|function) (?:POST|PUT|PATCH|DELETE)\b/;

	function mutatingRoutes(dir: string, found: string[] = []): string[] {
		for (const entry of readdirSync(dir)) {
			const full = join(dir, entry);
			if (statSync(full).isDirectory()) {
				mutatingRoutes(full, found);
			} else if (entry === '+server.ts' && MUTATING_EXPORT.test(readFileSync(full, 'utf8'))) {
				found.push(`/api${dir.slice(API_ROOT.length)}`);
			}
		}
		return found;
	}

	/** `/api/x/[id]/y` as a request would spell it. */
	const samplePath = (route: string) =>
		route.replace(/\[\.\.\.[^\]]+\]/g, 'a/b').replace(/\[[^\]]+\]/g, RUN);

	it('matches the reviewed list', () => {
		const open = mutatingRoutes(API_ROOT)
			.filter((route) => !route.startsWith('/api/cron/'))
			.filter((route) => !shouldGuardMutationForConsumptionBilling(samplePath(route), 'POST'))
			.sort();
		expect(open).toMatchInlineSnapshot(`
			[
			  "/api/account/exports",
			  "/api/account/password",
			  "/api/account/settings",
			  "/api/agent-call/buildos",
			  "/api/agent-call/callers",
			  "/api/agent-call/callers/shared-projects",
			  "/api/agent-operatives/[id]",
			  "/api/agent-runs/[id]/cancel",
			  "/api/agent-runs/[id]/commit",
			  "/api/agent-runs/[id]/pause",
			  "/api/auth/handoff",
			  "/api/auth/login",
			  "/api/auth/register",
			  "/api/billing/payment-warnings/[id]/dismiss",
			  "/api/brief-jobs/cancel",
			  "/api/brief-preferences",
			  "/api/consolidation/runs/[id]/cancel",
			  "/api/consolidation/runs/[id]/undo",
			  "/api/consolidation/runs/[id]/veto",
			  "/api/cycles/[id]",
			  "/api/daily-briefs/cancel",
			  "/api/email-tracking/[tracking_id]/unsubscribe",
			  "/api/error-tracking/client",
			  "/api/feedback",
			  "/api/integrations/gmail/connections",
			  "/api/integrations/gmail/connections/[connectionId]",
			  "/api/integrations/gmail/messages/get",
			  "/api/integrations/gmail/messages/search",
			  "/api/integrations/google-calendar/connections",
			  "/api/integrations/google-calendar/connections/[connectionId]",
			  "/api/integrations/google-calendar/connections/[connectionId]/refresh-sources",
			  "/api/integrations/google-calendar/preferences/default-write-source",
			  "/api/integrations/google-calendar/sources/[calendarSourceId]",
			  "/api/integrations/google/agent-access",
			  "/api/internal/libri/catalog-covers/sign",
			  "/api/internal/libri/images/sign",
			  "/api/internal/libri/ocr-assets/redeem",
			  "/api/internal/libri/uploads/download",
			  "/api/internal/libri/uploads/maintain",
			  "/api/internal/libri/uploads/publish",
			  "/api/internal/libri/uploads/sign",
			  "/api/knowledge/research/cancel",
			  "/api/legal/acceptance-intent",
			  "/api/notification-preferences",
			  "/api/notification-tracking/click/[delivery_id]",
			  "/api/people/requests",
			  "/api/people/requests/[requestId]/decide",
			  "/api/profile/me/discoverability",
			  "/api/profile/me/username",
			  "/api/public/builders/[handle]/event",
			  "/api/public/pages/[slug]/view",
			  "/api/push/devices",
			  "/api/queue-jobs/[id]",
			  "/api/search",
			  "/api/search/more",
			  "/api/share/[token]/view",
			  "/api/sms/preferences",
			  "/api/sms/scheduled/[id]",
			  "/api/sms/verify",
			  "/api/sms/verify/confirm",
			  "/api/stripe/checkout",
			  "/api/stripe/portal",
			  "/api/stripe/webhook",
			  "/api/users/calendar-preferences",
			  "/api/users/timezone",
			  "/api/users/voice-narration",
			  "/api/visitors",
			  "/api/webhooks/agentic-chat-queue-alert",
			  "/api/webhooks/calendar-sync-job",
			  "/api/webhooks/send-notification-email",
			  "/api/webhooks/twilio/status",
			  "/api/workspace/capture/sort/undo",
			  "/api/workspace/graduate/undo",
			]
		`);
	});
});
