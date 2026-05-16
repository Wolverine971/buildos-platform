---
doc_type: cleaned-source-card
skill: cold-email-engagement-first-outreach
source_kind: web
slug: 'Google Email Sender Guidelines'
title: 'Email sender guidelines - Google Workspace Admin Help'
source_url: 'https://support.google.com/a/answer/81126'
source_label: 'Google email sender guidelines'
status: 'acquired; official-current'
cleaned_path: 'docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/cleaned/web/google-email-sender-guidelines.md'
raw_artifact_removed: 'web/google-email-sender-guidelines.html'
created: 2026-05-15
visibility: internal
publish: false
path: docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/cleaned/web/google-email-sender-guidelines.md
---

# Email sender guidelines - Google Workspace Admin Help

Source URL: <https://support.google.com/a/answer/81126>

Source type: WEB cleaned source card.

Raw artifact policy: raw HTML snapshot replaced by this cleaned Markdown note.

## Use In Cold Email Architecture

Gmail and Google Workspace sender requirements.

## Source Notes

- Acquisition status: acquired; official-current.
- Source label: Google email sender guidelines.
- Source description: The guidelines in this article can help you successfully send and deliver email to personal Gmail accounts. Starting in 2024, email senders must meet the requirements described here to send email to G

## Cleaned Extract

## Email sender guidelines

The guidelines in this article can help you successfully send and deliver email to personal Gmail accounts. Starting in 2024, email senders must meet the requirements described here to send email to Gmail personal accounts. A personal Gmail account is an account that ends in @gmail.com or @googlemail.com.

For the latest updates about sender requirements, visit the Email sender guidelines FAQ.

Google Workspace senders: If you use Google Workspace to send large volumes of email, review the Spam and abuse policy in Gmail. The policy is part of the Google Workspace Acceptable Use Policy.

### Sender requirements updates

This table lists our updates to the sender guidelines and requirements:

| Sender requirement | Date added |

| Use a TLS connection for transmitting email | Dec. 2023 |

### Sender requirements and guidelines

Follow these guidelines to help ensure messages are delivered to Gmail accounts as expected, and to help prevent Gmail from limiting sending rates, blocking messages, or marking messages as spam.

Starting February 1, 2024, all email senders who send email to Gmail accounts must meet the requirements in this section. Important: If you send more than 5,000 messages per day to Gmail accounts, follow the Requirements for sending 5,000 or more messages per day.

- Set up SPF or DKIM email authentication for your sending domains.

- Ensure that sending domains or IPs have valid forward and reverse DNS records, also referred to as PTR records. Learn more

- Use a TLS connection for transmitting email. For steps to set up TLS in Google Workspace, visit Require a secure connection for email.

- Keep spam rates reported in Postmaster Tools below 0.3%. Learn more about spam rates

- Format messages according to the Internet Message Format standard, RFC 5322.

- Don’t impersonate Gmail From: headers. Gmail will begin using a DMARC quarantine enforcement policy, and impersonating Gmail From: headers might impact your email delivery.

Starting February 1, 2024, email senders who send more than 5,000 messages per day to Gmail accounts must meet the requirements in this section.

- Set up SPF and DKIM email authentication for your domain.

- Set up DMARC email authentication for your sending domain. Your DMARC enforcement policy can be set to none. Learn more

- Keep spam rates reported in Postmaster Tools below 0.30%. Learn more about spam rates

- For direct email, the domain in the sender's From: header must be aligned with either the SPF domain or the DKIM domain. This is required to pass DMARC alignment.

- Marketing messages and subscribed messages must support one-click unsubscribe, and include a clearly visible unsubscribe link in the message body. Learn more

If you send more than 5,000 emails per day before February 1, 2024, follow the guidelines in this article as soon as possible. Meeting the sender requirements before the deadline may improve your email delivery. If you don’t meet the requirements described in this article, your email might not be delivered as expected, or might be marked as spam. To get help with email delivery issues, go to Troubleshooting.

