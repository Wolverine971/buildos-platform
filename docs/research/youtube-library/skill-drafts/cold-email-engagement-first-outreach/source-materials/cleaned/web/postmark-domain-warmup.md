---
doc_type: cleaned-source-card
skill: cold-email-engagement-first-outreach
source_kind: web
slug: 'Postmark Domain Warmup'
title: 'How to warm up email/domain for sending email'
source_url: 'https://postmarkapp.com/guides/domain-warmup'
source_label: 'Postmark domain warmup'
status: 'acquired'
cleaned_path: 'docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/cleaned/web/postmark-domain-warmup.md'
raw_artifact_removed: 'web/postmark-domain-warmup.html'
created: 2026-05-15
visibility: internal
publish: false
path: docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/cleaned/web/postmark-domain-warmup.md
---

# How to warm up email/domain for sending email

Source URL: <https://postmarkapp.com/guides/domain-warmup>

Source type: WEB cleaned source card.

Raw artifact policy: raw HTML snapshot replaced by this cleaned Markdown note.

## Use In Cold Email Architecture

Warmup and ramping considerations.

## Source Notes

- Acquisition status: acquired.
- Source label: Postmark domain warmup.
- Source description: Domain reputation is your most valuable asset in email deliverability. By starting off right, you can quickly grow a reputation that will help safeguard your deliverability wherever you go.

## Cleaned Extract

Perhaps you’ve started a new business, you’re going through a branding shift, or maybe you’re just adding a new stream of services or trying to separate existing ones. It’s important to update your domain to reflect those changes, but don’t forget that domain changes easily influence email. The wrong move could send your messages straight to the spam folder.

It takes time and a little finesse for a domain’s roots to take hold, but this “warmup” process is a unique opportunity to help your brand’s deliverability thrive.

### What is domain warming?

