<!-- docs/founder/jev-warm-door-probe-2026-09-18/prospects/SOURCING_NOTES.md -->

# Sourcing notes — veteran-owned prospect list (2026-09-18)

Companion to `vet-owned-2026-09-18.json` (50 records). Target: veteran-owned, currently operating,
recurring inbound quote/bid/booking stream, within ~35 min of Glen Burnie 21061.

## What worked

| Source                                                                                                                     | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Approx. candidates seen    | Kept                   |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | ---------------------- |
| veteranownedbusiness.com `/md/anne-arundel` (county page)                                                                  | Fetched fine. ~85 listings total; ~24 in target trades.                                                                                                                                                                                                                                                                                                                                                                                                      | AA: 85 total / 24 relevant | 16                     |
| veteranownedbusiness.com AA category pages (Commercial Contracting, Construction, Residential, Technology, Transportation) | Fetched fine but each only surfaced 1–2 profiles (the rest are subcategory counts, not listings). County page was the better index.                                                                                                                                                                                                                                                                                                                          | ~8                         | (dupes of county page) |
| veteranownedbusiness.com `/md/baltimore-city`                                                                              | Fetched fine. ~10 relevant listings.                                                                                                                                                                                                                                                                                                                                                                                                                         | ~10 relevant               | 5                      |
| veteranownedbusiness.com `/md/baltimore` (Baltimore County)                                                                | Fetched fine. Richest page: ~45 relevant listings across trades + IT.                                                                                                                                                                                                                                                                                                                                                                                        | ~45 relevant               | 9                      |
| veteranownedbusiness.com `/md/howard`                                                                                      | Fetched fine. ~20 relevant (heavy on IT/cyber + a few trades).                                                                                                                                                                                                                                                                                                                                                                                               | ~20 relevant               | 8                      |
| veteranownedbusiness.com individual `/business/{id}/` profiles                                                             | Worked for ~8 fetches, then the site started returning **HTTP 403 with `Retry-After: ~3500s`** (rate limit). Fell back to search-engine snippets of the same profile pages, which carry owner name + branch text.                                                                                                                                                                                                                                            | —                          | —                      |
| veteranownedbusinessdirectory.org `/md/anne-arundel`                                                                       | Fetched fine; appears to be a mirror of veteranownedbusiness.com with the same ~85 AA listings and city sub-pages. Used as the second source URL for one record.                                                                                                                                                                                                                                                                                             | 85                         | —                      |
| Company websites (About pages)                                                                                             | Best evidence. ~35 fetched successfully; 403s on paintcorps.com, alascioconstruction.com, sandowconstruction.com/about-us; TLS cert errors on fiberplusinc.com and veteran-dci.com; DNS failure on capitolcabinetry.net; two pages (iwsbaltimore.com) returned truncated bodies. For those, the quote is taken from the search-engine snippet of the same URL and flagged in `notes`.                                                                        | —                          | —                      |
| Google-style searches ("veteran-owned" + trade + town)                                                                     | Productive for: Warrior Plumbing, Chesco, Certified Roofing, Kanga Roof, Fuqua's, Call the Sarge, Freedom Fence, Easy Movers, Severn Excavation, Brothers Flooring, PAINT CORPS, Preferred Cleaning, Valor Home, Joint Forces Roofing, Innovative Electric's about page. Unproductive for: garage doors, tree service, pest control, restoration, asphalt/sealcoating, event venues, and most "electrician + town" queries (results were non-veteran firms). | ~15 new                    | 15                     |
| Procore SDVOSB network (`network.procore.com/us/md/baltimore/sdvosb`)                                                      | Fetched fine after following a 308 redirect. 53 SDVOSBs within 25 mi of Baltimore, but most are multi-state estimating consultancies or out-of-state firms with "Maryland" as a service area. Yielded Joint Forces Roofing (Annapolis). Page 2 not fetched.                                                                                                                                                                                                  | 40 shown                   | 1                      |
| Indeed (`site:indeed.com` + company)                                                                                       | Useful for larger firms: Dvorak (6 openings incl. Electrical Estimator + PM), FiberPlus (Project Estimator, Sales Engineer), Brothers Flooring (Flooring Operations Manager), Allen & Son, LRS Federal, Bernward company pages. Small firms have no Indeed footprint; company career pages (Stolar, Severn Excavation, Valor Home) filled the gap.                                                                                                           | —                          | —                      |

