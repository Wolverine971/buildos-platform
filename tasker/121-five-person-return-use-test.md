<!-- tasker/121-five-person-return-use-test.md -->

# 121 — Five-person return-use test

**Status:** STAGED — ready to recruit; one product prerequisite in flight  
**Priority:** P1 · **Opened:** 2026-10-10 · **Owner:** DJ runs the sessions; Claude preps, measures, and records

## Why this is next

The 2026-10-04 funnel refresh (`docs/research/activation-funnel-2026-10-04.md`) and the 2026-10-08
production read say the same thing: day one works (about half of new signups make a project
within a few minutes), and nobody comes back. Zero independent new users did anything on a later
day in all of 2026. This test is the cheapest way to watch five real people hit that wall, or not,
with a reason to return now being built ([the "every new project gets a tomorrow" brief default,
see below](#product-prerequisite)).

The protocol and recruitment message already exist in
`docs/marketing/strategy/project-workspace-rollout-2026-09-10.md` ("Five-person learning
protocol"). This tracker owns running it. Marketing stays paused ([118](118-marketing-backlog.md));
this is a product diagnostic, not a campaign.

## Readiness audit (2026-10-10)

Checked against the live site and production before staging.

| Prerequisite                                      | State                                                                                                                                                                                                                                                                 | Verdict       |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| The page the protocol shows (headline + subtitle) | Live `build-os.com` h1 reads "A project workspace you can talk to. Paste your rough notes or tell BuildOS what you're working on…" — exactly the copy the protocol assumes.                                                                                           | Ready         |
| Recruitment message                               | Written, tagline-free, in the rollout doc. Reproduced below so it can be sent from here.                                                                                                                                                                              | Ready         |
| Sign-up path for a stranger                       | Email register and Google register both land on `/today`, which routes a new account into onboarding. A brand-new Google account on the **sign-in** page is now also treated as a signup (consent, `signup` event, welcome emails) — deployed 2026-10-09 (3e71ef4ad). | Ready         |
| Welcome emails                                    | Day 0 send has always worked. Days 1/3/6/9 send since the 2026-10-04 cron fix; the first day-1+ sends were observed in production on 2026-10-08.                                                                                                                      | Ready         |
| Funnel measurement                                | PostHog ingestion verified 2026-10-08 for web, worker, and opted-in browser; chat-worker key added the same morning. `signup`, `project_created`, `brief_generated` land. Browser events only for participants who accept analytics on the privacy banner.            | Ready         |
| A reason to come back (daily brief)               | **Off by default.** Of the last 18 real signups, 2 have a brief schedule, 0 get it by email, 4 ever saw a brief. Being fixed in the build below. Run the sessions after it ships, or the test only measures the wall.                                                 | **In flight** |
| Fresh-account onboarding branches                 | Never walked live with a zero-project account ([38](38-live-verification-debt.md) §4). Do one dry run on a throwaway account before P1 so a known bug is not what the first participant hits.                                                                         | Do first      |
| Timezone                                          | 12 of 18 recent signups are stored as UTC (the browser sync only runs when chat opens). A morning brief at the wrong hour reads as noise. Part of the build below.                                                                                                    | In flight     |

## Product prerequisite

"Every new project gets a tomorrow": when someone creates their first project, schedule the daily
brief for their local morning and email it, with the existing one-click "Turn off daily briefs"
link, and sync the browser timezone on the first signed-in page load. Default-on is the
recommended version; DJ confirms the fork (default-on vs a pre-checked choice on the first-project
receipt) before it ships. The build is tracked in this file until it ships; then this section
records the commit and the first live email.

- [ ] Build shipped (commit: —)
- [ ] First real next-morning brief email observed in production (date: —)
- [ ] `docs/privacy/CLAIMS.md` updated: daily brief email is on by default after the first project, with one-click off

## Who to invite

The protocol wants independent writers/creators with one substantial current project, and not only
friends. Candidate sources already in the repo, in order of warmth:

1. **Stage 3+ writer relationships** in `docs/marketing/campaigns/creator-acquisition/02-watering-hole-map.md`
   (people who have already replied to DJ). Best fit for P1–P2.
2. **Past signups who made a project and left** (`docs/marketing/campaigns/beta-reactivation/STRATEGY-2026-09-10.md`
   cohort rules). They already understood enough to try once; P3–P4. Verify eligibility and that
   they were not recently emailed before asking.
3. **One true stranger** from a writer community DJ is already in, so at least one participant
   arrives with no goodwill. P5.

DJ picks the five. Record them by participant ID only; names stay out of the repo.

## Recruitment message (send as-is, no tagline)

> I'm testing a new way to explain BuildOS. Could I borrow 20 minutes to show you a page and watch you try it with a project you're already working on? I'm looking for the confusing parts, and there's no need to prepare anything. If it's useful, we can check back after your next work session.

## Session plan (20 minutes, screen share, DJ drives the questions)

1. Show the headline and subtitle for a few seconds, then hide them. "What does this product do?"
2. "What would you put into it first?" and "What would you expect to see afterward?"
3. "What does 'talk to' mean to you?" before showing typed chat. Note voice-only assumptions.
4. Show the creation/change walkthrough (the demo sheet in the rollout doc). "What changed in your understanding?"
5. They sign up and use one real project, unprompted where possible. Record where coaching was needed; a coached result does not count.
6. Agree a check-in 3–7 days later. Ask what they remember without showing the copy.
7. "What would you have used otherwise? What, if anything, was easier here?"

Ask permission for research notes. Permission for notes is not permission to quote.

## The one number

**Success event per participant:** they return on a later local day and change the same project
(a chat message in it, an edited task, a new document). A login alone is not success.

Read it from production, read-only, with the participant's user id (no email in the repo):

```sql
-- days on which the participant changed something, after signup day
select date(l.created_at at time zone coalesce(u.timezone, 'UTC')) as local_day, count(*) as changes
from onto_project_logs l
join users u on u.id = l.changed_by
where l.changed_by = '<participant user id>'
  and date(l.created_at at time zone coalesce(u.timezone, 'UTC'))
      > date(u.created_at at time zone coalesce(u.timezone, 'UTC'))
group by 1 order by 1;
```

Two or more of five returning unprompted means the loop is real and acquisition is the next
problem. Zero means the ongoing job is wrong, and no feature fixes that.

## Results

| Participant | Prior familiarity | Their description | Expected first result | Meaning of "talk" | Inspected saved item unaided | Returned + changed project (date) | Alternative / friction | Quote permission |
| ----------- | ----------------- | ----------------- | --------------------- | ----------------- | ---------------------------- | --------------------------------- | ---------------------- | ---------------- |
| P1          | Pending           |                   |                       |                   |                              |                                   |                        |                  |
| P2          | Pending           |                   |                       |                   |                              |                                   |                        |                  |
| P3          | Pending           |                   |                       |                   |                              |                                   |                        |                  |
| P4          | Pending           |                   |                       |                   |                              |                                   |                        |                  |
| P5          | Pending           |                   |                       |                   |                              |                                   |                        |                  |

Editing triggers from the protocol still apply: two voice-only expectations → make typed chat
explicit; two who cannot explain the saved result → move the proof up; coaching needed to create
or update → fix that product step before any acquisition; sessions complete but no reason to
return → investigate the ongoing job before selling the return benefit.

## Done when

Five sessions recorded, five check-ins done, the table filled, and the one number written here with
a dated read from production. Then move the residual (copy edits or a product fix) to its own
tracker and delete this file.
