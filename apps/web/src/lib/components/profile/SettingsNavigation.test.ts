// apps/web/src/lib/components/profile/SettingsNavigation.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SettingsNavigation from './SettingsNavigation.svelte';
import { getSettingsDestinations } from './settings-navigation';

afterEach(cleanup);

describe('SettingsNavigation', () => {
	function destinations(cyclesProfileEnabled = true, stripeEnabled = true) {
		return getSettingsDestinations({ cyclesProfileEnabled, stripeEnabled });
	}

	it('uses the approved groups and one destination model for desktop and mobile', async () => {
		render(SettingsNavigation, {
			props: {
				destinations: destinations(),
				activeId: 'account',
				onchange: vi.fn()
			}
		});

		const desktop = screen.getByRole('navigation', { name: 'Settings sections' });
		expect(within(desktop).getByText('Your BuildOS')).toBeTruthy();
		expect(within(desktop).getByText('Connections')).toBeTruthy();
		expect(within(desktop).getByText('Data & Plan')).toBeTruthy();
		expect(within(desktop).getByRole('link', { name: /Cycles/ })).toBeTruthy();
		expect(within(desktop).getByRole('link', { name: /Billing/ })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Settings section, Account' }));
		const mobileMenu = screen.getByRole('menu', { name: 'Settings sections' });
		expect(within(mobileMenu).getByRole('menuitemradio', { name: /Cycles/ })).toBeTruthy();
		expect(within(mobileMenu).getByRole('menuitemradio', { name: /Billing/ })).toBeTruthy();
	});

	it('omits hidden Cycles and Billing destinations', () => {
		render(SettingsNavigation, {
			props: {
				destinations: destinations(false, false),
				activeId: 'account',
				onchange: vi.fn()
			}
		});

		const desktop = screen.getByRole('navigation', { name: 'Settings sections' });
		expect(within(desktop).queryByRole('link', { name: /Cycles/ })).toBeNull();
		expect(within(desktop).queryByRole('link', { name: /Billing/ })).toBeNull();
	});

	it('exposes expanded and selected state, supports arrow keys, and restores focus', async () => {
		const onchange = vi.fn();
		render(SettingsNavigation, {
			props: {
				destinations: destinations(false, false),
				activeId: 'account',
				onchange
			}
		});

		const trigger = screen.getByRole('button', { name: 'Settings section, Account' });
		expect(trigger.getAttribute('aria-expanded')).toBe('false');

		await fireEvent.keyDown(trigger, { key: 'ArrowDown' });
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		const menu = screen.getByRole('menu', { name: 'Settings sections' });
		const account = within(menu).getByRole('menuitemradio', { name: /Account/ });
		expect(account.getAttribute('aria-checked')).toBe('true');
		expect(document.activeElement).toBe(account);

		await fireEvent.keyDown(account, { key: 'ArrowDown' });
		const preferences = within(menu).getByRole('menuitemradio', { name: /AI Preferences/ });
		expect(document.activeElement).toBe(preferences);

		await fireEvent.click(preferences);
		expect(onchange).toHaveBeenCalledWith('preferences');
		await waitFor(() => expect(document.activeElement).toBe(trigger));
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
	});
});
