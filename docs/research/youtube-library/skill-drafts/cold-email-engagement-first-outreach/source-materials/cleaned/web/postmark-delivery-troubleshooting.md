---
doc_type: cleaned-source-card
skill: cold-email-engagement-first-outreach
source_kind: web
slug: 'Postmark Delivery Troubleshooting'
title: 'Troubleshooting email delivery issues | Postmark Support Center'
source_url: 'https://postmarkapp.com/support/article/troubleshooting-email-delivery-issues'
source_label: 'Postmark troubleshooting'
status: 'acquired'
cleaned_path: 'docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/cleaned/web/postmark-delivery-troubleshooting.md'
raw_artifact_removed: 'web/postmark-delivery-troubleshooting.html'
created: 2026-05-15
visibility: internal
publish: false
path: docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/cleaned/web/postmark-delivery-troubleshooting.md
---

# Troubleshooting email delivery issues | Postmark Support Center

Source URL: <https://postmarkapp.com/support/article/troubleshooting-email-delivery-issues>

Source type: WEB cleaned source card.

Raw artifact policy: raw HTML snapshot replaced by this cleaned Markdown note.

## Use In Cold Email Architecture

Delivery diagnosis.

## Source Notes

- Acquisition status: acquired.
- Source label: Postmark troubleshooting.
- Source description: From time to time, you might notice that messages sent through Postmark aren’t arriving in your recipients’ inboxes, or they’re landing in spam. Delivery…

## Cleaned Extract

From time to time, you might notice that messages sent through Postmark aren’t arriving in your recipients’ inboxes, or they’re landing in spam. Delivery issues can happen for a few different reasons—but the steps to troubleshoot them are usually the same.

This guide walks you through how to diagnose and fix common causes of deliverability problems.

In most cases, delivery issues fall into three main categories:Infrastructure, Sending Practices, and Content.

### 1. Infrastructure

Postmark takes care of nearly all the infrastructure that impacts email deliverability. We maintain a high sender reputation, manage bounce and spam complaint handling, throttle appropriately to ISPs, and keep our IPs clean and authenticated with DKIM, SPF, and DMARC.

Still, there are a couple of important setup steps you can take to ensure everything works as expected.

#### ✅ Verify your DKIM and Return-Path

Make sure your Sender Signature or Domain in Postmark is verified for both DKIM and Return-Path.You can check this in your Postmark account under Sender Signatures or Domains.

You can also confirm your DKIM and SPF are passing by sending a test email to a Gmail address. Then open the message, select Show original, and look for a header like this:

If you don’t see both passing, review your DNS setup.

👉 Learn more: How to set up DKIM for Postmark

### 2. Sending Practices

Even if your infrastructure is solid, sending emails to people who didn’t ask for them—or who don’t expect them—can hurt your deliverability.The rule of thumb: Only send emails to people who are expecting them, and always include an easy way to opt out.

Here’s how to check that your sending practices are in good shape.

#### 📉 Review your bounce rate

A healthy bounce rate should be well under 5%.If it’s higher, you may be sending to old or invalid addresses. Remove inactive or incorrect emails regularly to help maintain a good reputation.

#### 🚫 Monitor your spam complaint rate

Transactional emails should rarely receive spam complaints.Your complaint rate should be below 0.10% (that’s 1 in every 1,000 messages). If you see more than that, review whether recipients truly expect to receive those messages.

For example, one customer discovered high spam complaints on their “welcome” email for a one-time-use product. Because users didn’t expect follow-up messages, the welcome email was unnecessary and perceived as spam.

Email content plays a bigger role in deliverability than most people realize. Certain wording, HTML structure, or links can trigger filters—even when everything else looks right.

Here’s how to review and optimize your message content:

#### 🧪 Check your Spam Score

You can use Postmark’s Spam Check tool to evaluate your message.A score under 5 is acceptable, and if you’re sending through Postmark, it’s often a negative number (which is even better due to our whitelisting and accreditation).

#### 💻 Use well-written HTML

If you’re sending HTML, make sure it’s clean and compliant:

- Avoid excessive or oversized images.

- Ensure your code is valid and properly formatted.

- Keep the layout simple and easy to render.

👉 Read: Designing modern HTML emails

#### 🔗 Avoid URL shorteners

Services like Bitly are commonly blocked or flagged by ISPs because spammers use them to disguise malicious links.Instead, use:

- Your own domain for links, or

- Trusted URLs from known services.

You can check whether a domain or IP is on a blocklist using MX Toolbox’s blacklist check.

#### 📧 Separate your sending streams

Keep your transactional and bulk/promotional messages on separate subdomains, each with its own DKIM and Return-Path.

- transactional.yourdomain.com → for app notifications or receipts

- news.yourdomain.com → for newsletters or announcements

This separation protects your transactional stream from being affected by the engagement or deliverability of your marketing messages.To build a positive reputation for a new subdomain, start by sending to your most engaged users and gradually increase volume.

#### 🌐 Match your link and image domains

When your links or image URLs point to a different domain than your “From” address, filters may flag it as suspicious.Make sure your link and image URLs match your sending domain whenever possible.

If you host images elsewhere, consider using your own CDN under your primary domain.

### 4. Test, test, test

After you’ve made adjustments, test your emails by sending to various ISPs (like Gmail, Outlook, and Yahoo).

- Sending plain text versions first, then gradually adding HTML elements.

- Testing alternate subject lines or body content.

- Removing certain elements (like phone numbers or long URLs) if messages continue landing in spam.

Sometimes, even small details—like a phone number—can trigger filters. ISPs like Gmail use adaptive algorithms based on each user’s past spam markings, so testing is the best way to find what works.

Email deliverability is part science, part art.Postmark works hard to manage the technical side—clean IPs, authentication, and compliant sending infrastructure—but your sending habits and content choices play a major role, too.

Following the steps above will help you identify where issues might be coming from and improve your inbox placement over time.

And of course, we’re always happy to help.If you’ve gone through these steps and still notice problems, reach out to Postmark Support with sample message links or headers, and we’ll troubleshoot further.