Domain warming (also known as "email warm up") is the process of sending email from a new domain (or an existing domain that hasn't been used to send email) to help it establish a good domain reputation.

The warmup process usually takes a few weeks, during which the sender slowly and steadily increases the volume of emails they send every day.

### How to warm up a domain or subdomain

The first step is examining who you’re sending to and how much. That means knowing how much you’re sending to Gmail recipients, Yahoo, AOL, Microsoft domains, and so on at any given time—the more segmented by receiver your list is, the better.

Next, start your volume to each of these receivers very low, usually around 100-500 messages to each the first couple of days. In the beginning, you can generally try doubling your volume each day.

Once that volume becomes more substantial, however, grow your audience by only 20-50% each day to accommodate for any sudden issues with complaints or bounces.

Keep in mind that each of these receivers has a different threshold for how much mail they’ll accept from a new domain, and that threshold is dependent on a lot of variables.No single warmup schedule works for everyone, but most can expect their domain to have an established reputation and dependable full-volume deliverability in 3-6 weeks.

💛 Pro tip #1: never increase your volume until you’ve looked at your messages’ performance by receiver. If engagement and bounce rates seem normal, you’re likely safe to increase the next day’s volume. If you’re seeing some behavior that suggests deliverability is suffering, however, decrease your volume by 25-30% until metrics begin to normalize.

💛 Pro tip #2: If you’re able to target the most engaged recipients first, you’ll be establishing a good reputation faster and the entire warmup process will go much smoother.

### Domains that affect deliverability

So let’s talk about which domains email receivers care about. You may notice even though the examples below are pulled from a single Postmark notification, there are actually four different domains being used. The more reputations at play, the more variables introduced into your deliverability.

#### 1. DKIM signing domain

This is the domain that holds your public DKIM key, used to decrypt the DKIM signature and authenticate your message. It’s best to sign your messages with your own domain, giving you the opportunity to build your domain’s reputation faster.

#### 2. Return-Path domain

This is the domain that bounce responses are sent to, but it’s also used by receivers for SPF authentication. Again to build your reputation faster, it's recommend that you have a custom Return-Path that matches your domain.

#### 3. From/reply address

This is the “friendly” address we see directly in our inboxes, which often matches the domain used in the reply-to address. It should clearly identify your brand to recipients, so be sure to encourage them to add it to their contact list for improved deliverability. It's also recommended that you add a DMARC policy to this domain, which in combination with custom DKIM and Return-Path, helps protect your domain’s hard-built reputation.

#### 4. URL content

These are the links in the content of your message itself, including any third party link-tracking, short URLs, and file hosting. In general, we see URLs negatively affect delivery only when they’re observed to have some deceptive or malicious purpose. It pays to be mindful which third-parties are linked in your content.

### Working with subdomains

A little-known fact is that subdomains develop their own reputations too. Think of them as branches of a tree. Sure, the primary organizational domain controls their ultimate fate, but they each develop separately with varying strength. Subdomains are the best way to keep your branding consistent while protecting the deliverability of your various mail streams.

For example, if you send transactional content and promotional content, be sure to associate each with a unique subdomain using custom DKIM and Return-Path. Now it’s much less likely the wrong bulk send can affect deliverability for those most important alerts that keep your app functional.

As with any reputation, it isn’t created out of thin air. A new subdomain still needs to be warmed up with receivers, slowly increasing the number of messages sent.

Domain reputation is your most valuable asset in email deliverability. IPs change and templates are redesigned, but the domain has a growing history which more than ever determines your fate in the inbox. By starting off right, you can quickly build a reputation that will help safeguard your deliverability wherever you go.

### Day-by-Day Breakdown of the Domain Warm-Up Process

The following is a practical 30-day schedule for warming up your domain. Remember that this is a general guideline and should be adjusted based on your specific performance metrics at each stage.

#### Week 1: Establishing Your Foundation

- Send 50-100 emails to each major email provider (Gmail, Yahoo, Outlook, etc.)

- Target only your most engaged recipients who have previously opened and clicked

- Monitor open rates, click rates, and bounce rates closely

- Keep content simple and valuable with clear call-to-actions

- If metrics are healthy (open rates >20%, bounce rates <2%), double your volume to 200 emails per provider

- Introduce slight variations in email templates while maintaining consistent branding

- Check spam placement tools to verify inbox delivery

- Increase to 400 emails per provider if previous metrics remain strong

- Establish consistent sending patterns (time of day, frequency)

- Review all bounce notifications and remove invalid addresses immediately

#### Week 2: Controlled Growth

- Increase to 600-800 emails per provider

- Introduce more varied content types while maintaining engagement

- Check reputation monitoring tools for any early warning signs

- If metrics remain healthy, increase to 1,000-1,500 emails per provider

- Aim for a 30-50% daily volume increase rather than doubling

- Monitor spam complaint rates - they should remain below 0.1%

#### Week 3: Scaling Up

- Increase to 2,000-3,000 emails per provider

- If any deliverability issues appear, reduce volume by 25-30% until metrics stabilize

- Continue expanding your audience segment to include slightly less recent engagement

- Implement a consistent schedule that matches your long-term sending plans

- Scale to 4,000-5,000 emails per provider if previous days show consistent inbox placement

- Add more diverse content types that still provide value to recipients

- Review DMARC reports to ensure proper authentication is working

#### Week 4: Reaching Full Volume

- Increase to 7,500-10,000 emails per provider

- If your planned volume is higher, continue increasing by only 20-30% daily

- Begin incorporating your regular email marketing mix (promotional, informational, etc.)

- Continue monitoring deliverability metrics before each increase

- Scale to your full intended sending volume

- Implement your complete email marketing strategy

- Maintain consistent sending patterns

- Continue regular monitoring of all deliverability metrics

Post Warm-Up (Day 31+)

- Your domain should now have established a solid reputation

- Maintain consistent sending volumes and patterns

- Continue monitoring deliverability metrics weekly

- Implement a regular list hygiene process to maintain your reputation

Remember: Different email providers have different thresholds. If you notice poor performance with a specific provider, reduce volume to that provider while continuing to scale with others.

### Troubleshooting Tips for Common Warm-Up Issues

#### High Bounce Rates (>3%)

- Sudden increase in hard bounces

- Consistent soft bounces to specific domains

- Immediately reduce sending volume by 40-50% to affected providers

- Clean your list to remove all invalid addresses

- Verify that your authentication records (SPF, DKIM, DMARC) are properly configured

- If using shared IP pools, contact your ESP about potential reputation issues

#### Low Open Rates (<10%)

- Sudden drop in previously healthy open rates

- Check spam placement tools to see if you're landing in spam folders

- Improve subject lines to be more relevant and engaging

- Experiment with sending times to find optimal engagement windows

- Consider a different from address if your current one may have spam associations

- Review your content for spam trigger words and high image-to-text ratios

#### Spam Complaints (>0.1%)

- Feedback loops reporting spam complaints

- Declining deliverability to specific providers

- Immediately identify which segments are generating complaints

- Temporarily pause sending to those segments

#### Throttling or Deferrals

- Messages being accepted but delayed

- Temporary failures with retry messages from receiving servers

- Slow down your sending rate (emails per hour)

- Spread your sends across more hours of the day

- Reduce daily volume by 20-30% until deferrals decrease

- Segment your sends into smaller batches with pauses between

- Ensure your ESP is using proper retry logic for temporary failures

#### Blocklist Issues

- Sudden delivery problems across multiple providers

- Explicit bounce messages mentioning blocklists

- Check major blocklists (Spamhaus, Barracuda, etc.) for your domain and IPs

- Immediately stop sending if you're listed on a major blocklist

- Follow the specific delisting procedures for each blocklist

- Identify and resolve the root cause (compromised accounts, poor list hygiene)

- Once delisted, restart your warm-up process at a significantly reduced volume

#### Authentication Failures

- Authentication-related bounce messages

- Poor deliverability despite good content and list quality

- Verify all DNS records are properly configured (SPF, DKIM, DMARC)

- Check that your ESP is correctly signing messages

- Ensure your custom return-path domain is properly set up

- Test your authentication with tools like dmarcian or mail-tester

- Consider implementing BIMI for additional authentication signals

Remember that warm-up is not just about volume but about building a positive reputation. It's better to take an extra week or two than to rush the process and damage your long-term deliverability.

### Email Warm Up FAQ

#### What is an email warm up?

Email warm up is the process of gradually increasing your email sending volume to establish a positive sender reputation with ISPs.

#### How do you warm up your new email?

To warm up a new email:

- Start with low volumes (5-10 emails/day).

- Gradually increase by 10-15% daily.

- Ensure recipients engage with emails.

- Use varied content and sending patterns.
