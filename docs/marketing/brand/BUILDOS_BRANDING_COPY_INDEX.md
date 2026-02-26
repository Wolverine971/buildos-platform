# BuildOS Branding Copy Index

Last updated: 2026-02-26

Scope: places where BuildOS category/positioning language appears, especially around "AI-first project organization" vs "AI project collaboration."

## Status Snapshot
- `P0` live product surfaces: completed.
- `P1` copy source-of-truth and social/founder messaging: completed.
- `P2` investor/strategy docs + tone pass: completed.
- Preferred canonical title phrase: `BuildOS - AI Project Collaboration for the builders`.
- Remaining: `P3` internal AI prompt identity text.

## Completed P0: Live Product Surfaces

| Status | File | Updated Copy (excerpt) |
| --- | --- | --- |
| Completed | `apps/web/src/lib/components/SEOHead.svelte:3` | "BuildOS - AI Project Collaboration for the builders" |
| Completed | `apps/web/src/lib/components/SEOHead.svelte:12` | "BuildOS - AI Project Collaboration Platform" |
| Completed | `apps/web/src/routes/+page.svelte:170` | `twitter:image:alt` -> "BuildOS - AI Project Collaboration Platform" |
| Completed | `apps/web/src/routes/+page.svelte:183` | JSON-LD description -> "AI project collaboration platform..." |
| Completed | `apps/web/src/routes/auth/login/+page.svelte:315` | "Sign In - BuildOS \| AI Project Collaboration" |
| Completed | `apps/web/src/routes/auth/register/+page.svelte:356` | "...AI-powered project collaboration for ADHD minds..." |
| Completed | `apps/web/src/routes/pricing/+page.svelte:61` | "AI-powered project collaboration platform" |
| Completed | `apps/web/src/routes/help/+page.svelte:21` | keywords include "project collaboration guide" |

## Completed P1: Copy Source Of Truth + Social/Founder Messaging

| Status | File | Updated Copy (excerpt) |
| --- | --- | --- |
| Completed | `apps/web/docs/business/COPY_PHONEBOOK.md:131` | Footer tagline uses "AI-powered collaboration" framing |
| Completed | `apps/web/docs/business/COPY_PHONEBOOK.md:170` | JSON-LD description updated to collaboration/context language |
| Completed | `apps/web/docs/business/COPY_PHONEBOOK.md:743` | Login title updated to "AI Project Collaboration" |
| Completed | `apps/web/docs/business/COPY_PHONEBOOK.md:762` | Register meta updated to "AI-powered project collaboration" |
| Completed | `docs/marketing/social-media/FOUNDER_CONTEXT.md:99` | Founder explanation updated to "AI project collaboration tool" |
| Completed | `docs/marketing/social-media/FOUNDER_CONTEXT.md:103` | Phrase list updated to "AI project collaboration" |
| Completed | `docs/marketing/social-media/twitter-voice-buildos.md:14` | "AI project collaboration for the builders" |
| Completed | `docs/marketing/social-media/twitter-voice-quick-ref.md:14` | Building line updated to collaboration framing |
| Completed | `docs/marketing/social-media/linkedin-voice-quick-ref.md:13` | Building line updated to collaboration framing |
| Completed | `docs/marketing/social-media/twitter-context-engineering-strategy.md:256` | Bio baseline updated to collaboration + shared context |
| Completed | `docs/marketing/social-media/twitter-strategy-worksheet.md:212` | Reputation line updated to "AI-powered project collaboration" |
| Completed | `docs/marketing/social-media/LINKEDIN_FOUNDER_INTERVIEW.md:199` | Long-form founder statement updated to collaboration wording |

## Completed P2: Investor / Strategy + Tone Pass

| Status | File | Updated Copy (excerpt) |
| --- | --- | --- |
| Completed | `docs/business/strategy/ceo-training-plan.md:21` | Product line updated to "AI project collaboration tool..." |
| Completed | `docs/marketing/investors/fundraising-preparedness-checklist-part-2.md:111` | 30-second pitch updated to collaboration framing |
| Completed | `docs/marketing/investors/fundraising-preparedness-checklist-part-2.md:113` | Unfair advantage updated to "AI-native project collaboration" |
| Completed | `docs/marketing/investors/vc-firms/point-nine-capital.md:169` | "AI-powered project collaboration" |
| Completed | `docs/marketing/investors/fundraising-preparedness-checklist.md:382` | Embedded 30-second pitch block updated to collaboration framing |
| Completed | `docs/business/buildos-pitch-guide-b2b-solopreneur.md:54` | "project coordination" wording applied in ROI sections |
| Completed | `docs/business/buildos-pitch-guide-b2b-solopreneur.md:369` | "project coordination time" wording applied |
| Completed | `docs/business/buildos-pitch-guide.md:456` | Freemium line updated to "project collaboration" |
| Completed | `docs/business/war-room/war-room-original-spec.md:5` | "manual project coordination" wording applied |

## Remaining P3: Internal AI Prompting Language

| Priority | File | Current Copy (excerpt) | Suggested Direction |
| --- | --- | --- | --- |
| P3 | `apps/web/src/lib/services/agentic-chat/prompts/config/planner-prompts.ts:45` | "BuildOS is an AI-First project organization platform." | Optional: update to collaboration-centric internal identity text. |

## Useful Search Command

```bash
rg -n --no-heading -S "AI[- ]first project organization|AI first project organization|AI-powered project organization|AI-First Project Organization|BuildOS is an AI-First project organization platform|BuildOS is an AI-first project organization tool" apps/web/src apps/web/docs/business docs/marketing docs/business
```
