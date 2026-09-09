// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
const { getPreferences, sendCode } = vi.hoisted(() => ({
	getPreferences: vi.fn(),
	sendCode: vi.fn()
}));
vi.mock('$lib/services/sms.service', () => ({
	smsService: { getSMSPreferences: getPreferences, verifyPhoneNumber: sendCode }
}));
import PhoneVerificationCard from './PhoneVerificationCard.svelte';

describe('onboarding phone verification', () => {
	beforeEach(() => {
		getPreferences.mockReset();
		sendCode.mockReset();
	});
	afterEach(cleanup);
	it('formats an existing +1 number without dropping its final digit', async () => {
		getPreferences.mockResolvedValue({
			success: true,
			data: {
				preferences: {
					phone_number: '+12025550123',
					phone_verified: true,
					opted_out: false
				}
			}
		});
		const onVerified = vi.fn();
		render(PhoneVerificationCard, { userId: 'user-1', onVerified, onSkip: vi.fn() });
		expect(await screen.findByText('(202) 555-0123')).toBeInTheDocument();
		expect(onVerified).toHaveBeenCalledWith('+12025550123');
	});
	it('never treats an opted-out number as permission to send texts', async () => {
		getPreferences.mockResolvedValue({
			success: true,
			data: {
				preferences: { phone_number: '+12025550123', phone_verified: true, opted_out: true }
			}
		});
		const onVerified = vi.fn();
		render(PhoneVerificationCard, { userId: 'user-1', onVerified, onSkip: vi.fn() });
		expect(await screen.findByText(/Texts are currently opted out/)).toBeInTheDocument();
		expect(onVerified).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: 'Continue without texts' })).toBeEnabled();
	});
	it('normalizes pasted country codes and prevents duplicate verification sends', async () => {
		getPreferences.mockResolvedValue({ success: true, data: { preferences: {} } });
		sendCode.mockReturnValue(new Promise(() => {}));
		render(PhoneVerificationCard, { userId: 'user-1', onVerified: vi.fn(), onSkip: vi.fn() });
		const phone = await screen.findByRole('textbox', { name: 'Phone number' });
		await fireEvent.input(phone, { target: { value: '+1 202 555 0123' } });
		const send = screen.getByRole('button', { name: 'Send Code' });
		await waitFor(() => expect(send).toBeEnabled());
		await fireEvent.click(send);
		await fireEvent.keyPress(phone, { key: 'Enter' });
		expect(sendCode).toHaveBeenCalledExactlyOnceWith('+12025550123');
	});
});
