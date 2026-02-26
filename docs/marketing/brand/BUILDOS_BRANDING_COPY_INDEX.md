# BuildOS Branding Copy Index

Last updated: 2026-02-26

Scope: places where BuildOS category/positioning language appears, especially around "AI-first project organization" vs "AI project collaboration."

## Status Snapshot
- `P0` live product surfaces: completed.
- `P1` copy source-of-truth and social/founder messaging: completed.
- Preferred canonical title phrase: `BuildOS - AI Project Collaboration for the builders`.
- Remaining: `P2` investor/strategy docs and `P3` internal AI prompt identity text.

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

## Remaining P2: Investor / Strategy Docs

| Priority | File | Current Copy (excerpt) | Suggested Direction |
| --- | --- | --- | --- |
| P2 | `docs/business/strategy/ceo-training-plan.md:21` | Product line says "AI-first project organization tool" | Update strategy narrative. |
| P2 | `docs/marketing/investors/fundraising-preparedness-checklist-part-2.md:111` | 30-second pitch uses old category wording | Update fundraising one-liner. |
| P2 | `docs/marketing/investors/vc-firms/point-nine-capital.md:169` | "AI-powered project organization" | Update external positioning notes. |
| P2 | `docs/business/buildos-pitch-guide.md:62` | Already says "context infrastructure for human-AI collaboration" | Keep as aligned reference language. |

## Remaining P3: Internal AI Prompting Language

| Priority | File | Current Copy (excerpt) | Suggested Direction |
| --- | --- | --- | --- |
| P3 | `apps/web/src/lib/services/agentic-chat/prompts/config/planner-prompts.ts:45` | "BuildOS is an AI-First project organization platform." | Optional: update to collaboration-centric internal identity text. |

## Useful Search Command

```bash
rg -n --no-heading -S "AI[- ]first project organization|AI first project organization|AI-powered project organization|AI-First Project Organization|BuildOS is an AI-First project organization platform|BuildOS is an AI-first project organization tool" apps/web/src apps/web/docs/business docs/marketing docs/business
```
