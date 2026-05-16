---
doc_type: cleaned-source-card
skill: cold-email-engagement-first-outreach
source_kind: web
slug: 'Google Email Sender Guidelines Faq'
title: 'Email sender guidelines FAQ - Google Workspace Admin Help'
source_url: 'https://support.google.com/a/answer/14229414'
source_label: 'Google sender guidelines FAQ'
status: 'acquired; official-current'
cleaned_path: 'docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/cleaned/web/google-email-sender-guidelines-faq.md'
raw_artifact_removed: 'web/google-email-sender-guidelines-faq.html'
created: 2026-05-15
visibility: internal
publish: false
path: docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/cleaned/web/google-email-sender-guidelines-faq.md
---

# Email sender guidelines FAQ - Google Workspace Admin Help

Source URL: <https://support.google.com/a/answer/14229414>

Source type: WEB cleaned source card.

Raw artifact policy: raw HTML snapshot replaced by this cleaned Markdown note.

## Use In Cold Email Architecture

Clarifications for bulk sender requirements.

## Source Notes

- Acquisition status: acquired; official-current.
- Source label: Google sender guidelines FAQ.
- Source description: Important: Starting February 2024, Gmail requires the following for senders who send 5,000 or more messages a day to Gmail accounts: Authenticate outgoing email, avoid sending unwanted or unsolicit

## Cleaned Extract

## Email sender guidelines FAQ

This FAQ provides additional, detailed information to support our Email sender guidelines (previously called "Bulk sender guidelines"), which describe in detail Google's requirements for sending email to personal Gmail accounts.

We update this FAQ periodically, so check back regularly to get the latest information and requirements for bulk email senders.

Expand all | Collapse all

A bulk sender is any email sender that sends close to 5,000 messages or more to personal Gmail accounts within a 24-hour period. Messages sent from the same primary domain count toward the 5,000 limit.

Sending domains: When we calculate the 5,000-message limit, we count all messages sent from the same primary domain. For example, every day you send 2,500 messages from solarmora.com and 2,500 messages from promotions.solarmora.com to personal Gmail accounts. You’re considered a bulk sender because all 5,000 messages were sent from the same primary domain: solarmora.com. Learn about domain name basics.

Senders who meet the above criteria at least once are permanently considered bulk senders.

Bulk sender status doesn’t have an expiration date. Email senders that have been classified as bulk senders are permanently classified as such. Changes in email sending practices will not affect permanent bulk sender status once it’s assigned.

Bulk senders should use Postmaster Tools to check that their email practices are following our Email sender guidelines. To learn more, visit our Email sender requirements & Postmaster Tools FAQ.

### Google Workspace accounts

The Email sender guidelines don’t apply to messages sent to Google Workspace accounts. Sender requirements and Google enforcement apply only when sending email to personal Gmail accounts.

All senders, including Google Workspace users, must meet the requirements in our Email sender guidelines when sending messages to personal Gmail accounts. The requirements don’t apply to Google Workspace inbound and intra-domain messages.

### Sender guidelines enforcement

Enforcement for bulk senders that don’t meet our Email sender guidelines will be gradual and progressive.

Bulk senders will receive error codes on messages that don’t meet our sender guidelines. These errors help senders identify the reason for message failures and what can be done to resolve them.

Senders are encouraged to check their email compliance status using Postmaster Tools.

A new domain is defined as any domain that hasn’t sent more than 5,000 emails a day to personal Gmail accounts since January 1, 2024.

While all bulk sending domains must comply with the requirements, the enforcement progression for new domains will be on an accelerated timetable.

Gmail From: header impersonation is when a sender sends a message with a @gmail address in the From: header but the message wasn’t sent from a Gmail server. This is a common form of email abuse by spammers and is referred to as spoofing.

As described in the timeline above, bulk senders that spoof gmail.com will start getting notifications about temporary failures.

To ensure messages are delivered as expected, bulk senders should comply with our Email sender guidelines. If senders don’t meet these requirements, messages might be rejected or delivered to recipients’ spam folders.

The table below describes the current requirements:

| Sender requirement issue | Enforcement |

| From: header and authentication don't align | Temporary or Permanent Failure codes, or spam foldering |

| Messages aren't authenticated with both SPF and DKIM | Temporary or Permanent Failure codes, or spam foldering |

| Domain doesn't have valid forward and reverse DNS records | Temporary or Permanent Failure codes, or spam foldering |

| Messages aren’t sent with TLS | Temporary or Permanent Failure codes, or spam foldering |

| Messages don't follow RFC 5322 format | Temporary or Permanent Failure codes, or spam foldering |

| Spam rate is greater than 0.3% | Delivery support or mitigations unavailable |

| DMARC record is missing (Minimum policy of none, p=none) | Delivery support or mitigations unavailable |

| Marketing and promotional messages are missing one-click unsubscribe | Delivery support or mitigations unavailable |

| Unsubscribe requests aren’t honored within 48 hours | Delivery support or mitigations unavailable |

Yes, when messages are rejected, we send a rejection code and a reason for the rejection. You can also see this information in Postmaster Tools.

Temporary failure messages include error codes that indicate which sender requirement is causing the failure:

| Error code | Description |

| 4.7.23 | The sending IP address for this message doesn’t have a PTR record, or the PTR record’s forward DNS entry doesn’t match the sending IP address. To protect users from spam, your email has been temporarily rate limited. To learn more about IP address requirements for sending to Gmail, visit the IP addresses section of our sender guidelines. To learn more about Gmail requirements for bulk email senders, visit Email sender guidelines. |

| 4.7.27 | Your email has been rate limited because SPF authentication didn't pass for this message. Gmail requires all bulk email senders to authenticate their email with SPF. Authentication results: SPF with IP address: = Did not pass. To set up SPF for your sending domains, visit Set up SPF. To learn more about Gmail requirements for bulk email senders, visit Email sender guidelines. |

| 4.7.29 | Your email has been rate limited because you’re not using a TLS connection. Gmail requires all bulk email senders to use TLS/SSL for SMTP connections. To set up TLS for email, visit TLS & SSL connections. To learn more about Gmail requirements for bulk email senders, visit Email sender guidelines. |

| 4.7.30 | Your email has been rate limited because DKIM authentication didn't pass for this message. Gmail requires all email bulk senders to authenticate their email with DKIM. Authentication results: DKIM = Did not pass. To set up DKIM for your sending domains, visit Set up DKIM. To learn more about Gmail requirements for bulk email senders, visit Email sender guidelines. |

| 4.7.31 | Your email has been rate limited because the sending domain doesn’t have a DMARC record, or the DMARC record doesn’t specify a DMARC policy. Gmail requires all bulk email senders to add a DMARC record to their sending domain. See Set up DMARC. To learn more about Gmail requirements for bulk email senders, visit Email sender guidelines. |

| 4.7.32 | Your email has been rate limited because the From: header (RFC5322) in this message isn’t aligned with either the authenticated SPF or DKIM organizational domain. See DMARC alignment. To learn more about Gmail requirements for bulk email senders, visit Email sender guidelines. |

| 5.7.25 | This message was blocked because the sending IP address doesn’t have a PTR record, or the forwarding DNS entry doesn’t reference the sending IP address. Gmail requires that sending IP addresses have a PTR record. Learn more about requirements for sending IP addresses. To learn more about Gmail requirements for bulk email senders, visit Email sender guidelines. |

| 5.7.27 | This message was blocked because it didn’t pass SPF authentication. Gmail requires bulk email senders to authenticate their email with SPF. Authentication results: SPF with ip-address = did not pass To set up SPF for your sending domains, visit Set up SPF. To learn more about Gmail requirements for bulk email senders, visit Email sender guidelines. |

| 5.7.29 | This message was blocked because it wasn’t sent over a TLS connection. Gmail requires all bulk email senders to use TLS/SSL for SMTP connections. To set up TLS for email, visit TLS & SSL connections. To learn more about Gmail requirements for bulk email senders, visit Email sender guidelines. |

