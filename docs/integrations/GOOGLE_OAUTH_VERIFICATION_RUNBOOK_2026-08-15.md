<!-- docs/integrations/GOOGLE_OAUTH_VERIFICATION_RUNBOOK_2026-08-15.md -->

# BuildOS Google OAuth Verification Runbook

Status: Branding verified and published; data-access verification not submitted

Last updated: 2026-10-04

Google Cloud project: `buildos-gmail-read`

## Current checkpoint

The live Google Console was inspected on October 4, 2026. The project is **External / In
production**, with **3 users / 100 unverified-user cap**. Its branding was verified and published
during this readiness pass; Google confirms it is being shown to users. Calendar and Gmail scopes
remain unverified. The scope justifications, Gmail feature category, and demo video were blank.

Production Settings shows two connected Calendar accounts and three Gmail accounts with reading
enabled. This confirms deployed connection surfaces, not a newly completed consent or write test.
The public homepage, Privacy Policy, Terms, and login page returned HTTP 200 without cookies. The
deployed privacy policy is version `2026-09-24` and includes optional integrations, Limited Use,
AI processing, retention, and disconnect disclosures.

Use the [October 4 submission packet](GOOGLE_OAUTH_SUBMISSION_PACKET_2026-10-04.md) for the scope
audit, remaining client cleanup, draft form answers, recording script, local configuration gaps,
and repeatable readiness command. The older Testing-mode notes in implementation documents are
historical; they do not describe this project's current publishing status.

## Objective

Verify BuildOS's production Google OAuth configuration for its optional Google Calendar and
read-only Gmail integrations. Do not submit the verification request until every item in the
pre-submission gate is complete and the requested scopes have been frozen.

## Product and consent position

- BuildOS works without connecting a Google account.
- Google Calendar and Gmail are separate, opt-in integrations. A user initiates each OAuth flow
  and approves its requested permissions.
- The current Gmail capability is read-only. It can search message metadata and retrieve message
  content needed for a user-invoked feature. It cannot send, draft, edit, delete, archive, label,
  mark messages read or unread, or download attachments.
- The Calendar integration can read selected calendars and availability. When the user enables
  synchronization or requests an action, it can also create, update, move, and delete events and
  manage supported calendar resources.
- Any future Gmail write capability requires a new product review, updated disclosures, the
  minimum additional OAuth scopes, and explicit reauthorization before release.

## Current Google configuration

### OAuth clients

1. `BuildOS Calendar Production`
    - Callback: `https://build-os.com/auth/google/calendar-callback`
    - Callback: `https://www.build-os.com/auth/google/calendar-callback`
2. `BuildOS Gmail Read Production`
    - Callback: `https://build-os.com/auth/google/gmail-read/callback`
3. `BuildOS Agentic Gate QA`
    - Callback: `http://localhost:5174/auth/google/calendar-callback`
    - Still present on October 4 despite retirement of the isolated QA workflow. Confirm consumers
      before removing it or moving development into a separate project. No client was deleted.

Google sign-in is separate: local configuration identifies project number `924402611458`, while
the integration project uses `941207291119`. Its live Console settings and production client
mapping still need confirmation. Do not substitute either integration client into Supabase Auth.

### Scopes currently shown in Google Auth Platform

- Non-sensitive: `openid`, `userinfo.email`
- Sensitive: `https://www.googleapis.com/auth/calendar`
- Restricted: `https://www.googleapis.com/auth/gmail.readonly`

Do not add Gmail scopes during this readiness pass. Before submission, perform one final Calendar
scope audit against the production API calls and either retain the full Calendar scope with an
operation-by-operation justification or replace it with the smallest granular scope set that
supports the shipped feature. Freeze the result before recording the demo.

## Completed

- [x] Production OAuth clients use HTTPS callbacks on `build-os.com`.
- [x] `build-os.com`, `/privacy`, and `/terms` are public.
- [x] `build-os.com` is listed as an authorized domain.
- [x] `djwayne35@gmail.com` has been added to the `build-os.com` Search Console property.
- [x] Privacy Policy contains Google's Limited Use statement.
- [x] Public disclosure copy has been prepared to explain that both integrations are optional and
      separately authorized.
- [x] Google Auth Platform branding has been saved with the `BuildOS` name, BuildOS logo,
      production homepage, Privacy Policy, Terms of Service, authorized domain, and monitored
      contact address.

## Pre-submission gate

### 1. Public product and legal pages

- [x] Deploy the homepage disclosure and visible links to the Privacy Policy and Terms of Service.
- [x] Deploy the expanded Google API Data section in the Privacy Policy.
- [x] Confirm all three public URLs return HTTP 200 while signed out (October 4, 2026):
    - `https://build-os.com/`
    - `https://build-os.com/privacy`
    - `https://build-os.com/terms`
- [x] Confirm the homepage describes Calendar and read-only Gmail use.

### 2. OAuth branding

The Google Auth Platform Branding page was checked and updated on 2026-10-04:

- [x] App name: `BuildOS`
- [ ] Change user support email from `djwayne35@gmail.com` to the user-confirmed
      `dj@build-os.com`. The Workspace account is signed in but has no access to this project.
      An explicit approval request is pending for the project-level `roles/oauthconfig.editor`
      grant, which includes OAuth client-secret access. No IAM grant has been made.
- [x] Replace the older dithered logo with the clean app icon:
      `apps/web/static/AppImages/android/android-launchericon-512-512.png`.
- [x] Application home page: `https://build-os.com/`
- [x] Privacy Policy: `https://build-os.com/privacy`
- [x] Terms of Service: `https://build-os.com/terms`
- [x] Authorized domain: `build-os.com`
- [x] Developer contact: `djwayne35@gmail.com`

- [x] Verify branding after checking the deployed disclosures (October 4, 2026).
- [x] Publish verified branding. Google confirms: “Your branding has been verified and is being
      shown to users.”

Branding approval does not approve Calendar or Gmail access. Complete the remaining scope, client,
video, and security-assessment work before the final data-access submission.

### 3. Data-access form

- [ ] Select `Email productivity` as the Gmail feature category.
- [ ] Enter a Calendar justification that connects every requested permission to a visible BuildOS
      feature.
- [ ] Enter a Gmail justification that emphasizes separate opt-in, read-only access, user-invoked
      retrieval, no attachment downloads, no advertising, and no generalized-model training.
- [ ] Confirm every OAuth client in this production project is represented in the demo.

Draft Gmail justification:

> BuildOS offers an optional, separately authorized read-only Gmail productivity feature. When a
> user invokes it, BuildOS searches message metadata and retrieves only the messages needed to
> provide context for that request. BuildOS cannot send, draft, edit, delete, archive, label, mark
> messages read or unread, or download attachments. Google Workspace data is not used for
> advertising, sold, or used to train or improve generalized AI/ML models. Users may disconnect the
> integration at any time.

Draft Calendar justification, subject to the final scope audit:

> BuildOS offers an optional Calendar integration that combines calendars selected by the user in
> one planning view. It lists calendars, reads events and free/busy information, and displays and
> analyzes enabled sources. When a user enables synchronization or requests an action, BuildOS can
> create, update, move, or delete events and manage BuildOS-linked calendar resources. Multiple
> Google accounts are supported, and the user controls which sources are displayed, analyzed, and
> used for writes.

### 4. Demo video

Record one unlisted YouTube video using the production product and a non-sensitive demonstration
account. Keep the browser address bar and Google consent screen visible.

Required sequence:

1. Open the public BuildOS homepage, Privacy Policy, and Terms.
2. Sign in and open the Google integration settings.
3. Start the Calendar OAuth flow; show the app identity, requested permissions, and affirmative
   consent.
4. Show connected Calendar accounts, source selection, display filters, and an event read/write
   action that explains why the scope is needed.
5. Disconnect or return to settings.
6. Start the separate Gmail OAuth flow; show the app identity, `gmail.readonly` permission, and
   affirmative consent.
7. Invoke Gmail search and retrieve a chosen demonstration message.
8. Show that the UI is read-only and that attachments are not downloaded.
9. Show the Gmail disconnect control.

Upload the video as **Unlisted**, copy the YouTube URL into the Verification Center, and keep the
original recording available in case Google asks for a revised demonstration.

### 5. Internal evidence packet

- [ ] Screenshot the final Branding, Audience, Data Access, Clients, and Verification Center pages.
- [x] Save the deployed Privacy Policy version/date: `2026-09-24`, checked October 4.
- [ ] Record the final scope list and the code paths that use each scope.
- [ ] Record the production callback URLs and verify there are no unused OAuth clients in the
      project.
- [ ] Identify the person who will respond to Google verification email within one business day.
- [ ] Prepare architecture and data-flow evidence for the restricted Gmail security assessment.

## Submission and follow-up

1. In Google Auth Platform, open **Verification Center → Prepare for verification**.
2. Review branding, authorized domains, contacts, clients, scopes, justifications, and the demo URL.
3. Submit only after the pre-submission gate is fully checked.
4. Reply promptly to requests from Google's verification team. Keep answers consistent with the
   deployed UI, Privacy Policy, and actual permissions.
5. Complete the assigned CASA security assessment for server-side use of the restricted
   `gmail.readonly` scope. Treat its evidence and annual revalidation as an ongoing operational
   requirement.

## Explicitly deferred

- Adding Gmail write scopes or shipping Gmail write features.
- Submitting the verification request before the production disclosures are deployed and the demo
  is recorded.
- Removing or changing existing OAuth scopes without the final code-to-scope audit.
- Redeploying production as part of the Cloud Console branding update.

## Official references

- [OAuth verification requirements](https://support.google.com/cloud/answer/13464321?hl=en)
- [Submitting an OAuth verification request](https://support.google.com/cloud/answer/13461325?hl=en)
- [Restricted-scope security assessment](https://support.google.com/cloud/answer/13465431?hl=en)
- [Google Workspace API User Data and Developer Policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy?hl=en)
- [Restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- [Google Calendar authorization scopes](https://developers.google.com/workspace/calendar/api/auth)
