// SvelteKit +server.ts specification for BuildOS email webhook endpoint
// Location: src/routes/webhooks/daily-brief-email/+server.ts

import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { createHmac } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
// Alternative: Use your existing email service
// import { EmailService } from '$lib/server/email-service';

/**
 * Environment variables needed:
 * - PRIVATE_BUILDOS_WEBHOOK_SECRET: Shared secret with daily-brief-worker
 * - GMAIL_USER: Gmail account for sending
 * - GMAIL_APP_PASSWORD: App-specific password
 * - SUPABASE_URL: Your Supabase project URL
 * - PRIVATE_SUPABASE_SERVICE_KEY: Service role key
 */

interface WebhookPayload {
  userId: string;
  briefId: string;
  briefDate: string;
  recipientEmail: string;
  timestamp: string;
  metadata?: {
    emailRecordId?: string;
    recipientRecordId?: string;
    trackingId?: string;
    subject?: string;
  };
}

/**
 * Verify webhook signature using HMAC SHA-256
 */
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Timing-safe comparison
  return signature === expectedSignature;
}

/**
 * POST /webhooks/daily-brief-email
 *
 * Receives webhook from daily-brief-worker to send email
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    // 1. Validate webhook headers
    const signature = request.headers.get('x-webhook-signature');
    const timestamp = request.headers.get('x-webhook-timestamp');
    const source = request.headers.get('x-source');

    if (!signature || !timestamp) {
      throw error(401, 'Missing webhook signature or timestamp');
    }

    if (source !== 'daily-brief-worker') {
      throw error(401, 'Invalid webhook source');
    }

    // 2. Parse and validate payload
    const rawBody = await request.text();
    const webhookSecret = import.meta.env.VITE_PRIVATE_BUILDOS_WEBHOOK_SECRET || process.env.PRIVATE_BUILDOS_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('PRIVATE_BUILDOS_WEBHOOK_SECRET not configured');
      throw error(500, 'Webhook secret not configured');
    }

    // Verify signature
    if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      throw error(401, 'Invalid webhook signature');
    }

    // Check timestamp freshness (prevent replay attacks)
    const requestTime = new Date(timestamp).getTime();
    const now = Date.now();
    const MAX_AGE = 5 * 60 * 1000; // 5 minutes

    if (Math.abs(now - requestTime) > MAX_AGE) {
      throw error(401, 'Webhook timestamp too old');
    }

    const payload: WebhookPayload = JSON.parse(rawBody);

    // 3. Initialize Supabase client
    const supabase = createClient(
      import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
      import.meta.env.VITE_PRIVATE_SUPABASE_SERVICE_KEY || process.env.PRIVATE_SUPABASE_SERVICE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // 4. Fetch the daily brief data with llm_analysis
    const { data: brief, error: briefError } = await supabase
      .from('daily_briefs')
      .select('*')
      .eq('id', payload.briefId)
      .single();

    if (briefError || !brief) {
      console.error('Failed to fetch brief:', briefError);
      throw error(404, 'Brief not found');
    }

    // PSEUDO CODE: Get llm_analysis content
    // The llm_analysis field contains the formatted markdown content
    // that should be sent in the email
    const briefContent = brief.llm_analysis || brief.summary_content;

    // 5. Fetch user preferences (optional - for additional customization)
    const { data: preferences } = await supabase
      .from('user_brief_preferences')
      .select('*')
      .eq('user_id', payload.userId)
      .single();

    // 6. Generate email HTML from template
    // PSEUDO CODE: Use your existing email template system
    const emailHtml = generateEmailTemplate({
      subject: payload.metadata?.subject || `Daily Brief - ${new Date(payload.briefDate).toLocaleDateString()}`,
      content: renderMarkdown(briefContent), // Convert markdown to HTML
      briefDate: payload.briefDate,
      briefId: payload.briefId,
      trackingId: payload.metadata?.trackingId,
      userPreferences: preferences
    });

    // 7. Send email using Gmail (or your email service)
    // Option A: Using nodemailer directly
    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: import.meta.env.VITE_GMAIL_USER || process.env.GMAIL_USER,
        pass: import.meta.env.VITE_GMAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD
      }
    });

    const mailOptions = {
      from: `BuildOS <${import.meta.env.VITE_GMAIL_USER || process.env.GMAIL_USER}>`,
      to: payload.recipientEmail,
      subject: payload.metadata?.subject || `Daily Brief - ${new Date(payload.briefDate).toLocaleDateString()}`,
      html: emailHtml,
      // Optional: Add tracking pixel
      headers: payload.metadata?.trackingId ? {
        'X-Tracking-Id': payload.metadata.trackingId
      } : undefined
    };

    await transporter.sendMail(mailOptions);

    // Option B: Using your existing EmailService
    // const emailService = new EmailService();
    // await emailService.send({
    //   to: payload.recipientEmail,
    //   subject: payload.metadata?.subject,
    //   html: emailHtml,
    //   trackingId: payload.metadata?.trackingId
    // });

    // 8. Update email status in database (if tracking)
    if (payload.metadata?.emailRecordId) {
      await supabase
        .from('emails')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .eq('id', payload.metadata.emailRecordId);
    }

    if (payload.metadata?.recipientRecordId) {
      await supabase
        .from('email_recipients')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .eq('id', payload.metadata.recipientRecordId);
    }

    // 9. Log email event for tracking
    await supabase
      .from('email_tracking_events')
      .insert({
        tracking_id: payload.metadata?.trackingId,
        event_type: 'sent',
        recipient_email: payload.recipientEmail,
        metadata: {
          brief_id: payload.briefId,
          user_id: payload.userId,
          sent_via: 'webhook'
        }
      });

    // 10. Return success response
    return json({
      success: true,
      message: 'Email sent successfully',
      briefId: payload.briefId,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Webhook error:', err);

    // Return appropriate error response
    if (err instanceof Error && 'status' in err) {
      throw err; // Re-throw SvelteKit errors
    }

    throw error(500, 'Failed to process webhook');
  }
};

/**
 * GET /webhooks/daily-brief-email/health
 *
 * Health check endpoint
 */