| 5.7.30 | This message was blocked because it didn’t pass DKIM authentication. Gmail requires bulk email senders to authenticate their email with DKIM. Authentication results: DKIM = did not pass To set up DKIM for your sending domains, visit Set up DKIM. To learn more about Gmail requirements for bulk email senders, visit Email sender guidelines. |

Spam rate is calculated daily. To help ensure messages are delivered as expected, senders should keep their spam rate below 0.1% and should prevent spam rates from ever reaching 0.3% or higher, as described in our Email sender guidelines.

To comply with the sender guidelines, keep your user-reported spam rate below 0.1% and prevent it from reaching 0.3% or higher.

The user-reported spam rate’s impact on delivery is graduated, and rates of 0.3% or higher have an even greater negative impact on email inbox delivery. Even today, user-reported spam rates greater than 0.1% have a negative impact on email inbox delivery for bulk senders.

Beginning June 2024, bulk senders with a user-reported spam rate greater than 0.3% will be ineligible for mitigation.

- Bulk senders remain ineligible for mitigation while user-reported spam rate is greater than 0.3%.

- Spam rates and other data points are calculated and updated daily in Postmaster Tools.

- Bulk senders will be eligible for mitigation when their spam rates remain below 0.3% for 7 consecutive days.

You can monitor your spam rate with Postmaster Tools.

No. One-click unsubscribe is required only for marketing and promotional messages. Transactional messages are excluded from this requirement. Some examples of transactional messages are password reset messages, reservation confirmations, and form submission confirmations.

Senders that already include an unsubscribe link in their messages have until June 1, 2024 to implement one-click unsubscribe in all commercial, promotional messages.

To protect Gmail users, unsubscribe buttons or links are displayed at the top of messages (next to the sender name) only for messages that pass Google’s automated eligibility checks. Messages must comply with sender requirements and implement correct one-click unsubscribe headers, as described in our Email sender guidelines, including increasing sending volumes gradually and monitoring recipients' spam reports. This is true even when senders add their own unsubscribe link to the message body.

The distinction between promotional and transactional messages can vary depending on industry and applicable regulations. Message recipients, not Google, determine the nature of the messages they receive. To reduce high spam rates, consider giving users an easy way to unsubscribe from marketing and promotional messages, and keep the user in mind when designing your emails.

One-click unsubscribe lets people quickly and easily opt out of your marketing or promotional messages. One-click unsubscribe also helps you maintain a low spam rate, which improves message delivery. High spam rates negatively affect message delivery for any message type that you send.

To meet RFC 8058 requirements, add List-Unsubscribe headers to all outgoing marketing and promotional messages, as described in our Email sender guidelines. If you use a third-party email provider, check to see if you have the option to add these headers to your outgoing messages.

List-Unsubscribe headers unsubscribe users directly by removing them from the mailing list. Other types of one-click unsubscribe, such as mailto and URL unsubscribe links, don’t meet our one-click unsubscribe requirement.

We don’t automatically reject messages or mark messages as spam when they don’t meet the one-click unsubscribe requirements in our Email sender guidelines.

However, unwanted messages that don’t use one-click unsubscribe are more likely to be reported as spam by recipients. An increase in messages marked as spam increases the chances that future messages from the same sender are delivered to spam.

Additionally, only bulk senders that meet all the requirements in our Email sender guidelines, including one-click unsubscribe, are eligible for mitigation.

No. One-click unsubscribe should be implemented according to RFC 8058, by adding List Unsubscribe headers to outgoing promotional messages, as described in our Email sender guidelines. Including a mailto link in the body of your messages doesn’t meet our one-click unsubscribe requirement.

No. If your messages include a one-click unsubscribe using List Unsubscribe headers, as described in our Email sender guidelines, additional unsubscribe links in the message body aren’t required to be one-click. Any additional unsubscribe links in the message body can link to a preferences web page that you specify.

To reduce spam reports, protect your sending reputation, and keep your email lists healthy, we recommend that you fulfill unsubscribe requests within 48 hours, a reasonable timeline for removing recipients from a mailing list.