#### Email authentication requirements & guidelines

We require that you set up these email authentication methods for your domain:

- All senders: SPF or DKIM

- Bulk senders: SPF, DKIM, and DMARC

Authenticated messages:

- Help protect recipients from malicious messages, such as spoofing and phishing messages.

- Help protect you and your organization from being impersonated.

- Are less likely to be rejected or marked as spam by Gmail.

Set up email authentication for each of your sending domains at your domain provider. You can use instructions Google provides and our domain provider's email authentication support information.

To verify messages are authenticated, Google performs checks on messages sent to Gmail accounts. To improve email delivery, we recommend that you always set up SPF, DKIM, and DMARC for your domains. Make sure you're meeting the minimum authentication requirements described on this page. Messages that aren’t authenticated with these methods might be marked as spam or rejected with a 5.7.26 error.

If you use an email service provider, verify that they authenticate your domain’s email with SPF and DKIM.

If you regularly forward email or manage a forwarding service, help ensure forwarded messages are authenticated by following our Best practices for forwarding email to Gmail.

We recommend you always set up email authentication for the domain that hosts your public website

SPF prevents spammers from sending unauthorized messages that appear to be from your domain. Set up SPF by publishing an SPF record at your domain. The SPF record for your domain should include all email senders for your domain. If your third-party senders aren't included in your SPF record, messages from these senders are more likely to be marked as spam. Learn how to define your SPF record and add it to your domain.

Turn on DKIM for the domain that sends your email. Receiving servers use DKIM to verify that the domain owner actually sent the message. If you use Google Workspace to send email, learn how to turn on DKIM for your domain. If you don’t use Google Workspace to send email, you can use one of many available internet tools to create your DKIM keys, or check with your domain provider for help.

Important: Sending to personal Gmail accounts requires a DKIM key of 1024 bits or longer. For security reasons, we recommend using a 2048-bit key if your domain provider supports this. Learn more about DKIM key length.

DMARC tells receiving servers what to do with your messages that don’t pass SPF or DKIM. Set up DMARC by publishing a DMARC record for your domain. To pass DMARC authentication, messages must be authenticated by SPF or DKIM, or both. The authenticating domain must be the same domain that appears in the message From: header. Learn how to set up DMARC.

We recommend you set up DMARC reports so you can monitor email sent from your domain, or appears to have been sent from your domain. DMARC reports help you identify senders that may be impersonating your domain. Learn more about DMARC reports.

#### Infrastructure configuration requirements and guidelines

Important: The sending IP address must match the IP address of the hostname specified in the Pointer (PTR) record.

The public IP address of a sending SMTP server must have a corresponding PTR record that resolves to a hostname. This is called a reverse DNS lookup. The same hostname must also have an A (for IPv4) or AAAA (for IPv6) record that resolves to the same public IP address used by the sending server. This is called a forward DNS lookup.

Set up valid reverse DNS records of your sending server IP addresses that point to your domain. Check for a PTR record with the Google Admin Toolbox Dig tool.

##### Shared IP addresses

A shared IP address is an IP address used by more than one email sender. The activity of any senders using a shared IP address affects the reputation of all senders for that shared IP address. A negative reputation can impact your delivery rate.

If you use a shared IP address for sending email:

- Make sure the shared IP address isn’t on any internet blocklist. Messages sent from IP addresses on a blocklist are more likely to be marked as spam.

- If you use an email service provider for your shared IP, use Postmaster Tools to check the reputation of the shared IP address.

#### Subscription requirements and guidelines

If you manage mailing lists or other email subscriptions, you should send email only to people who want to get messages from you. These recipients are less likely to report your messages as spam. If messages from your domain are frequently reported as spam, future messages from you are more likely to be marked as spam. Over time, user spam reports can lower your domain’s reputation. Check your spam rate and your domain and IP address reputation with Postmaster Tools.