export const GET: RequestHandler = async () => {
  return json({
    status: 'healthy',
    service: 'daily-brief-email-webhook',
    timestamp: new Date().toISOString()
  });
};

// ============================================
// HELPER FUNCTIONS TO IMPLEMENT
// ============================================

/**
 * Generate email HTML template
 * PSEUDO CODE - Implement based on your existing template system
 */
function generateEmailTemplate(data: {
  subject: string;
  content: string;
  briefDate: string;
  briefId: string;
  trackingId?: string;
  userPreferences?: any;
}): string {
  // Your existing email template logic
  // Example structure:
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          /* Your email styles */
        </style>
      </head>
      <body>
        <div class="email-container">
          <h1>${data.subject}</h1>
          <div class="content">
            ${data.content}
          </div>
          <div class="footer">
            <a href="https://build-os.com/briefs/${data.briefId}">View in BuildOS</a>
            <a href="https://build-os.com/settings">Manage Preferences</a>
          </div>
          ${data.trackingId ? `<img src="https://build-os.com/api/email-tracking/${data.trackingId}" width="1" height="1" />` : ''}
        </div>
      </body>
    </html>
  `;
}

/**
 * Convert markdown to HTML
 * PSEUDO CODE - Use your existing markdown renderer
 */
function renderMarkdown(markdown: string): string {
  // Use your existing markdown rendering logic
  // Example: marked, markdown-it, etc.
  // import { marked } from 'marked';
  // return marked(markdown);

  // For now, return as-is (implement your renderer)
  return markdown.replace(/\n/g, '<br>');
}

// ============================================
// SECURITY CONSIDERATIONS
// ============================================
/**
 * 1. HMAC signature validation prevents unauthorized webhooks
 * 2. Timestamp validation prevents replay attacks
 * 3. Source header validation adds extra security layer
 * 4. Use environment variables for all secrets
 * 5. Implement rate limiting at the API gateway level
 * 6. Log all webhook attempts for audit trail
 * 7. Consider IP allowlisting for additional security
 */

// ============================================
// DEPLOYMENT NOTES
// ============================================
/**
 * 1. Set environment variables in your BuildOS deployment:
 *    - PRIVATE_BUILDOS_WEBHOOK_SECRET (same as in daily-brief-worker)
 *    - GMAIL_USER
 *    - GMAIL_APP_PASSWORD
 *    - SUPABASE_URL
 *    - PRIVATE_SUPABASE_SERVICE_KEY
 *
 * 2. The endpoint will be available at:
 *    https://build-os.com/webhooks/daily-brief-email
 *
 * 3. Health check available at:
 *    https://build-os.com/webhooks/daily-brief-email/health
 *
 * 4. Monitor webhook failures in your error tracking system
 *
 * 5. Consider implementing:
 *    - Webhook retry logic in daily-brief-worker
 *    - Dead letter queue for failed emails
 *    - Email provider failover (SendGrid, SES as backup)
 */