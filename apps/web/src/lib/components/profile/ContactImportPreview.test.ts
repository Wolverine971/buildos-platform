// apps/web/src/lib/components/profile/ContactImportPreview.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import ContactImportPreview from './ContactImportPreview.svelte';
import type { ContactImportPreviewRow } from '$lib/types/profile-contacts';

const rows: ContactImportPreviewRow[] = [
	{
		row_number: 2,
		status: 'ready',
		action: 'create_new',
		normalized_input: {
			display_name: 'Alexandria Very Long Contact Name',
			methods: [
				{ method_type: 'email', value: 'alexandria@example.com' },
				{ method_type: 'phone', value: '+1 (415) 555-1234' }
			]
		}
	},
	{
		row_number: 3,
		status: 'error',
		action: 'none',
		reason: 'Display name is required'
	}
];

describe('ContactImportPreview', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders a bounded mobile card list with every row field', () => {
		render(ContactImportPreview, { props: { rows } });

		const mobileList = screen.getByTestId('contact-import-mobile-list');
		expect(mobileList).toHaveClass('md:hidden', 'overflow-y-auto', 'max-h-80');
		expect(
			within(mobileList).getByText('Alexandria Very Long Contact Name')
		).toBeInTheDocument();
		expect(within(mobileList).getByText(/a\*\*\*@example\.com/)).toBeInTheDocument();
		expect(within(mobileList).getByText(/\*\*\*1234/)).toBeInTheDocument();
		expect(within(mobileList).getByText('Create new')).toBeInTheDocument();
		expect(within(mobileList).getByText('Display name is required')).toBeInTheDocument();
	});

	it('preserves the six-column desktop table above the mobile breakpoint', () => {
		render(ContactImportPreview, { props: { rows } });

		const desktopTable = screen.getByTestId('contact-import-desktop-table');
		expect(desktopTable).toHaveClass('hidden', 'md:block');
		expect(within(desktopTable).getByRole('table')).toHaveClass('min-w-[640px]');
		expect(within(desktopTable).getAllByRole('columnheader')).toHaveLength(6);
	});
});
