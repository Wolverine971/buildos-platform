// src/routes/api/admin/revenue/export/+server.ts
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	// Check admin status
	const { data: adminCheck } = await supabase
		.from('users')
		.select('is_admin')
		.eq('id', user.id)
		.single();

	if (!adminCheck?.is_admin) {
		throw error(403, 'Forbidden');
	}

	const period = url.searchParams.get('period') || 'month';
	const year = parseInt(url.searchParams.get('year') || new Date().getFullYear().toString());
	const month = parseInt(url.searchParams.get('month') || (new Date().getMonth() + 1).toString());

	try {
		// Calculate date ranges
		let startDate: Date;
		let endDate: Date;

		if (period === 'month') {
			startDate = new Date(year, month - 1, 1);
			endDate = new Date(year, month, 0);
		} else if (period === 'quarter') {
			const quarter = Math.floor((month - 1) / 3);
			startDate = new Date(year, quarter * 3, 1);
			endDate = new Date(year, quarter * 3 + 3, 0);
		} else {
			startDate = new Date(year, 0, 1);
			endDate = new Date(year, 11, 31);
		}

		// Get invoices for the period
		const { data: invoices } = await supabase
			.from('invoices')
			.select(
				`
        *,
        users (
          email,
          stripe_customer_id
        ),
        customer_subscriptions (
          stripe_price_id,
          subscription_plans (
            name,
            price,
            interval
          )
        )
      `
			)
			.gte('created_at', startDate.toISOString())
			.lte('created_at', endDate.toISOString())
			.order('created_at', { ascending: false });

		// Build CSV content
		const headers = [
			'Date',
			'Invoice ID',
			'Customer Email',
			'Plan',
			'Status',
			'Amount Paid',
			'Amount Due',
			'Amount Refunded',
			'Net Amount',
			'Currency'
		];

		const rows =
			invoices?.map((invoice) => {
				const netAmount = (invoice.amount_paid || 0) - (invoice.amount_refunded || 0);
				const planName = invoice.customer_subscriptions?.subscription_plans?.name || 'N/A';

				return [
					new Date(invoice.created_at).toLocaleDateString(),
					invoice.stripe_invoice_id,
					invoice.users?.email || 'N/A',
					planName,
					invoice.status,
					(invoice.amount_paid / 100).toFixed(2),
					(invoice.amount_due / 100).toFixed(2),
					(invoice.amount_refunded / 100).toFixed(2),
					(netAmount / 100).toFixed(2),
					invoice.currency.toUpperCase()
				];
			}) || [];

		// Add summary rows
		const totalPaid = invoices?.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0) || 0;
		const totalRefunded =
			invoices?.reduce((sum, inv) => sum + (inv.amount_refunded || 0), 0) || 0;
		const netRevenue = totalPaid - totalRefunded;

		rows.push([]);
		rows.push(['Summary', '', '', '', '', '', '', '', '', '']);
		rows.push(['Total Revenue', '', '', '', '', (totalPaid / 100).toFixed(2), '', '', '', '']);
		rows.push([
			'Total Refunds',
			'',
			'',
			'',
			'',
			'',
			'',
			(totalRefunded / 100).toFixed(2),
			'',
			''
		]);
		rows.push(['Net Revenue', '', '', '', '', '', '', '', (netRevenue / 100).toFixed(2), '']);

		// Convert to CSV
		const csvContent = [
			headers.join(','),
			...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))
		].join('\n');

		return new Response(csvContent, {
			headers: {
				'Content-Type': 'text/csv',
				'Content-Disposition': `attachment; filename="revenue-report-${year}-${month}.csv"`
			}
		});
	} catch (err) {
		console.error('Error exporting revenue data:', err);
		throw error(500, 'Failed to export revenue data');
	}
};
