<!-- docs/specs/EMAIL_CAMPAIGNS_2026-10-25.md -->

# Email Campaigns (admin) — 2026-10-25

Replaces the old `/admin/emails` composer (audit: memory `project_admin_email_client_audit_2026-10-25`).
DJ picked the ambitious version: one flow from a shared template with optional per-person AI
tailoring, a review screen showing every person's version, paced waves, and results that show
sent / opened / clicked / replied / unsubscribed per person.

## Decisions (DJ, 2026-10-25)

- Footer address stays `BuildOS, PO Box 662, Glen Burnie, MD 21061-0662` (`BUILDOS_MAILING_ADDRESS`).
- Flow: template with merge fields → optional "Tailor each" (AI per person) → review every version → send in waves.
- One-click audiences: **Signed up, no project** · **Used it, went quiet** · **Beta signups, no account**. Plus add people by search or pasted addresses.
- Track replies: the server reads only sender + date (+ In-Reply-To) from the dj@build-os.com mailbox over IMAP using the existing Gmail app password. Never message bodies.

## What exists already (reuse, do not rebuild)

- `EmailService.sendEmail` (`apps/web/src/lib/services/email-service.ts`) — Gmail send, per-send
  `emails` + `email_recipients` rows, open pixel, click rewriting, postal address, unsubscribe link +
  `List-Unsubscribe` one-click headers. **Already extended (2026-10-25):** `metadata.category =
'campaign'` (or `'campaign_test'`, or `campaign_type: 'marketing'`) → `marketing` opt-out scope;
  `fromName` option; returns `trackingId`; in local dev, marketing + lifecycle email goes to the log
  sink (local dev shares the production DB — a dev run must never mail real people).
- Unsubscribe endpoint records scope `marketing` for campaign email (already done).
- Tracking: `/api/email-tracking/[tracking_id]` (open), `/click`, `/unsubscribe` write
  `email_recipients.opened_at/open_count` and `email_tracking_events` (`clicked`, `unsubscribed`).
- `email_suppressions` (+ `is_email_suppressed(email, scope)`): scopes `lifecycle | marketing |
daily_brief | all`; reasons `unsubscribe | hard_bounce | manual | complaint`.
- Cron auth: `isAuthorizedCronRequest(request, [env.CRON_SECRET, PRIVATE_CRON_SECRET])` (see
  `routes/api/cron/welcome-sequence/+server.ts`). Live cron config is **`apps/web/vercel.json`**.
- Vercel default `maxDuration: 10` (svelte.config.js). Long routes set `export const config = { maxDuration: 60 }`.
- LLM: `SmartLLMService` (`$lib/services/smart-llm-service`) `getJSONResponse({ systemPrompt,
userPrompt, userId, profile: 'balanced', operationType, ... })`.

## Data model (migration `20261025200000_add_email_campaigns.sql`, APPLIED to prod)

- `email_campaigns` — name, status (`draft|sending|paused|completed|canceled`), subject_template,
  body_template (editor HTML with `{{merge}}` fields), from_name (default `DJ`), audience (jsonb
  `CampaignAudience`), tailoring_instructions, wave_size (1–200, default 20),
  wave_interval_minutes (1–10080, default 60), starts_at, queued_at, completed_at, canceled_at,
  source (`admin` | `import:…`), metadata, created_by.
- `email_campaign_recipients` — one row per person per campaign (unique `(campaign_id, email)`,
  email lowercased): name, first_name, user_id (cascade), beta_signup_id, segment, context
  (`RecipientContext`), subject_override, body_override, override_source
  (`tailored|edited|imported`), tailor_status (`none|done|failed`), tailored_at, tailor_error,
  included, status (`draft|queued|sending|sent|skipped|failed|canceled`), skip_reason,
  scheduled_for, lease_expires_at, attempt_count, email_id (→ the `emails` row EmailService wrote),
  tracking_id, message_id, sent_at, replied_at, reply_checked_at, bounced_at, error_message,
  source_email_id (imported draft).
- `claim_email_campaign_sends(p_limit, p_lease_seconds)` — service role only; moves due, included,
  queued rows of `sending` campaigns to `sending` with a lease (SKIP LOCKED).
- `get_email_campaign_engagement(p_campaign_ids uuid[])` — per sent recipient: opened_at,
  open_count, first_clicked_at, click_count, unsubscribed_at.
