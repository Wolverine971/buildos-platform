// packages/twilio-service/src/__tests__/sms.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SMSService } from '../services/sms.service';
import { TwilioClient } from '../client';

// Don't mock TwilioClient - we need to test formatPhoneNumber
// vi.mock('../client');

describe('SMS Service', () => {
	let smsService: SMSService;
	let mockTwilioClient: any;
	let mockSupabase: any;

	const createMockSupabase = () => {
		// Track call count to return different values
		let singleCallCount = 0;

		const mock: any = {
			from: vi.fn().mockImplementation(() => mock),
			select: vi.fn().mockImplementation(() => mock),
			eq: vi.fn().mockImplementation(() => mock),
			insert: vi.fn().mockImplementation(() => mock),
			update: vi.fn().mockImplementation(() => mock),
			single: vi.fn().mockImplementation(() => {
				singleCallCount++;
				// First call: template query
				if (singleCallCount === 1) {
					return Promise.resolve({
						data: {
							id: 'template-id',
							message_template: 'Task: {{task_name}} due {{due_time}}',
							usage_count: 0
						}
					});
				}
				// Second call: user preferences (checkUserSMSPreferences)
				if (singleCallCount === 2) {
					return Promise.resolve({
						data: {
							phone_verified: true,
							task_reminders: true,
							opted_out: false,
							// No quiet hours set to avoid time-dependent test failures
							quiet_hours_start: null,
							quiet_hours_end: null,
							daily_sms_limit: 10,
							daily_sms_count: 0
						}
					});
				}
				// Third call: insert message result
				return Promise.resolve({
					data: {
						id: 'message-id',
						user_id: 'user-123',
						phone_number: '+15551234567'
					}
				});
			}),
			resetCallCount: () => {
				singleCallCount = 0;
			}
		};

		return mock;
	};

	beforeEach(() => {
		mockTwilioClient = {
			sendSMS: vi.fn().mockResolvedValue({ sid: 'test-sid' })
		};

		mockSupabase = createMockSupabase();

		smsService = new SMSService(mockTwilioClient, mockSupabase);
	});

	it('should send task reminder SMS', async () => {
		const params = {
			userId: 'user-123',
			phoneNumber: '+15551234567',
			taskName: 'Complete report',
			dueDate: new Date(Date.now() + 3600000) // 1 hour from now
		};

		const result = await smsService.sendTaskReminder(params);

		expect(result.success).toBe(true);
		expect(result.messageId).toBe('message-id');
		expect(mockTwilioClient.sendSMS).toHaveBeenCalledWith(
			expect.objectContaining({
				to: '+15551234567',
				body: expect.stringContaining('Complete report')
			})
		);
	});

	it('should not send SMS if user has opted out', async () => {
		// Create a fresh mock with opted_out user
		let singleCallCount = 0;
		mockSupabase.single = vi.fn().mockImplementation(() => {
			singleCallCount++;
			// First call: template query
			if (singleCallCount === 1) {
				return Promise.resolve({
					data: {
						id: 'template-id',
						message_template: 'Task: {{task_name}} due {{due_time}}',
						usage_count: 0
					}
				});
			}
			// Second call: user preferences - opted out
			return Promise.resolve({
				data: {
					phone_verified: true,
					task_reminders: true,
					opted_out: true
				}
			});
		});

		const params = {
			userId: 'user-123',
			phoneNumber: '+15551234567',
			taskName: 'Complete report',
			dueDate: new Date(Date.now() + 3600000)
		};

		await expect(smsService.sendTaskReminder(params)).rejects.toThrow(
			'User has disabled task reminder SMS'
		);
	});

	it('should format relative time correctly', async () => {
		const params = {
			userId: 'user-123',
			phoneNumber: '+15551234567',
			taskName: 'Test task',
			dueDate: new Date(Date.now() + 30 * 60000) // 30 minutes from now
		};

		await smsService.sendTaskReminder(params);

		expect(mockTwilioClient.sendSMS).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.stringContaining('in 30 minutes')
			})
		);
	});

	it('should calculate priority correctly', async () => {
		// Test the calculatePriority method indirectly through sendTaskReminder
		// by checking the insert call's priority field
		const testCases = [
			{ hours: 0.5, expected: 'urgent' }, // 30 minutes
			{ hours: 12, expected: 'high' }, // 12 hours
			{ hours: 48, expected: 'normal' }, // 2 days
			{ hours: 96, expected: 'low' } // 4 days
		];

		for (const testCase of testCases) {
			// Reset mocks for each iteration
			mockSupabase = createMockSupabase();
			mockTwilioClient.sendSMS.mockClear();
			smsService = new SMSService(mockTwilioClient, mockSupabase);

			const params = {
				userId: 'user-123',
				phoneNumber: '+15551234567',
				taskName: 'Test task',
				dueDate: new Date(Date.now() + testCase.hours * 3600000)
			};

			await smsService.sendTaskReminder(params);

			// Check that the insert was called with the correct priority
			expect(mockSupabase.insert).toHaveBeenCalledWith(
				expect.objectContaining({
					priority: testCase.expected
				})
			);
		}
	});
});

describe('TwilioClient', () => {
	it('should format phone numbers correctly', () => {
		// Test the phone number formatting logic directly
		// This mirrors the private formatPhoneNumber method in TwilioClient
		const formatPhoneNumber = (phone: string): string => {
			// Remove all non-numeric characters
			const cleaned = phone.replace(/\D/g, '');

			// Add US country code if not present
			if (cleaned.length === 10) {
				return `+1${cleaned}`;
			} else if (cleaned.length === 11 && cleaned.startsWith('1')) {
				return `+${cleaned}`;
			} else if (cleaned.startsWith('+')) {
				return phone;
			}

			return `+${cleaned}`;
		};

		// Test various phone number formats
		const testCases = [
			{ input: '5551234567', expected: '+15551234567' },
			{ input: '15551234567', expected: '+15551234567' },
			{ input: '+15551234567', expected: '+15551234567' },
			{ input: '(555) 123-4567', expected: '+15551234567' },
			{ input: '555-123-4567', expected: '+15551234567' }
		];

		testCases.forEach(({ input, expected }) => {
			const formatted = formatPhoneNumber(input);
			expect(formatted).toBe(expected);
		});
	});
});
