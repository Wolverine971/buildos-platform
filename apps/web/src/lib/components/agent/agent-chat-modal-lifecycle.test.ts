// apps/web/src/lib/components/agent/agent-chat-modal-lifecycle.test.ts
// Exercise the modal's actual callbacks without mounting its unrelated panels.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import {
	buildCaptureReceiptUIMessage,
	upsertCaptureReceipt,
	CAPTURE_RECEIPT_COLUMNS
} from './capture-receipt';

const source = readFileSync(new URL('./AgentChatModal.svelte', import.meta.url), 'utf8');
const scriptStart = source.indexOf('<script lang="ts">');
const script = source.slice(
	source.indexOf('>', scriptStart) + 1,
	source.indexOf('</script>', scriptStart)
);
const ast = ts.createSourceFile('modal.ts', script, ts.ScriptTarget.Latest, true);
function callback(name: string): string {
	let found = '';
	function visit(node: ts.Node) {
		if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(ast);
		ts.forEachChild(node, visit);
	}
	visit(ast);
	if (!found) throw new Error(`Missing modal callback: ${name}`);
	return found;
}
function execute(body: string, bindings: Record<string, unknown> = {}) {
	const js = ts.transpileModule(body, {
		compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
	}).outputText;
	return new Function(...Object.keys(bindings), js)(...Object.values(bindings));
}

function propertyCallback(name: string): string {
	let found = '';
	function visit(node: ts.Node) {
		if (ts.isPropertyAssignment(node) && node.name.getText(ast) === name) {
			found = node.initializer.getText(ast);
		}
		ts.forEachChild(node, visit);
	}
	visit(ast);
	if (!found) throw new Error(`Missing modal property callback: ${name}`);
	return found;
}