- `email_attachments.email_id` is now nullable (shared images).
- RLS: admins (`is_admin(auth.uid())`) for both tables; the cron uses the admin client.
- Types: hand-added to `packages/shared-types/src/database.types.ts` (CLI typegen needs a token not on this machine).

## Shared modules (written, use them)

- `apps/web/src/lib/email-campaigns/types.ts` — all DTOs (`CampaignRow`, `CampaignSummary`,
  `CampaignDetail`, `CampaignRecipientView`, `CampaignCounts`, `AudienceExclusion`, `SegmentCount`,
  `PersonSearchResult`, `RecipientContext`, `CampaignAudience`, constants).
- `apps/web/src/lib/email-campaigns/render.ts` — `renderCampaignEmail(campaign, recipient)` →
  `{ subject, bodyHtml, text, usesOverride }`; `renderCampaignEmailDocument(rendered, {
unsubscribeUrl })` (plain template — no banner — plus footer); `MERGE_FIELDS`,
  `renderMergeFields`, `findUnknownMergeFields`, `htmlToPlainText`, `extractLinks`,
  `firstNameFrom`, `formatSignupMonth`. Browser-safe.

## Server (apps/web/src/lib/server/email-campaigns/)

- `audience.ts` — Resolve segments → people with `RecipientContext`; search people; dedupe; exclusions. **no_project**: `users` not admin, `deletion_status is null`, with zero `onto_projects` (`kind = 'project'`, `deleted_at is null`) whose `created_by` is one of their `onto_actors` (`onto_actors.user_id = users.id`). **went_quiet**: same users with ≥1 such project and `last_visit` null or older than `WENT_QUIET_DAYS`. **beta_no_account**: `beta_signups` with `signup_status <> 'rejected'` whose lowercased email has no `users` row. Exclusions: any `email_suppressions` row except scope `daily_brief` with reason `unsubscribe` (→ `unsubscribed`; reason hard_bounce/complaint → `bounced`), `users.is_admin` (→ `admin`), `deletion_status` set (→ `deleting_account`), invalid address, `audience.removed_emails` (→ `removed`). Segment priority on duplicates: manual > went_quiet > no_project > beta_no_account. Context: signed_up_at (earliest of account/beta form), signup_month, last_visit_at, project_count, last_project (most recently updated project **title only**), beta answers (why_interested, biggest_challenge, productivity_tools, job_title, company_name), onboarding_intent. Batch queries — no per-person round trips.
- `campaigns.ts` — CRUD + `syncRecipients(campaignId)` (draft/paused only): rebuild from audience, keep existing rows (and their overrides/included flags) for people still present, insert new, delete rows no longer in the audience that were never sent. `getCampaignDetail` (recipients + engagement RPC + `last_contacted_at` from other campaigns' sent rows + counts + exclusions). `listCampaigns` (summaries with counts in one or two queries). `queueCampaign` (validate: subject/body present for every included person after render, no unknown merge fields, ≥1 included; assign `scheduled_for = start + floor(i / wave_size) * wave_interval`; included → `queued`, excluded → stay `draft`; campaign → `sending`, `queued_at`, `starts_at`). `pause` (campaign → paused), `resume` (re-space remaining queued from now with the same wave plan; → sending), `cancel` (queued → canceled; campaign → canceled), `retryRecipient` (failed → queued now; campaign back to sending if completed). `updateRecipient` (subject/body override → `override_source='edited'`; `reset` clears overrides; `included`). Only drafts can be deleted. `createFollowUp(campaignId)` → new draft campaign whose audience.people = sent recipients with no reply, no unsubscribe, not bounced.
- `sender.ts` — `processDueCampaignSends({ supabase, now, budgetMs, perRunLimit, dailyCap })`: 1) mark `sending` rows with expired leases `failed` with `error_message` "Interrupted mid-send — it may have gone out. Check Sent mail before retrying." (never auto-resend). 2) limit = min(perRunLimit, dailyCap − campaign sends in the last 24 h). 3) claim via RPC. 4) for each claimed row, until budget: re-check suppression (skip → `skipped` + skip_reason), render with `renderCampaignEmail` + wrap with `renderCampaignEmailDocument` (no unsubscribe arg — EmailService adds the real one), call `EmailService.sendEmail({ to, subject, body: text, html, from: 'dj', fromName: campaign.from_name, userId: user_id, createdBy: campaign.created_by, trackingEnabled: true, metadata: { category: 'campaign', campaign_type: 'marketing', campaign_id, campaign_recipient_id, campaign_name, segment, tracking_id } })`, pre-generating `tracking_id` with `randomUUID()`. Success → `sent`, sent_at, email_id, tracking_id, message_id, lease null. Failure → `failed` + error. 5) release unprocessed claimed rows back to `queued` when the budget runs out. 6) campaigns with nothing queued/sending → `completed`. Default `perRunLimit` 20, `budgetMs` 40000, `dailyCap` env `PRIVATE_CAMPAIGN_DAILY_CAP` or 400.
- `tailor.ts` — `tailorRecipients({ campaign, recipients, instructions, adminUserId })`: per person (concurrency 2) call `getJSONResponse` → `{ subject, body_html }`. System prompt = BuildOS founder voice (relief, not AI; plain, short, lowercase-natural subjects allowed; sign "DJ"; never invent facts; use only the facts given; never mention how we know personal data beyond "you told me when you signed up"; project titles only; keep every link from the template exactly; HTML `<p>`/`<a>`/`<br>`/`<ul><li>` only; no merge-field braces in output). User prompt = template subject + body, DJ's instructions, this person's facts (from context + first_name + segment). Validator on the structured output: non-empty subject (≤ 120 chars) and body; every link in the template appears in the body (`extractLinks`); no `{{`. Pass → `subject_override`, `body_override`, `override_source='tailored'`, `tailor_status='done'`, tailored_at. Fail → `tailor_status='failed'`, `tailor_error` (overrides untouched). `operationType: 'email_campaign_tailor'` (check `llm-operation-type-fitness` test for registration).
- `replies.ts` — `checkCampaignReplies({ supabase, now, maxAddresses })` over IMAP (`imapflow`, `imap.gmail.com:993`, user `dj@build-os.com`, pass `PRIVATE_DJ_GMAIL_APP_PASSWORD`), mailbox `[Gmail]/All Mail` read-only. Candidates: `status='sent' and replied_at is null and sent_at > now − 45 days`, oldest `reply_checked_at` first, up to `maxAddresses` (default 60) distinct emails. Per address: `search({ from: email, since: earliest sent_at for that address })`, fetch **envelope only**; a message dated after that recipient's `sent_at` → `replied_at`. Bounces: one `search({ from: 'mailer-daemon', since })`, envelope `inReplyTo` matching a recipient `message_id` → `bounced_at` + `upsert_email_suppression(scope 'all', reason 'hard_bounce', source 'provider_webhook')`. Update `reply_checked_at` for every checked row. Pure matching helpers exported for tests. Missing password → no-op with a reason.
- `campaigns.test.ts` … — Vitest with mocked Supabase: audience exclusion/dedupe/priority, queue scheduling math, sync keeps overrides, sender (success/failure/suppressed/budget release/lease expiry/daily cap/completion), tailor validator, reply matching.

