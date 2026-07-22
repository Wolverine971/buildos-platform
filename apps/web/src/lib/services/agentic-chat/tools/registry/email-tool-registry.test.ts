// apps/web/src/lib/services/agentic-chat/tools/registry/email-tool-registry.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { BUILDOS_AGENT_SUPPORTED_OPS } from '@buildos/shared-types';
import { buildToolRegistry } from './tool-registry';
import { getCapabilityByPath, listCapabilities } from './capability-catalog';
import { CHAT_TOOL_DEFINITIONS, TOOL_METADATA } from '../core/definitions';
import { configureEmailRuntimeEnv } from '../email';
import { getAllEnabledTools, extractTools } from '../core/tools.config';

const EMAIL_TOOL_NAMES = ['list_email_accounts', 'search_email_messages', 'get_email_message'];
const EMAIL_READ_OPS = ['email.accounts.list', 'email.messages.search', 'email.messages.get'];

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

function withEmailFlag(enabled: boolean): ReturnType<typeof buildToolRegistry> {
	configureEmailRuntimeEnv({ EMAIL_CHAT_TOOLS_ENABLED: enabled ? 'true' : '' });
	return buildToolRegistry(CHAT_TOOL_DEFINITIONS, TOOL_METADATA);
}

afterEach(() => {
	configureEmailRuntimeEnv(null);
});

describe('email tools — registry gating', () => {
	it('flag ON: the three email ops resolve as reads', () => {
		const registry = withEmailFlag(true);
		for (const op of EMAIL_READ_OPS) {
			expect(registry.ops[op]).toBeDefined();
			expect(registry.ops[op].kind).toBe('read');
			expect(registry.ops[op].chat_discoverable).toBe(true);
		}
		for (const name of EMAIL_TOOL_NAMES) {
			expect(registry.byToolName[name]).toBeDefined();
			expect(registry.byToolName[name].kind).toBe('read');
		}
	});

	it('flag ON: no send/modify/execute/draft email op or tool name resolves to anything', () => {
		const registry = withEmailFlag(true);

		// Only the three read ops exist under the email.* namespace.
		const emailOps = Object.keys(registry.ops).filter((op) => op.startsWith('email.'));
		expect(emailOps.sort()).toEqual([...EMAIL_READ_OPS].sort());
		for (const op of emailOps) {
			expect(registry.ops[op].kind).toBe('read');
		}

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

	it('flag OFF (default): no email tool is present in the registry', () => {
		const registry = withEmailFlag(false);
		for (const op of EMAIL_READ_OPS) {
			expect(registry.ops[op]).toBeUndefined();
		}
		for (const name of EMAIL_TOOL_NAMES) {
			expect(registry.byToolName[name]).toBeUndefined();
		}
		expect(Object.keys(registry.ops).some((op) => op.startsWith('email.'))).toBe(false);
	});

	it('flag OFF: email tools are not enabled/surfaced in tools.config', () => {
		configureEmailRuntimeEnv({ EMAIL_CHAT_TOOLS_ENABLED: '' });
		const enabledNames = getAllEnabledTools().map((tool) => tool.function.name);
		for (const name of EMAIL_TOOL_NAMES) {
			expect(enabledNames).not.toContain(name);
			expect(extractTools([name])).toHaveLength(0);
		}
	});

	it('flag ON: email tools become materializable via tools.config', () => {
		configureEmailRuntimeEnv({ EMAIL_CHAT_TOOLS_ENABLED: 'true' });
		const enabledNames = getAllEnabledTools().map((tool) => tool.function.name);
		for (const name of EMAIL_TOOL_NAMES) {
			expect(enabledNames).toContain(name);
			expect(extractTools([name])).toHaveLength(1);
		}
	});

	it('flag gates the email capability-catalog entry (discovery)', () => {
		configureEmailRuntimeEnv({ EMAIL_CHAT_TOOLS_ENABLED: '' });
		expect(getCapabilityByPath('capabilities.email_context')).toBeUndefined();
		expect(listCapabilities().some((c) => c.id === 'email_context')).toBe(false);

		configureEmailRuntimeEnv({ EMAIL_CHAT_TOOLS_ENABLED: 'true' });
		const capability = getCapabilityByPath('capabilities.email_context');
		expect(capability).toBeDefined();
		expect(capability?.directPaths).toEqual(['email.accounts', 'email.messages']);
		expect(listCapabilities().some((c) => c.id === 'email_context')).toBe(true);
	});

	it('delegated agents (agent-call gateway) get no email ops — email.* is not in the supported op policy', () => {
		const supported = BUILDOS_AGENT_SUPPORTED_OPS as readonly string[];
		for (const op of EMAIL_READ_OPS) {
			expect(supported).not.toContain(op);
		}
		expect(supported.some((op) => op.startsWith('email.'))).toBe(false);
	});
});