## What did not work

- **Maryland eMMA VSBE vendor search** — `emma.maryland.gov` login page and `/page.aspx/en/sup/supplier_public_browse` both returned a JavaScript "browser check" / login gate; no vendor table is server-rendered. **Not scrapeable with WebFetch.** Would need a real browser session (Claude-in-Chrome) and the "VSBE Vendor" filter clicked manually.
- **vetrepreneurs.com/md** — Fetched, but the state page is only a county/category index with member counts (e.g., "Home Inspection Services (13)"). The `/md/anne-arundel` county page returned the same index-style content with no business names. Would need per-category pages or a search endpoint.
- **veteranownedbusiness.com profile pages after ~8 fetches** — rate-limited (403, Retry-After ~1h). Re-run later to pull the remaining profile-level details (owner/branch) for the directory-only records.
- Searches for veteran-owned **garage door, tree service, pest control, restoration/water-damage, asphalt/paving, event venue** in the target counties returned zero credible veteran-owned hits. Either they don't exist locally or they don't self-identify online.

## Candidates seen but excluded (and why)

- Scardina Home Services (Millersville) — founded 1950 by a WWII Navy veteran; current president Jim Scardina (grandson) is not described as a veteran. Founder-only evidence.
- Site Support Services (Towson) — VOB-listed, Navy Vietnam-vet owner, but acquired by Tate Engineering in Jan 2020; ownership likely changed.
- Severn Construction Company (Annapolis) — "veteran owned small business" text exists in search snippets, but severnconstruction.biz now redirects to an unrelated remodeling site; could not attribute the quote to a live URL. Possibly inactive/rebranded.
- All Around Improvements Construction (Gwynn Oak) — "Minority/Veteran Owned" only on Facebook/HomeAdvisor; the website found (allaroundimprovements.com, est. 2018, MD & DE) appears to be a different company; Birdeye flags "temporarily closed".
- GK Construction Company (Clarksville) — VOB-listed but MHIC license shown as expired (BuildZoom, 04-2026).
- Assured Comfort Services (Huntingtown), HPC Services (Waldorf), District Veterans Contracting (DC), Precision Paintworks (Clarksburg), Venergy Group (Fort Pierce FL), All American Jetting (Manassas VA) — veteran-owned but outside the ~35-minute radius.
- Alascio Construction — "veteran construction contractors" on their site reads as "experienced," not veteran-owned; site returned 403 so could not confirm.
- J&M Services (Davidsonville), Naretev Solutions, Hands of Support, Thomas Banks & Mitchell — appeared on the AA county listing but no profile/website could be found to evidence anything beyond the name.
- Junk Removal Veterans — appears to be a national lead-gen brand (877 number), not a local owner.
- Advent Automation (Hanover, ATM/alarm install) — directory-only, marginal trade fit; left out to keep the list tight.

## Confidence tiers inside the JSON

- **Tier A (own-site quote + named owner):** Innovative Electric, Stolar, Severn Excavation, Warrior Plumbing, Dvorak, Valor Home, Kanga Roof, Certified Roofing, Chesco, Blue Horizon, Fuqua's, Freedom Fence, Brothers Flooring, Preferred Cleaning, Joint Forces Roofing, Brauner, RDTS, P&J, IWS, Easy Movers, Call the Sarge, Atomic Geeks.
- **Tier B (VOB profile with owner + branch, no company site fetched):** Collective Contracting, Hy-Tech, Bernward, Sergeant HandyMan, Kleins, Tidewater, ABTECH, MD Contract Painting, Capital Renaissance, Veteran Landscaping, A-1 Plumbing, Capitol Cabinetry, Adams HVAC, American Veteran GC, SanDow, Charm City Builders, Allen & Son, FiberPlus, LRS Federal, Veteran Design & Construction, PAINT CORPS.
- **Tier C (directory listing only, no owner/branch):** CSM Lawn, Apollo's Construction, O'Reilly PM, Green Meadows, Brown Construction Mgmt, InfraDMS, All-American Intelligent Solutions. Verify by phone before driving out.

