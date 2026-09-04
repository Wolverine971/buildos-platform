// apps/web/src/lib/server/gmail-gateway-infrastructure.ts
// Preserve the web import path while workers use the same bounded-read helpers.
export {
	mapWithConcurrency,
	readJsonBounded,
	type BoundedJsonReadPolicy
} from '@buildos/shared-agent-ops/email/gmail-gateway-infrastructure';
