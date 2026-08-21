// apps/web/src/lib/services/agentic-chat/tools/registry/email-tool-registry.test.ts
import { describe, expect, it } from 'vitest';
import { BUILDOS_AGENT_SUPPORTED_OPS } from '@buildos/shared-types';
import { buildToolRegistry } from './tool-registry';
import { getCapabilityByPath, listCapabilities } from './capability-catalog';
import { CHAT_TOOL_DEFINITIONS, TOOL_METADATA } from '../core/definitions';
import { ALL_TOOLS, extractTools } from '../core/tools.config';

const EMAIL_READ_TOOLS = [
	'get_external_account_status',
	'list_email_accounts',
	'search_email_messages',
	'get_email_message'
];
const EMAIL_CONNECTION_TOOLS = ['request_email_account_connection'];
const EMAIL_TOOL_NAMES = [...EMAIL_READ_TOOLS, ...EMAIL_CONNECTION_TOOLS];
const EMAIL_READ_OPS = [
	'email.accounts.status',
	'email.accounts.list',
	'email.messages.search',
	'email.messages.get'
];
const EMAIL_CONNECTION_OPS = ['email.accounts.connect'];
const EMAIL_OPS = [...EMAIL_READ_OPS, ...EMAIL_CONNECTION_OPS];

// Op/tool names that must never resolve to anything in any tier: a Gmail write of
// any shape (send, save-to-gmail draft, modify, label, archive, trash, execute).
const FORBIDDEN_EMAIL_WRITE_TOOL_NAMES = [
	'send_email',
	'send_email_message',
	'save_email_draft',
	'save_draft_to_gmail',
	'create_email_draft',
	'update_email_draft',
	'propose_email_draft',
	'modify_email',
	'modify_email_message',
	'label_email',
	'archive_email',
	'trash_email',
	'delete_email',
	'delete_email_message',
	'execute_email'
];

function buildRegistry(): ReturnType<typeof buildToolRegistry> {
	return buildToolRegistry(CHAT_TOOL_DEFINITIONS, TOOL_METADATA);
}

describe('email tools — registry availability', () => {
	it('account discovery and inbox reads resolve as reads; OAuth handoff is a write', () => {
		const registry = buildRegistry();
		for (const op of EMAIL_READ_OPS) {
			expect(registry.ops[op]).toBeDefined();
			expect(registry.ops[op].kind).toBe('read');
			expect(registry.ops[op].group).toBe('email');
			expect(registry.ops[op].chat_discoverable).toBe(true);
		}
		for (const name of EMAIL_READ_TOOLS) {
			expect(registry.byToolName[name]).toBeDefined();
			expect(registry.byToolName[name].kind).toBe('read');
		}
		for (const op of EMAIL_CONNECTION_OPS) {
			expect(registry.ops[op]).toMatchObject({ kind: 'write', group: 'email' });
		}
		for (const name of EMAIL_CONNECTION_TOOLS) {
			expect(registry.byToolName[name]).toMatchObject({ kind: 'write', group: 'email' });
		}
	});

	it('no send/modify/execute/draft email op or tool name resolves to anything', () => {
		const registry = buildRegistry();

		// Only discovery, read, and user-confirmed OAuth handoff ops exist here.
		const emailOps = Object.keys(registry.ops).filter((op) => op.startsWith('email.'));
		expect(emailOps.sort()).toEqual([...EMAIL_OPS].sort());

		// No write-shaped email op name is present.
		for (const op of Object.keys(registry.ops)) {
			expect(op).not.toMatch(
				/^email\..*\.(send|save|create|update|delete|modify|label|archive|trash|execute|draft|propose)$/
			);
		}

		// No forbidden write tool name resolves.
		for (const name of FORBIDDEN_EMAIL_WRITE_TOOL_NAMES) {
			expect(registry.byToolName[name]).toBeUndefined();
		}
	});

	it('email tools are built in and materializable by default', () => {
		const enabledNames = ALL_TOOLS.map((tool) => tool.function.name);
		for (const name of EMAIL_TOOL_NAMES) {
			expect(enabledNames).toContain(name);
			expect(extractTools([name])).toHaveLength(1);
		}
	});

	it('exposes the email capability-catalog entry by default', () => {
		const capability = getCapabilityByPath('capabilities.email_context');
		expect(capability).toBeDefined();
		expect(capability?.directPaths).toEqual(['email.accounts', 'email.messages']);
		expect(listCapabilities().some((c) => c.id === 'email_context')).toBe(true);
	});

	it('delegated agents (agent-call gateway) get no email ops — email.* is not in the supported op policy', () => {
		const supported = BUILDOS_AGENT_SUPPORTED_OPS as readonly string[];
		for (const op of EMAIL_OPS) {
			expect(supported).not.toContain(op);
		}
		expect(supported.some((op) => op.startsWith('email.'))).toBe(false);
	});
});
