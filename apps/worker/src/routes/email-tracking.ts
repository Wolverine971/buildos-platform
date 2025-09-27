// worker-queue/src/routes/email-tracking.ts
import type { Application, Request, Response } from 'express';

import { supabase } from '../lib/supabase';

const TRANSPARENT_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAGAWA0dpQAAAABJRU5ErkJggg==',
  'base64'
);

const PIXEL_HEADERS: Record<string, string> = {
  'Content-Type': 'image/png',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Expires: '0',
  Pragma: 'no-cache',
  'Surrogate-Control': 'no-store'
};

type EmailRecipient = {
  id: string;
  recipient_email: string;
  opened_at: string | null;
  open_count: number | null;
  last_opened_at: string | null;
};

type EmailRecord = {
  id: string;
  subject: string | null;
  email_recipients: EmailRecipient[] | null;
};

function sendTrackingPixel(res: Response): void {
  res.set(PIXEL_HEADERS);
  res.status(200).end(TRANSPARENT_PIXEL);
}

async function handleEmailTracking(req: Request, res: Response): Promise<void> {
  const trackingId = req.params.trackingId;

  if (!trackingId) {
    console.warn('Email tracking request missing trackingId parameter');
    sendTrackingPixel(res);
    return;
  }

  console.log(`Email tracking request received for trackingId=${trackingId}`);

  const userAgent = req.get('user-agent') ?? '';
  const forwardedFor = req.get('x-forwarded-for');
  const realIp = req.get('x-real-ip');
  const ipAddress = forwardedFor?.split(',')[0]?.trim() || realIp || req.ip || '';

  try {
    const { data: email, error: emailError } = await supabase
      .from('emails')
      .select(
        `
        id,
        subject,
        email_recipients (
          id,
          recipient_email,
          opened_at,
          open_count,
          last_opened_at
        )
      `
      )
      .eq('tracking_id', trackingId)
      .single<EmailRecord>();

    if (emailError || !email) {
      if (emailError) {
        console.error(`Email lookup failed for trackingId=${trackingId}:`, emailError);
      } else {
        console.log(`No email found for trackingId=${trackingId}`);
      }

      sendTrackingPixel(res);
      return;
    }

    const recipients = email.email_recipients ?? [];

    console.log(
      `Email ${email.id} (${email.subject ?? 'no-subject'}) has ${recipients.length} recipient(s)`
    );

    if (recipients.length === 0) {
      sendTrackingPixel(res);
      return;
    }

    for (const recipient of recipients) {
      const now = new Date().toISOString();
      const isFirstOpen = !recipient.opened_at;
      const openCount = (recipient.open_count ?? 0) + 1;

      const { error: updateError } = await supabase
        .from('email_recipients')
        .update({
          opened_at: recipient.opened_at ?? now,
          open_count: openCount,
          last_opened_at: now
        })
        .eq('id', recipient.id);

      if (updateError) {
        console.error(
          `Failed to update email recipient ${recipient.id} tracking data:`,
          updateError
        );
      }

      const { error: eventError } = await supabase.from('email_tracking_events').insert({
        email_id: email.id,
        recipient_id: recipient.id,
        event_type: 'opened',
        event_data: {
          is_first_open: isFirstOpen,
          open_count: openCount
        },
        user_agent: userAgent,
        ip_address: ipAddress
      });

      if (eventError) {
        console.error('Failed to record email tracking event:', eventError);
      }
    }
  } catch (error) {
    console.error('Unexpected error handling email tracking:', error);
  }

  sendTrackingPixel(res);
}

export function registerEmailTrackingRoute(app: Application): void {
  app.get('/api/email-tracking/:trackingId', handleEmailTracking);
}