## API (apps/web/src/routes/api/admin/email-campaigns/) — every route: `safeGetSession`, `user.is_admin` else `ApiResponse.forbidden`; zod `.strict()` bodies via `parseJsonRequest`; JSON via `ApiResponse`

| Method + path                              | Body / query                                                                                                                                                                                                                     | Returns (`data`)                                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `GET /`                                    | —                                                                                                                                                                                                                                | `{ campaigns: CampaignSummary[] }`                              |
| `POST /`                                   | `{ name? }`                                                                                                                                                                                                                      | `{ campaign: CampaignRow }` (201)                               |
| `GET /segments`                            | —                                                                                                                                                                                                                                | `{ segments: SegmentCount[] }`                                  |
| `GET /people?search=`                      | search ≥ 2 chars                                                                                                                                                                                                                 | `{ people: PersonSearchResult[] }` (≤ 20, users + beta signups) |
| `GET /[id]`                                | —                                                                                                                                                                                                                                | `CampaignDetail`                                                |
| `PATCH /[id]`                              | any of `name, subject_template, body_template, from_name, tailoring_instructions, wave_size, wave_interval_minutes, starts_at` (draft/paused only)                                                                               | `{ campaign: CampaignRow }`                                     |
| `DELETE /[id]`                             | draft only                                                                                                                                                                                                                       | `{ deleted: true }`                                             |
| `PUT /[id]/audience`                       | `{ audience: CampaignAudience }` (draft/paused)                                                                                                                                                                                  | `CampaignDetail` (after sync)                                   |
| `PATCH /[id]/recipients/[rid]`             | `{ subject_override?, body_override?, included?, reset? }`                                                                                                                                                                       | `{ recipient: CampaignRecipientView }`                          |
| `POST /[id]/recipients/[rid]/retry`        | —                                                                                                                                                                                                                                | `{ recipient: CampaignRecipientView }`                          |
| `POST /[id]/tailor`                        | `{ recipient_ids: string[] (1..TAILOR_BATCH_SIZE), instructions? }` — `maxDuration: 60`                                                                                                                                          | `{ recipients: CampaignRecipientView[] }`                       |
| `POST /[id]/test`                          | `{ recipient_id?, to? }` → renders that person's version (or the template with the admin's name), subject prefixed `[Test] `, sends via EmailService with `metadata.category='campaign_test'` to `to` or the admin's own address | `{ sent_to: string }`                                           |
| `POST /[id]/queue`                         | `{ starts_at?: string \| null, wave_size, wave_interval_minutes }`                                                                                                                                                               | `CampaignDetail`                                                |
| `POST /[id]/pause` · `/resume` · `/cancel` | —                                                                                                                                                                                                                                | `CampaignDetail`                                                |
| `POST /[id]/follow-up`                     | —                                                                                                                                                                                                                                | `{ campaign: CampaignRow }`                                     |

