// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import ErrorDetailsModal from './ErrorDetailsModal.svelte';

describe('ErrorDetailsModal', () => {
	beforeEach(() => {
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		});
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
		vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('links payload-correlated errors directly to their chat logs', async () => {
		render(ErrorDetailsModal, {
			props: {
				isOpen: true,
				error: {
					id: 'error-1',
					error_type: 'llm_error',
					error_message: 'The operation timed out',
					severity: 'error',
					project_id: 'project-1',
					project: {
						id: 'project-1',
						name: 'Media CRM'
					},
					operation_payload: {
						chatSessionId: 'chat-session-1',
						projectId: 'project-1'
					}
				}
			}
		});

		const chatLogsLink = await screen.findByRole('link', { name: /open chat logs/i });
		expect(chatLogsLink).toHaveAttribute(
			'href',
			'/admin/chat/sessions?chat_session_id=chat-session-1'
		);
		for (const projectLink of screen.getAllByRole('link', { name: /media crm/i })) {
			expect(projectLink).toHaveAttribute('href', '/projects/project-1');
		}
	});

	it('supports snake_case session ids from metadata', async () => {
		render(ErrorDetailsModal, {
			props: {
				isOpen: true,
				error: {
					id: 'error-2',
					error_type: 'api_error',
					error_message: 'Request failed',
					severity: 'error',
					metadata: {
						chat_session_id: 'chat-session-2'
					}
				}
			}
		});

		expect(await screen.findByRole('link', { name: /open chat logs/i })).toHaveAttribute(
			'href',
			'/admin/chat/sessions?chat_session_id=chat-session-2'
		);
	});
});
