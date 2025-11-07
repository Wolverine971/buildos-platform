// apps/web/src/routes/api/stripe/invoice/[id]/download/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';
import { StripeService } from '$lib/services/stripe-service';

export const GET: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	if (!StripeService.isEnabled()) {
		return ApiResponse.badRequest('Stripe is not enabled');
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
			return ApiResponse.notFound('Invoice');
		}

		// If we already have the PDF URL, return it
		if (invoice.invoice_pdf) {
			return ApiResponse.success({ url: invoice.invoice_pdf });
		}

		// Otherwise, fetch from Stripe
		const stripe = StripeService.getClient();

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

				return ApiResponse.success({ url: finalizedInvoice.invoice_pdf });
			}

			return ApiResponse.badRequest('PDF not available for this invoice');
		}

		// Update our database with the PDF URL
		await supabase
			.from('invoices')
			.update({ invoice_pdf: stripeInvoice.invoice_pdf })
			.eq('stripe_invoice_id', invoiceId);

		return ApiResponse.success({ url: stripeInvoice.invoice_pdf });
	} catch (error) {
		console.error('Error retrieving invoice:', error);
		return ApiResponse.internalError(error, 'Failed to retrieve invoice');
	}
};
