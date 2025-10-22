// apps/worker/tests/integration/sms-event-scheduling/mocks.ts
/**
 * Mock implementations for SMS Event Scheduling Integration Tests
 */

import { vi, type Mock } from 'vitest';

/**
 * Mock Twilio Client for testing SMS sends without real API calls
 */
export class MockTwilioClient {
	public sendSMS: Mock;
	public sentMessages: Array<{
		to: string;
		body: string;
		metadata?: any;
		sid: string;
		timestamp: Date;
	}> = [];

	private shouldFail: boolean = false;
	private failureCount: number = 0;
	private maxFailures: number = 0;

	constructor() {
		this.sendSMS = vi.fn(async (params: { to: string; body: string; metadata?: any }) => {
			// Simulate failure if configured
			if (this.shouldFail && this.failureCount < this.maxFailures) {
				this.failureCount++;
				throw new Error(`Twilio API Error: ${this.getFailureReason()}`);
			}

			// Generate mock Twilio SID
			const sid = `SM${Date.now()}${Math.random().toString(36).substring(7)}`;

			// Record the sent message
			const sentMessage = {
				to: params.to,
				body: params.body,
				metadata: params.metadata,
				sid,
				timestamp: new Date()
			};

			this.sentMessages.push(sentMessage);

			// Return mock Twilio response
			return {
				sid,
				status: 'queued',
				to: params.to,
				from: '+15555550000',
				body: params.body,
				dateCreated: new Date(),
				dateSent: null,
				dateUpdated: new Date(),
				direction: 'outbound-api',
				errorCode: null,
				errorMessage: null,
				price: null,
				priceUnit: 'USD',
				uri: `/2010-04-01/Accounts/test/Messages/${sid}.json`
			};
		});
	}

	/**
	 * Configure mock to fail for N attempts
	 */
	setFailureMode(maxFailures: number) {
		this.shouldFail = true;
		this.maxFailures = maxFailures;
		this.failureCount = 0;
	}

	/**
	 * Reset failure mode
	 */
	resetFailureMode() {
		this.shouldFail = false;
		this.failureCount = 0;
		this.maxFailures = 0;
	}

	/**
	 * Get all sent messages
	 */
	getSentMessages() {
		return [...this.sentMessages];
	}

	/**
	 * Get messages sent to specific number
	 */
	getMessagesTo(phoneNumber: string) {
		return this.sentMessages.filter((msg) => msg.to === phoneNumber);
	}

	/**
	 * Clear sent message history
	 */
	clear() {
		this.sentMessages = [];
		this.sendSMS.mockClear();
	}

	/**
	 * Verify message was sent
	 */
	expectMessageSent(phoneNumber: string, expectedContent?: string) {
		const messages = this.getMessagesTo(phoneNumber);

		if (messages.length === 0) {
			throw new Error(`No messages sent to ${phoneNumber}`);
		}

		if (expectedContent) {
			const found = messages.some((msg) => msg.body.includes(expectedContent));
			if (!found) {
				throw new Error(
					`No message to ${phoneNumber} contains "${expectedContent}". Messages: ${JSON.stringify(messages.map((m) => m.body))}`
				);
			}
		}
	}

	/**
	 * Verify no message was sent
	 */
	expectNoMessageSent(phoneNumber?: string) {
		if (phoneNumber) {
			const messages = this.getMessagesTo(phoneNumber);
			if (messages.length > 0) {
				throw new Error(
					`Expected no messages to ${phoneNumber}, but ${messages.length} were sent`
				);
			}
		} else {
			if (this.sentMessages.length > 0) {
				throw new Error(
					`Expected no messages sent, but ${this.sentMessages.length} were sent`
				);
			}
		}
	}

	/**
	 * Get mock failure reason based on attempt count
	 */
	private getFailureReason(): string {
		const reasons = [
			'Carrier temporarily unavailable',
			'Rate limit exceeded',
			'Invalid phone number format',
			'Message blocked by carrier'
		];
		return reasons[this.failureCount % reasons.length];
	}
}

/**
 * Mock LLM Service for testing without real API calls
 */
export class MockLLMService {
	public generateText: Mock;
	public generatedMessages: Array<{
		prompt: string;
		response: string;
		cost: number;
	}> = [];

	private shouldFail: boolean = false;

	constructor() {
		this.generateText = vi.fn(async (params: any) => {
			if (this.shouldFail) {
				throw new Error('LLM API Error: Service unavailable');
			}

			// Generate mock response
			const eventTitle = this.extractEventTitle(params.userPrompt);
			const response = `Meeting in 15 mins: ${eventTitle}. Be prepared!`;

			const generated = {
				prompt: params.userPrompt,
				response,
				cost: 0.0001
			};

			this.generatedMessages.push(generated);

			return {
				text: response,
				model: 'deepseek/deepseek-chat',
				costUsd: 0.0001,
				metadata: {
					tokens: {
						prompt: 50,
						completion: 20,
						total: 70
					}
				}
			};
		});
	}

	/**
	 * Configure mock to fail
	 */
	setFailureMode(shouldFail: boolean = true) {
		this.shouldFail = shouldFail;
	}

	/**
	 * Extract event title from prompt (simple mock)
	 */
	private extractEventTitle(prompt: string): string {
		const match = prompt.match(/(?:Title|Event):\s*([^\n]+)/i);
		return match ? match[1].trim() : 'Untitled Event';
	}

	/**
	 * Clear generated message history
	 */
	clear() {
		this.generatedMessages = [];
		this.generateText.mockClear();
	}
}

/**
 * Create mock environment for testing
 */
export function createMockEnvironment() {
	const mockTwilio = new MockTwilioClient();
	const mockLLM = new MockLLMService();

	// Replace real services with mocks
	// Note: Actual implementation depends on how services are injected

	return {
		twilioClient: mockTwilio,
		llmService: mockLLM,

		/**
		 * Clean up all mocks
		 */
		cleanup() {
			mockTwilio.clear();
			mockLLM.clear();
		},

		/**
		 * Reset all mocks to default state
		 */
		reset() {
			mockTwilio.resetFailureMode();
			mockTwilio.clear();
			mockLLM.setFailureMode(false);
			mockLLM.clear();
		}
	};
}

/**
 * Mock calendar webhook payload
 */
export function createMockCalendarWebhook(
	userId: string,
	eventId: string,
	action: 'created' | 'updated' | 'deleted',
	eventData?: {
		title?: string;
		startTime?: string;
		endTime?: string;
	}
) {
	const baseEvent = {
		id: eventId,
		summary: eventData?.title || 'Test Event',
		start: {
			dateTime: eventData?.startTime || new Date().toISOString()
		},
		end: {
			dateTime: eventData?.endTime || new Date(Date.now() + 3600000).toISOString()
		},
		status: action === 'deleted' ? 'cancelled' : 'confirmed'
	};

	return {
		userId,
		calendarId: 'primary',
		action,
		event: baseEvent
	};
}
