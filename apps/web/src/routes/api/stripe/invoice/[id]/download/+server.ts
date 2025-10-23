// apps/web/src/routes/api/stripe/invoice/[id]/download/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { StripeService } from '$lib/services/stripe-service';
import Stripe from 'stripe';
import { PRIVATE_STRIPE_SECRET_KEY } from '$env/static/private';

export const GET: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!StripeService.isEnabled()) {
		return json({ error: 'Stripe is not enabled' }, { status: 400 });
	}

	const invoiceId = params.id;

	try {
		// Verify the invoice belongs to the user
		const { data: invoice, error } = await supabase
			.from('invoices')
			.select('stripe_invoice_id, invoice_pdf')
			.eq('stripe_invoice_id', invoiceId)
			.eq('user_id', user.id)
			.single();

		if (error || !invoice) {
			return json({ error: 'Invoice not found' }, { status: 404 });
		}

		// If we already have the PDF URL, return it
		if (invoice.invoice_pdf) {
			return json({ url: invoice.invoice_pdf });
		}

		// Otherwise, fetch from Stripe
		const stripe = new Stripe(PRIVATE_STRIPE_SECRET_KEY!, {
			apiVersion: '2023-10-16'
		});

		const stripeInvoice = await stripe.invoices.retrieve(invoiceId);

		if (!stripeInvoice.invoice_pdf) {
			// Finalize the invoice if it's still a draft
			if (stripeInvoice.status === 'draft') {
				await stripe.invoices.finalizeInvoice(invoiceId);
				const finalizedInvoice = await stripe.invoices.retrieve(invoiceId);

				// Update our database with the PDF URL
				if (finalizedInvoice.invoice_pdf) {
					await supabase
						.from('invoices')
						.update({ invoice_pdf: finalizedInvoice.invoice_pdf })
						.eq('stripe_invoice_id', invoiceId);
				}

				return json({ url: finalizedInvoice.invoice_pdf });
			}

			return json({ error: 'PDF not available for this invoice' }, { status: 400 });
		}

		// Update our database with the PDF URL
		await supabase
			.from('invoices')
			.update({ invoice_pdf: stripeInvoice.invoice_pdf })
			.eq('stripe_invoice_id', invoiceId);

		return json({ url: stripeInvoice.invoice_pdf });
	} catch (error) {
		console.error('Error retrieving invoice:', error);
		return json({ error: 'Failed to retrieve invoice' }, { status: 500 });
	}
};