Validation errors use `ApiResponse.badRequest(message)` with a human sentence the UI can show as-is.

## Crons (add to `apps/web/vercel.json` and root `vercel.json`)

- `GET /api/cron/email-campaigns` — `* * * * *`, `maxDuration: 60`, runs `processDueCampaignSends`; logs to `cron_logs` like welcome-sequence.
- `GET /api/cron/email-campaign-replies` — `*/10 * * * *`, `maxDuration: 60`, runs `checkCampaignReplies`.

## UI (apps/web/src/routes/admin/emails/ + apps/web/src/lib/components/email-campaigns/)

Follow `apps/web/AGENTS.md` and the Inkprint design system (`apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`): tokens, light/dark, Lucide via the central export, existing `Button`/`TextInput`/`Select`/`FormField`/`ConfirmationModal`/`Modal` components, Svelte 5 runes. Phone width must work (16px gutters, no horizontal scroll). Vision: calm, one page per campaign, no wizard that hides steps.

- `/admin/emails` → **Campaigns** list (default) with a "Sent log" tab (the old list, read-only, automatic emails hidden behind a "Show automatic emails" toggle: categories `daily_brief`, `welcome_sequence`, `notification`, `campaign`, `campaign_test`, plus drafts with `template_data.imported_to_campaign_id`). Rows: name, status pill (Draft / Scheduled for … / Sending · 12 of 83 / Paused / Done / Canceled), people count, sent · opened · clicked · replied numbers, updated. "New campaign" button → POST then go to the campaign page.
- `/admin/emails/campaigns/[id]` → one page, sections with a sticky step rail on desktop:
    1. **Audience** — three segment cards with live counts (toggle), "Add people" search + "Paste addresses" box, summary line "83 people · 4 left out (2 unsubscribed, 1 admin, 1 duplicate)" with an expandable left-out list. Removing a person adds them to `removed_emails`.
    2. **Write** — From name, subject, TipTap body (reuse the old composer's editor setup), merge-field chips that insert `{{first_name}}` etc., image button (fixed upload: public URL). Unknown merge fields shown as a warning. Autosave (debounced PATCH, "Saved" indicator); every action that sends flushes the pending save first.
    3. **Tailor (optional)** — instructions box + "Tailor each person" (shows count and that it uses AI), progress bar driven by client-side chunks of `TAILOR_BATCH_SIZE`, per-person failures listed with retry. Never auto-run.
    4. **Review** — every person: name/email, segment chip, subject, first line, badges (tailored / edited / emailed N days ago / tailor failed), include toggle. Click → side drawer with the full rendered email (iframe `srcdoc` of `renderCampaignEmailDocument(..., { unsubscribeUrl: '#unsubscribe-preview' })`), edit subject/body for just this person, "Reset to template", "Send me a test of this one".
    5. **Send** — start now / pick a time, wave size, minutes between waves, computed plan ("83 emails in 5 waves, last wave Tue 2:00 PM"), confirm modal ("Queue 83 emails?"). After queueing the section becomes Results.
    6. **Results** (status ≠ draft) — counters (sent, opened, clicked, replied, unsubscribed, failed, skipped, waiting) and per-person table with status + timestamps; Pause / Resume / Cancel; Retry on failed rows; "Follow up with N who didn't reply" (POST follow-up → new draft). Poll `GET /[id]` every 15 s while sending.
- `AdminShell.svelte` nav: "Email Drafts / Compose, review & send" → "Email / Campaigns & sent log".
- `/admin/beta` embeds `EmailManager` — point it at the Sent log component (or a link to `/admin/emails`).

## Retire

- `lib/components/email/EmailComposer.svelte`, `RecipientSelector.svelte`, `EmailManager.svelte` (→ replaced by the Sent log), `request-lifecycle.test.ts` (rewrite for the new list if worth it).
- API: `api/admin/emails/[id]/send`, `api/admin/emails/recipients`, POST in `api/admin/emails/+server.ts`, PATCH in `api/admin/emails/[id]/+server.ts`. Keep GET list/detail, DELETE (drafts), `send` (admin users page one-to-one), `generate`, `history`, `attachments` (fix: `email_id` optional, return public URL, no signed URLs; never attach storage paths to SMTP).

## Import of the 83 July drafts (`apps/web/scripts/import-beta-reactivation-campaign.mjs`)

Dry run by default, `--apply` writes. Creates draft campaign "Beta reactivation · July drafts" (source `import:beta-reactivation-2026-07`), one recipient per `emails` row with `category = 'beta_reactivation' and status = 'draft'`: subject/body override from the draft, `override_source = 'imported'`, segment `imported`, beta_signup_id/user_id resolved by email, context from the beta form. Stale copy fix: "last July" → "in <Month YYYY>" from that person's `beta_signups.created_at` (and "a year ago" → "over a year ago"). Marks each source draft `template_data.imported_to_campaign_id`. Idempotent (skips if the campaign already exists). Prints a per-person diff summary.

## Validation

Free only: vitest on new test files, `svelte-check` once at the end (through test-gate), browser check on local dev (`:5174`) without sending — local dev uses the production DB, so never queue or test-send to real people from local dev. Tailoring calls a paid model: do not run it without DJ's OK.

## Review fixes (2026-10-25, after an adversarial review)

- Off-site links: the click endpoint only followed same-origin links, so every external link (and `mailto:`) in any tracked email went to the homepage. Links are now signed at send time (`$lib/server/email-link-signing.ts`, HMAC of tracking id + URL, key `PRIVATE_EMAIL_LINK_SECRET` or derived from the service key) and the click endpoint follows a signed off-site link; `mailto:`/`tel:` links are no longer rewritten. Old emails keep the old behavior.
- Mailto unsubscribes (`List-Unsubscribe: <mailto:…?subject=unsubscribe>`) are read by the reply checker: a message with exactly that subject writes a `marketing` suppression and an `unsubscribed` event instead of counting as a reply. Auto-replies (Auto-Submitted / X-Autoreply / Precedence headers) are ignored; a reply naming another of our emails by In-Reply-To is credited to that email. IMAP client has an error listener and closes on setup failure.
- Queue is compare-and-set (draft → paused claim, guarded per-wave updates, rollback on failure, then sending), so a double click or second tab gets a 409 and a sent row is never re-queued. The UI also sets its busy flags before awaiting the save (queue + tailor).
- Resume keeps a still-future scheduled time instead of sending immediately.
- The sender claims one row at a time (a hung Gmail connection leaves at most one row "interrupted"), Gmail transports time out in 10–20 s, and people who requested account deletion after queueing are skipped. Completion checks each running campaign separately (no 1000-row cap).
- The email cron refuses to run in local dev unless `PRIVATE_ALLOW_DEV_CAMPAIGN_SENDS=true` (dev logs instead of sending, which would mark real people "sent"); test sends in dev say they were only logged.
- From header uses an address object so a display name with a comma can't break sends.

Unverified until the first real sends: that Gmail failure notices carry In-Reply-To (bounce matching depends on it) and that ~20 SMTP logins in a minute stay under Gmail's login throttling (waves default to 20 per hour).
