<!-- docs/marketing/campaigns/beta-reactivation/README.md -->

# Beta Reactivation Campaign

Re-engaging the 86 original beta signups (2025-07 → 2025-11): 6 targets left real work behind, 11 more made accounts, 66 never entered (3 of them behind typo'd addresses that likely never received any email). 83 sendable after hygiene. v1 drafts exist in `/admin/emails` (category `beta_reactivation`) but failed audit — rewrite in progress.

| File                                       | Purpose                                                                                                        |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| [FRAMEWORK.md](FRAMEWORK.md)               | v1 draft audit, list hygiene, segmentation (S1/S2/S3 × A/B/C), email doctrine, activation mechanics, wave plan |
| [ROSTER.md](ROSTER.md)                     | All 86 people classified, with per-person hooks (their signup words) and subject angles                        |
| [REWRITES.md](REWRITES.md)                 | Exemplar rewrites + mass-generation templates + follow-up touch sketches                                       |
| [DRAFTS_v2.md](DRAFTS_v2.md)               | The exact v2 copy for all 83 drafts, grouped by send wave — spot-review here                                   |
| `archive/v1-drafts-backup-2026-07-17.json` | Full v1 draft bodies as they were before the in-place rewrite                                                  |

**Status (2026-07-17, v2 applied):** all 83 drafts in `/admin/emails` **regenerated in place** per doctrine — v1 bodies backed up in `archive/`. Typo'd recipients corrected on the draft rows; excluded drafts (DJ, ycdemo, Zach) deleted. Decisions locked: concierge rebuild ✅, founding-beta-tester angle ✅ (no pricing promise), personal Looms ❌ (privacy — project **titles only** in copy, never contents or activity), data-respect touch dropped. **No demo references in any draft** — the demo P.S. is a follow-on task once DJ records the video (FRAMEWORK §9).

**Links:** all drafts use short links (`build-os.com/s/welcome-back`, `build-os.com/s/start`) served by the new `/s/[slug]` redirect route (registry: `apps/web/src/lib/config/short-links.ts`), which re-attaches the full UTM payload on redirect.

**Next control point:** ⚠️ **deploy the `/s` route to production first** (it's uncommitted local code — until it ships, the links in the drafts 404). Then DJ spot-reviews [DRAFTS_v2.md](DRAFTS_v2.md) and sends Wave 1 (S1 × 6) from `/admin/emails` on a Tue–Thu morning; watch replies 2–3 days before Wave 2.

**Relationship to [Retargeting](../retargeting/README.md):** same honest-founder doctrine and `/welcome-back` infrastructure; this cohort is beta-era signups specifically (mostly people with no `user_id`, who can't ride the pilot machinery). Account-holders (S1/S2, 18 people) may run through the retargeting pilot tooling; the rest go via admin composer drafts.