## What I would search next

1. **eMMA VSBE via Claude-in-Chrome**: log the public browser session, filter "VSBE Vendor" + NAICS 236/238, county = Anne Arundel/Baltimore/Howard. This is the only authoritative state list and was blocked here.
2. **Re-hit veteranownedbusiness.com profiles after the rate limit clears** for the Tier C records (`/business/32271`, `/12172`, `/17274`, `/5865`, `/1637`, `/26330`) to capture owner + branch, and pull page 2 of the AA county listing plus the Glen Burnie/Pasadena/Severna Park city sub-pages (`/md/anne-arundel/glen-burnie` etc.).
3. **Procore SDVOSB page 2** and the Procore `/us/md/annapolis/sdvosb` and `/us/md/columbia/sdvosb` variants; filter out multi-state consultancies.
4. **Anne Arundel County PAVE program vendor list** (aacounty.org purchasing) and the **AAEDC government-contracting directory** — county-certified veteran vendors, likely with contact names.
5. **Marine-specific angles**: "Marine Corps League" + Anne Arundel / Baltimore detachment business members; "USMC veteran owned" + Maryland + trade; Semper Fi Fund / MCL sponsor lists. Four Marine-owned firms surfaced organically (Severn Excavation, Tidewater Refrigeration, Charm City Builders, RDTS) — the branch match is the strongest warm path DJ has.
6. **Indeed company-page sweep** for every Tier A/B firm not yet checked (Chesco, Certified, Valor Home, Joint Forces, Warrior, Freedom Fence) using `indeed.com/cmp/<name>`; and **Google Maps reviews** mentioning "never called back" / "no response" as ops-pain evidence (not attempted here).
7. **Glen Burnie/Pasadena/Severna Park Chamber and BBB "veteran-owned" filters** — BBB profiles sometimes carry a "Veteran-Owned" attribute that search snippets don't expose.

## Board subs enrichment

Companion to `board-subs-2026-09-18.json` (23 records, `sub-001`..`sub-023`, same order as the existing board). Method: company site (About/Team/Careers/Contact) + one or two targeted searches per firm + LinkedIn company page for headcount range; BBB/NECA/Bluebook/aggregators only where the site was silent, and flagged as such. Nothing was fabricated; "unknown" where not found.

### One line per company