To help ensure recipients are engaged:

- Make sure recipients opt in to get messages from you.

- Confirm each recipient's email address before subscribing them.

- Periodically send messages to confirm that recipients want to stay subscribed.

- Consider unsubscribing recipients who don’t open or read your messages.

Always give recipients an easy way to unsubscribe from your messages. Letting people opt out of your messages can improve open rates, click-through rates, and sending efficiency.

Important: If you send more than 5,000 message per day, your marketing and subscribed messages must support one-click unsubscribe.

To set up one-click unsubscribe for Gmail messages, include both of these headers in outgoing messages:

"POST /unsubscribe/example HTTP/1.1 Host: solarmora.com Content-Type: application/x-www-form-urlencoded Content-Length: 26 List-Unsubscribe=One-Click"

These unsubscribe options can also be used but they should not replace one-click unsubscribe:

- Let recipients review the individual mailing lists they’re subscribed to. Let them unsubscribe from lists individually, or all lists at once.

#### Message formatting requirements and guidelines

Follow these message formatting guidelines to help ensure messages are delivered as expected:

- If your messages are in HTML, format them according to HTML standards.

- Follow these message header guidelines: From: headers should include only one email address. For example: From: notifications@solarmora.com Avoid excessively large message headers. To learn more, visit Gmail message header limits.

- Format messages according to the Internet Format Standard (RFC 5322). Make sure every message includes a valid Message-ID. Make sure single-instance message headers are included only once in a message. Examples of single-instance headers include From:, To:, Subject:, and Date:.

- Message headers and message content should be accurate, and not misleading or deceptive. Email message subject, headers, display names, and other message elements should accurately represent the sender identity and message content, and shouldn’t be misleading. For example, don’t send messages with subject lines starting with Re: or Fwd: unless the messages are actual replies or forwards, and include only actual senders and recipients in From: and To: headers. Don't use emojis or other non-standard characters to imitate graphic elements in messages, with the intent to deceive or influence recipients. For example, don’t use emojis or images next to display names or brand names to imply the name has been verified in some way. Don’t use HTML and CSS to hide content in your messages. Hiding content might cause messages to be marked as spam. Web links in the message body should be visible and easy to understand. Recipients should know what to expect when they click a link. Sender information should be clear and visible.

- Format the following international domains according to Section 5.2 of Unicode Technical Standard #39. An international domain is also called an ;internationalized domain name (IDN), and is a URL that is specific to a region or country. Authenticating domain Envelope from domain Payload domain Reply-to domain Sender domain

#### Guidelines for email display names

Misuse of display names can impact email deliverability when sending to personal Gmail accounts. When you send commercial or bulk email, it’s important to follow the Email sender guidelines and to respect recipients’ inboxes. Follow the display name guidelines here to help ensure your messages are delivered as expected.

##### Display name guidelines

Sender display names should be used exclusively to identify the sender.

Display names should reflect a consistent, clear, and accurate statement of the sender's identity, name and/or organization.

Don’t include subject or message content in display names.

Display names should never be used to attempt to deceive the recipient of the email.

Avoid misleading or deceptive display names by following these guidelines:

- Identify the sender first and don’t include subject or message content in this display name. For example, don’t use display names like these: Important Update ---------- From [Company Name] TIME IS RUNNING OUT (SALE) [Product/News] Alert URGENT REQUEST Last Chance

- The display name should not include the recipient’s name and should not imply a message reply or threaded conversation. For example, don’t use display names like these: [recipient’s first name] <info@organization.com> User (2)

- The display name should clearly identify the sender and shouldn't include emojis or other non-standard characters to imitate graphic elements. For example, don’t use display names like these: LATEST UPDATE MAIL, ME [1] New Message

##### Spoofing and display names

Avoid these types of spoofing, which are deceptive display name practices:

- Using an @gmail.com domain as the display name for bulk email
