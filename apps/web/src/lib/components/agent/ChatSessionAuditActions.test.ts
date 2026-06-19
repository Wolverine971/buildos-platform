// apps/web/src/lib/components/agent/ChatSessionAuditActions.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import ChatSessionAuditActions from './ChatSessionAuditActions.svelte';

const {
	pageStore,
	fetchChatSessionAuditPayloadMock,
	downloadChatSessionAuditMarkdownMock,
	downloadChatSessionAuditBundleMock
} = vi.hoisted(() => ({
	pageStore: {
		subscribe(callback: (value: { data: { user: { is_admin: boolean } } }) => void) {
			callback({
				data: {
					user: {
						is_admin: true
					}
				}
			});
			return () => {};
		}
	},
	fetchChatSessionAuditPayloadMock: vi.fn(),
	downloadChatSessionAuditMarkdownMock: vi.fn(),
	downloadChatSessionAuditBundleMock: vi.fn()
}));

vi.mock('$app/stores', () => ({
	page: pageStore
}));

vi.mock('$lib/stores/toast.store', () => ({
	toastService: {
		success: vi.fn(),
		error: vi.fn()
	}
}));

vi.mock('$lib/services/admin/chat-session-audit-export', () => ({
	fetchChatSessionAuditPayload: fetchChatSessionAuditPayloadMock,
	downloadChatSessionAuditMarkdown: downloadChatSessionAuditMarkdownMock
}));

vi.mock('$lib/services/admin/chat-session-audit-bundle', () => ({
	downloadChatSessionAuditBundle: downloadChatSessionAuditBundleMock
}));

describe('ChatSessionAuditActions', () => {
	beforeEach(() => {
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		});
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('renders the export dropdown above the modal overlay layer', async () => {
		render(ChatSessionAuditActions, {
			props: {
				sessionId: 'session-1'
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: /^export$/i }));

		expect(screen.getByRole('menu')).toHaveClass('z-[10001]');
		expect(screen.getByRole('button', { name: /close export menu/i })).toHaveClass('z-[10000]');
		expect(screen.getByRole('menuitem', { name: /export as markdown/i })).toBeInTheDocument();
		expect(
			screen.getByRole('menuitem', { name: /export as separate files/i })
		).toBeInTheDocument();
	});
});