| id      | company                    | what was found                                                                                                                                                                                                                                                                           |
| ------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| sub-001 | Temp Air Company           | 130+ staff (site), LinkedIn 51-200; Director of Estimating + 2 estimators + 3 PMs named; password-protected internal Bid Board; ABC/BCE; Nick Bobes President on LinkedIn; PM/Estimator/APM postings visible in search only (Glassdoor/Indeed/BeBee blocked). No veteran evidence.       |
| sub-002 | Windsor Electric           | LinkedIn 201-500; estimates@ inbox + VP-Director of Estimating (Lou Westermeyer) with direct line; Edward Kirk President direct line (410) 205-8538 on site; ABC/BCE/ASA. No postings.                                                                                                   |
| sub-003 | Kroeger Electric           | No website; NECA + IBEW 24; BBB: Leonard Bathgate President, Roland Lee Kroeger VP, since 1963; personal email on NECA page; headcount conflicting (~9 vs 50+), unverifiable. No postings. 5 min away.                                                                                   |
| sub-004 | Arundel Electrical         | **SDVOSB/VOSB** per Appello directory (own domains dead: TLS error / cert = accountterminated.com); NECA + IBEW 24; Karl Krasauskis VP (karl@arundelelectrical.net); 11-25 staff; hours M-F 6-5. Owner name not published. 8 min away.                                                   |
| sub-005 | Schuster Concrete          | LinkedIn 501-1,000; Sales & Estimating form + drawing upload; PM (Indeed, 401) and Project Coordinator (Tallo, 410 Gone, exp. 8/18/2026) in search only; no associations on site; no direct channel.                                                                                     |
| sub-006 | Premier Concrete           | LinkedIn 11-50; 'Invitation to Bid' routes to one named estimator (Dan Beck x24); owner Jim Workmeister email + ext published; ABC/BCE/ASA; hiring Field Engineer + trades only.                                                                                                         |
| sub-007 | Ruff Roofers               | **PE-backed since Mar-2025 buyout (Audax; CEO Bill Emory)** — family framing stale; LinkedIn 51-200; estimate form; careers list includes 'Project Managers' (undated); ABC/BCE/NRCA awards; Rob Ruff VP on LinkedIn. 15 min.                                                            |
| sub-008 | J.F. Fischer               | 43 office + 200+ field (site); 3rd-gen Fischers named, no direct channel; AGC/BCE/MCAA; no postings (Indeed blocked).                                                                                                                                                                    |
| sub-009 | Clinton Electric           | LinkedIn 11-50; Picktime online booking; **live 'Customer Service Representative' posting** on JazzHR; 32 BBB complaints/3 yrs; president identity conflicts (ZoomInfo Michael Wall vs BBB Jordan Mayer).                                                                                |
| sub-010 | Live Green Landscape       | LinkedIn 51-200; 3 named commercial estimators + office manager; ABC/LCA/NALP; postings: Account Manager, Designer, Sales (Nov-Dec 2025); no direct owner channel.                                                                                                                       |
| sub-011 | Comer Construction         | LinkedIn 51-200; **live Estimator + Junior Estimator postings** with 2026 sign-on bonus; MD AGC + MWMCA; Susie Comer Owner/President on LinkedIn; hours M-F 6-5. 50 min.                                                                                                                 |
| sub-012 | Scaffold Resource          | LinkedIn 201-500, $44M (aggregator); PM/APM/Scheduler postings in search only (ZipRecruiter/LinkedIn/Indeed blocked; LinkedIn IDs ~2024); ABC/ASA/SAIA/WBC/DC Chamber; sales@ only.                                                                                                      |
| sub-013 | Maloof Contracting         | Thin site confirmed; Robert A. Maloof Jr. President on LinkedIn; no associations, no postings; BBB start 2007 vs site 1988. 15 min.                                                                                                                                                      |
| sub-014 | R.F. Warder                | Woman-owned union SBE since 1996 (BBB); Office Manager Deborah Hammond (BBB); dstallings@ email on site; president listed only as 'R F Warder'; no postings.                                                                                                                             |
| sub-015 | Cole Roofing               | LinkedIn 51-200 (55 per Crustdata); full leadership page incl. Chief Estimator; hours 7-4; ABC/BCE/ASA/NRCA/MARCA/IIBEC; Bill Cole on LinkedIn; hiring field/service superintendent only.                                                                                                |
| sub-016 | L.R. Willson & Sons        | **Office is Gambrills (not Baltimore), ~15 min**; 250+ staff (site); 3 named estimating desks + free-estimate form; office + shop hours listed; AISC/PCI; Donald E. Willson President on LinkedIn.                                                                                       |
| sub-017 | Ashton Manor Environmental | LinkedIn 51-200; 4 estimators + precon manager + 5 PMs named; **live Project Manager + Estimator postings**; **Director of Operations is a retired USMC LtCol**, one PM is USCG vet (owner Jeff Schwartz not a stated vet); estimate form.                                               |
| sub-018 | Anchor Mechanical          | LinkedIn 201-500; ~60 named office staff incl. 3 dispatchers, bid coordinator, 3 estimators; **principal Mark Huntley has a stated 'military background'** (branch not given); Safety Director is Navy vet; Request-a-Quote form; ABC/NFIB; no postings. Address is Forest Hill, 50 min. |
| sub-019 | Blue Horizon Renovations   | Veteran-owned (own site); showroom by appointment; consultation form; no postings; owner Thomas Vendemia, form-only channel. (= vet-001)                                                                                                                                                 |
| sub-020 | Apter Remodeling           | Andy Apter President, NARI national officer + Chesapeake chapter co-founder; request-quote form; BBB address 2109 Forest Dr Annapolis (site lists none); no postings.                                                                                                                    |
| sub-021 | Lynch Design Build         | **Churchville, Harford (not Anne Arundel)**, 50 min; LinkedIn 2-10; Office Manager + PM named; MBIA + Harford Chamber; posting: Lead Carpenter only.                                                                                                                                     |
| sub-022 | Owings Brothers            | LinkedIn 11-50; 5 owners named; hours M-F 8:30-4:30 (Howard Co. Chamber); NAHB/MBIA/NKBA/Rotary; consultation CTAs; general employment form only.                                                                                                                                        |
| sub-023 | J Paul Builders            | LinkedIn 11-50; Paul Lichter Principal Owner on LinkedIn, Steven Lichter VP; Pikesville office suite (Annapolis is a service area); no associations, no postings.                                                                                                                        |