describe('chat modal lifecycle isolation', () => {
	it.each(['close', 'destroy'])('invalidates pending sends on modal %s', (reason) => {
		const reset = vi.fn();
		const buildMutationSummary = vi.fn(() => ({ hasChanges: false }));
		execute(`${callback('releaseSessionResources')} releaseSessionResources(reason);`, {
			reason,
			finalizeSession: vi.fn(),
			voice: { stop: vi.fn(), cleanup: vi.fn() },
			clearSessionRefreshTimeout: vi.fn(),
			activeRestoredTurnRunId: null,
			invalidateSessionLoads: vi.fn(),
			workerAdoption: { clear: vi.fn() },
			workerRealtime: { stop: vi.fn() },
			stream: { reset, hasSentMessage: true },
			attachments: { cleanup: vi.fn() },
			unsubscribeSessionMessages: vi.fn(),
			agentRunFallbackTimers: new Map(),
			seenTerminalAgentRunIds: new Set(),
			pendingToolResults: new Map(),
			processedToolCallIds: new Set(),
			processedToolResultIds: new Set(),
			handleSSEMessage: { resetTurnState: vi.fn() },
			presenter: { buildMutationSummary, resetMutationTracking: vi.fn() },
			currentSession: null,
			notifyDataMutation: vi.fn()
		});
		expect(reset).toHaveBeenCalledOnce();
		expect(buildMutationSummary).toHaveBeenCalledWith({
			hasMessagesSent: true,
			sessionId: null
		});
	});

	it.each([false, true])(
		'adopts a delayed admission snapshot only for the current send (reset=%s)',
		async (reset) => {
			let resolveSnapshot!: (value: unknown) => void;
			const snapshot = new Promise((resolve) => {
				resolveSnapshot = resolve;
			});
			const stream = { activeStreamRunId: 1 };
			const hydrate = vi.fn();
			const adopt = vi.fn();
			const admission = execute(
				`return ${propertyCallback('adoptWorkerAdmissionResponse')};`,
				{
					workerAdoption: { adoptAdmissionResponse: adopt },
					parseAdmissionResponse: () => ({ descriptor: { handle: { sessionId: 's1' } } }),
					currentSession: null,
					reviewProjectId: 'p1',
					stream,
					admittedSessionFromResponse: () => null,
					loadAgentChatSessionSnapshot: () => snapshot,
					hydrateSessionFromEvent: hydrate
				}
			);
			const pending = admission({});
			if (reset) stream.activeStreamRunId += 1;
			resolveSnapshot({ session: { id: 's1' } });
			if (reset) await expect(pending).rejects.toThrow('Chat focus changed');
			else await pending;
			expect(hydrate).toHaveBeenCalledTimes(reset ? 0 : 1);
			expect(adopt).toHaveBeenCalledTimes(reset ? 0 : 1);
		}
	);

	it.each([
		[false, null, false],
		[false, 'block', false],
		[true, null, false],
		[true, 'block', true]
	])('focus logging with busy=%s and block=%s appends=%s', (busy, blockId, shouldAppend) => {
		const append = vi.fn();
		execute(`${callback('logFocusActivity')}\nlogFocusActivity('Focus changed', null);`, {
			stream: { isTurnBusy: busy },
			currentThinkingBlockId: blockId,
			describeFocus: () => 'project workspace',
			addActivityToThinkingBlock: append
		});
		expect(append).toHaveBeenCalledTimes(shouldAppend ? 1 : 0);
	});

	it('clears the thinking identity when the router clears the conversation', () => {
		const statement = ast.statements.find(
			(node) =>
				ts.isVariableStatement(node) &&
				node.declarationList.declarations.some(
					(decl) => decl.name.getText(ast) === 'shellRouter'
				)
		)!;
		const result = execute(
			`let messages = ['old']; let currentThinkingBlockId = 'old-block'; ${statement.getText(ast)}; shellRouter.clearMessages(); return { messages, currentThinkingBlockId };`,
			{
				createAgentChatShellRouter: (deps: unknown) => deps
			}
		);
		expect(result).toEqual({ messages: [], currentThinkingBlockId: null });
	});

	it('ignores both late receipt loads and queued realtime callbacks after disposal', async () => {
		let resolveRows!: (result: unknown) => void;
		let live!: (payload: unknown) => void;
		let dispose!: () => void;
		const loading = new Promise((resolve) => {
			resolveRows = resolve;
		});
		const query: Record<string, unknown> = { then: loading.then.bind(loading) };
		for (const method of ['select', 'eq', 'in', 'order', 'limit']) query[method] = () => query;
		const channel = {
			on: vi.fn((_event, _filter, handler) => {
				live = handler;
			}),
			subscribe: vi.fn()
		};
		const client = { channel: () => channel, from: () => query, removeChannel: vi.fn() };
		const start = source.indexOf(
			'$effect',
			source.indexOf('// Capture receipts for the active session')
		);
		const end = source.indexOf('// Establish the standing per-user worker delivery', start);
		const h = execute(
			`let currentSessionId = 's1'; let captureReceipts = []; ${source.slice(start, end)} return { receipts: () => captureReceipts, switchSession: () => { currentSessionId = 's2'; captureReceipts = []; } };`,
			{
				$effect: (fn: () => () => void) => {
					dispose = fn();
				},
				browser: true,
				supabaseClient: client,
				buildCaptureReceiptUIMessage,
				upsertCaptureReceipt,
				CAPTURE_RECEIPT_COLUMNS
			}
		);
		const row = {
			id: 'r1',
			session_id: 's1',
			project_id: 'p1',
			status: 'captured',
			created_at: '2026-10-18T12:00:00Z',
			thinking_log_document_id: 'doc1'
		};
		live({ new: row });
		expect(h.receipts()).toHaveLength(1);
		dispose();
		h.switchSession();
		live({ new: row });
		expect(h.receipts()).toEqual([]);
		resolveRows({ data: [row] });
		await loading;
		await Promise.resolve();
		expect(h.receipts()).toEqual([]);
		expect(client.removeChannel).toHaveBeenCalledWith(channel);
	});

	it.each([false, true])(
		'applies a delayed brain dump only to its current session (switched=%s)',
		async (switched) => {
			let resolveBody!: (value: unknown) => void;
			const body = new Promise((resolve) => {
				resolveBody = resolve;
			});
			const h = execute(
				`let currentSession = { id: 's1' }; let brainDumpContext = null; ${callback('hydrateBrainDumpContextFromSession')} return { hydrate: hydrateBrainDumpContextFromSession, switchSession: () => { currentSession = { id: 's2' }; }, context: () => brainDumpContext };`,
				{
					fetch: vi.fn(async () => ({ ok: true, json: () => body })),
					dev: false
				}
			);
			const hydration = h.hydrate({ id: 's1', agent_metadata: { braindump_id: 'dump1' } });
			if (switched) h.switchSession();
			resolveBody({ success: true, data: { braindump: { id: 'dump1' } } });
			await hydration;
			expect(h.context()).toEqual(switched ? null : { id: 'dump1' });
		}
	);
});
