<!-- tasker/145-people-layer-launch.md -->

# 145 — People layer launch: ship, check live, tidy up

**Status:** STAGED (DJ commits and pushes) · **Priority:** P1 · **Opened:** 2026-10-23 · **Size:** ~half a day of checks  
**Owner:** DJ ships; Claude runs the checks · **Needs from DJ:** commit + push, a second test account, his phone for the QR scan

## What shipped (staged 2026-10-23)

Handles + find + requests (web and MCP), per-person agent setting (Off/Read/Write) and the guest lane, owner-only sharing, onboarding People step + signup handle, invite link + QR + `/join`, invite and request emails, rejoin asks the owner, Share button on the project header, access-audit fixes (START HERE takeover, agent email leaks, lane archive, permission-request bypass, linked-row scoping). Spec: `docs/specs/PEOPLE_LAYER_ARCHITECTURE_2026-10-23.md`. Explainer: https://claude.ai/artifact/JEk3EN2pfLzhc52kpD2kRG

## Database (all APPLIED and recorded in production)

`20261023140000` foundation · `20261023150000` owner-only invites · `20261023180000` onboarding step · `20261023190000` invite links · `20261023200000` rejoin requests.

## Live checks (free, after deploy)

1. [ ] Two accounts: B connects an agent, finds A's @handle, asks; A approves with agents Read; B's agent reads the project and can't write.
2. [ ] A sets B to Editor + agents Write: B's agent adds a task and edits B's own task, is refused on A's task, archive, and START HERE.
3. [ ] Invite link: create, scan the QR on DJ's phone, join from a signed-out phone browser, owner notified.
4. [ ] Rejoin: remove B, B opens the link, A gets the request + email, Deny, B sees the final message.
5. [ ] Emails arrive and read right: invite, request received, approved, rejoin.
6. [ ] Fresh signup with a handle (email and Google): the onboarding People step claims it; invite from onboarding works.
7. [ ] Share button on a project page opens the Share window, owners and members.

## Decisions and tidy-up

- [ ] **The 7 editors added before 10-23 have their agents set to Write.** Review in Share → People; set to Read where unsure.
- [ ] Regenerate DB types with `SUPABASE_ACCESS_TOKEN` (they were hand-added).
- [ ] Open item: an owner who sent an @handle invite can read the invitee's email through the raw database API.
- [ ] Open item: no rate limit on find-by-handle (exact match only; low risk).
- [ ] `supabase/tests/20261023190000_project_invite_links.check.sql` still asserts the old removed/left behavior from before rejoin requests; it's correct for that migration alone. Note it if anyone rehearses the two together.

## Exit

All live checks pass and are noted here; the decisions above are made; then delete this tracker.