### Sites and pages that were blocked

- **Indeed** — every company page and `viewjob` URL returned 403/401 (Temp Air, Schuster, Scaffold Resource, J.F. Fischer). Posting evidence from Indeed is search-snippet only.
- **Glassdoor** — job listing and company jobs pages 403 (Temp Air, Schuster).
- **ZipRecruiter** — job page 403 (Scaffold Resource PM).
- **LinkedIn job view** — redirected to a generic job search (Scaffold Resource). LinkedIn _company_ pages did render and gave headcount ranges for 15 firms.
- **The Blue Book (ProView)** contacts pages — 403 for Temp Air, Arundel Electrical, Maloof.
- **ZoomInfo** company page — 403 (Arundel Electrical). Person titles from ZoomInfo were taken from search snippets and flagged as aggregator.
- **Tallo** — Schuster Project Coordinator listing 410 Gone. **BeBee** — Temp Air Mechanical Estimator listing 404.
- **Manta / LeadSmart / TopProz** — empty or JS-only; no Kroeger headcount.
- **arundelelectrical.com** (TLS internal error) and **arundelelectricalcontractors.com** (certificate for `accountterminated.com`) — both dead.
- **clintonelectric.com/about-us/we-are-hiring/** — 404 (the JazzHR portal worked instead).

### Companies with live estimator / PM / office postings right now

Verified on a fetchable page today (undated unless noted):

1. **Comer Construction** — Estimator, Junior Estimator (careers page; sibling Grading Foreman post dated Apr 28, 2026).
2. **Ashton Manor Environmental** — Project Manager, Estimator (careers page; resume@ashtonmanor.com).
3. **Clinton Electric** — Customer Service Representative (JazzHR portal).
4. **Ruff Roofers** — 'Project Managers' listed among open roles (careers page, general Wufoo form).

Surfaced only in search snippets, with the posting page itself blocked or gone (treat as unverified):

5. **Temp Air Company** — Mechanical Project Manager (Glassdoor), Mechanical Estimator (BeBee), Assistant PM / Project Engineer.
6. **Schuster Concrete** — Commercial Concrete Construction Project Manager (Indeed), Project Coordinator (Tallo; expiry 8/18/2026, likely expired).
7. **Scaffold Resource** — Project Manager, Assistant Project Manager, Project & Labor Scheduler (ZipRecruiter/LinkedIn/Indeed; LinkedIn IDs suggest 2024).

Adjacent (sales/account, not estimator/PM/office): Live Green Landscape Associates (Account Manager, Dec 2025).

### Veteran ownership found

- **Arundel Electrical Contractors** — "Service Disabled Veteran Owned Small Business (SDVOSB) and Veteran Owned Small Business (VOSB)" (Appello directory; company site dead). Owner unnamed.
- **Blue Horizon Renovations** — "veteran-owned" on its own homepage (already vet-001).
- **Anchor Mechanical** — principal Mark Huntley: "Mark's military and sports background…" (site About). Not explicitly "veteran"; branch not stated.
- Not ownership, but branch matches: **Ashton Manor Environmental** Director of Operations Aaron K. Ruffins, "retired Lieutenant Colonel and Commanding Officer in the United States Marine Corps".

### Corrections to the existing board

- L.R. Willson & Sons is in **Gambrills, AA County** (~15 min), not Baltimore.
- Lynch Design Build is in **Churchville, Harford County** (~50 min), not Anne Arundel.
- Ruff Roofers is **private-equity owned** (Audax; buyout 13-Mar-2025; CEO Bill Emory) — not a family decision any more.
- J Paul Builders' Annapolis presence is a service area, not an office.
- Anchor Mechanical's HQ is Forest Hill (1630 Robin Circle), ~50 min, not Bel Air proper.
