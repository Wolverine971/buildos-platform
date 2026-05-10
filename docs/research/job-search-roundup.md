<!-- docs/research/job-search-roundup.md -->

<!--
DJ NOTES
No crypto, no heavy infra jobs. No jobs that require ice security clearance.
-->

# Job Search Roundup

_Last updated: 2026-05-09_

---

## Strategy (May 2026)

**Mode:** Bridge job — keep BuildOS alive on the side, need real cash comp now, want evenings/weekends free.

**Target archetype:** Senior product engineer at a Series B–D AI-native company. Defined scope, $220–300K base band, remote or hybrid-DC, AI feature surface. Drop "founding engineer" framing — those roles assume full mindshare and are the wrong shape for a bridge.

**Pitch positioning:**

> Shipped a production agent-native AI product solo (multi-LLM routing, agentic chat, MCP-style harness, Supabase-native queue) **and** owned a 7-partner integration layer at a YC company at scale.

- For **AI feature roles** (Linear AI, Notion AI, Replit Agent, Vercel Agent) — lead with BuildOS.
- For **integration / platform roles** (Mercury Banking Integration, Vercel AI Gateway, Plaid) — lead with Curri.
- Use **Curri YC S19 alum status** for warm intros via the YC founder network where possible.

---

## Local MD/DC — May 2026 round

_Verified live 2026-05-09. Glen Burnie home base, ~1hr drive radius covers Baltimore, Annapolis, Columbia, DC, Tysons, Fort Meade, Arlington, Alexandria. All postings checked via direct fetch or Lever/Greenhouse JSON API; expired postings dropped, not papered over._

**Why this list looks the way it does.** Most distinctive local product orgs are still remote-first (Aledade, Mercury-style). Senior IC seats in MD/DC tend to live at Aledade (Bethesda HQ, primary primary-care/value-based-care platform), Tenable (Columbia HQ, security platform with real product surface), Capital One McLean (highest-comp local seat with real AI work), and a handful of mission/civic shops (Nava, Strider Tysons). DC media-tech (Politico/NPR) had near-zero open senior IC seats at fetch time. ZeroFox, Govini's senior SWE roles, and most Bowie/Inovalon postings are either expired or have salary bands well below the $220–300K target. Ranked by combined fit (local + comp + resume thread match).

| # | Company | Role | Location | Link | Resume thread |
|---|---------|------|----------|------|---------------|
| 1 | Aledade | Staff Software Engineer - Full Stack | Remote, US (Bethesda HQ) | [link](https://jobs.lever.co/aledade/f8602b51-a4d2-4db2-90b4-f088a2972eeb) | BuildOS + EHR/integration overlap (chromium overlay UIs, EHR/EMR integration explicitly preferred) |
| 2 | Aledade | Staff Software Engineer, Agentic Patient Outreach | Remote, US (Bethesda HQ) | [link](https://jobs.lever.co/aledade/37625a71-4c88-4f2c-8ea4-8a8fa630415b) | BuildOS agent harness — voice + messaging modalities + AI orchestration is a 1:1 description |
| 3 | Capital One | Sr Lead Software Engineer, Full Stack AI Parser - Shopping (Remote-Eligible) | McLean, VA / Remote (band $209–262K) | [link](https://www.capitalonecareers.com/job/mclean/sr-lead-software-engineer-full-stack-ai-parser-shopping-remote-eligible/1732/94770784592) | BuildOS multi-LLM routing — exact tech list (TS/Python/Go + LLMs/AI tooling); local hub, real comp |
| 4 | Aledade | Staff Software Engineer - Data AI Agent | Remote, US (Bethesda HQ) | [link](https://jobs.lever.co/aledade/4ef7fcd0-40c5-4ec7-a678-e836408521e5) | BuildOS agentic chat + data tooling; "OpenAI/Pinterest Data Agent inspired" is straight from your wheelhouse |
| 5 | Strider Technologies | Forward Deployed Engineer | Tysons Corner, VA (onsite/hybrid) | [link](https://jobs.ashbyhq.com/strider-technologies/76d9690d-08d4-4762-b299-b56681e9a088) | Curri integrations + DoD background — embed with customers, ship 0-to-1, no clearance required upfront |
| 6 | Tenable | Senior Software Engineer - User Interface | Columbia, MD hybrid ($137–183K) | [link](https://job-boards.greenhouse.io/tenableinc/jobs/5203025008) | React/TS/Svelte chops; Columbia is 25 min from Glen Burnie, hybrid not remote-only |
| 7 | Tenable | Senior Software Engineer - Event Sourcing & Stream Processing | Columbia MD HQ + Remote VA/MA/CA | [link](https://job-boards.greenhouse.io/tenableinc/jobs/4994807008) | BuildOS Supabase queue + Curri webhook+polling reconciliation maps directly to event-sourcing/Kafka work |
| 8 | Aledade | Senior Software Engineer I, Backend | Remote, US (Bethesda HQ, $125–165K) | [link](https://jobs.lever.co/aledade/a788ae8d-0bbb-4b1e-aa7b-dc9aeb70994f) | Bridge-comp safety pick: Bethesda HQ company, lower band but cleanest "senior IC" fit |
| 9 | Aledade | Full-Stack Analytics Engineer II | Washington DC (in-office/hybrid) | [link](https://jobs.lever.co/aledade/d5042db4-37cf-40d4-846b-c16a5c36d403) | One of the few DC-onsite seats at Aledade — full-stack + data; Census Bureau analytics UI thread fits |
| 10 | Govini | Forward Deployed Software Engineer | Arlington, VA / Pittsburgh / Remote | [link](https://job-boards.greenhouse.io/govini/jobs/4068889009) | Marine Corps + DoD lineage + Curri customer-embed pattern; clearance "desired" not required |
| 11 | Nava PBC | Senior Security Engineer (Azure Security) | Remote | [link](https://job-boards.greenhouse.io/navapbc/jobs/4206543009) | Census/MetroStar + DoD civic-tech thread — Nava builds public-benefits delivery, no clearance |
| 12 | Tenable | Senior Software Engineer (general) | Columbia MD HQ + Remote CA/MA | [link](https://job-boards.greenhouse.io/tenableinc/jobs/4945094008) | Backup IC seat at the most senior-IC-friendly local product company |

### Notes on what got cut and why

- **ZeroFOX Sr SWE (Baltimore)** — posting expired (`smartrecruiters.com/ZeroFOX/75388931...` shows "this job has expired"). Worth checking ZeroFox's main board if Baltimore-onsite matters.
- **Govini Senior Software Engineer / Lead Software Engineer** — all senior IC engineering roles are Pittsburgh-based. Only Arlington-eligible engineering seat is the Forward Deployed role (#10) and Senior Implementation Engineer (75% travel, customer-facing — not the right shape).
- **Inovalon (Bowie, MD)** — Staff SWE L6 band is $222K and they have Bowie HQ presence, but the engineering culture (.NET / Angular / C# legacy stack, healthcare ops grind) is a poor BuildOS match. Skip unless you want a steady-paycheck rest stop.
- **Aledade Lever URLs from Google search results** — multiple "Senior Software Engineer I - Fullstack" / "Senior Staff Full Stack" / "Staff Fullstack" links surfaced in Google but return 404 from the Lever API. Search caches are stale. The 4 Aledade roles in the table above are confirmed live via API as of this fetch.
- **Politico / NPR / Atlantic Media / Punchbowl** — Politico has 1 historical Sr SWE role on LinkedIn but no live engineering posting on their Ultipro careers board in a usable browser; NPR's only currently-open engineering role is "Lead AI Solutions Engineer" (worth a look but adjacent, not core IC); Atlantic Media's only open role is mid-level Data Engineer; Punchbowl careers page is 403'd to fetchers and surfaced no engineering roles in search. DC political-tech is thin right now.
- **Optoro / FiscalNote / Quorum / Higher Logic** — these all have careers pages but no senior full-stack IC roles surfaced in fetch + search; Higher Logic's open Senior Front-End is band $86–132K (well below target).
- **Skylight / Truss Works / Ad Hoc / Coforma** — civic-tech consultancies; Skylight's open senior engineering roles are DevOps/Security focused (CDC, HHS) with clearance language. If a civic-tech bridge interests you, drop Skylight a resume directly via [apply.workable.com/skylight](https://apply.workable.com/skylight/) — their roles don't render to fetchers and turn over fast.
- **Capital One non-AI Senior SWE Full Stack (R203...)** — referenced in Google but URL 404s. The Sr Lead AI Parser role (#3) is the one verified open as of fetch.

### Application strategy for this list

- **Top priority by leverage**: #1 Aledade Staff Full-Stack and #2 Agentic Patient Outreach. Apply with BuildOS-led pitch (agentic harness + EHR-style integrations from Curri). Bethesda HQ + remote-first + healthcare mission is the cleanest local-aligned bridge job on this list.
- **Highest comp**: #3 Capital One Sr Lead AI Parser ($209–262K) is the only local listing with both your tech stack and your target band published openly.
- **Tysons in-person hedge**: #5 Strider FDE — if you want to physically be in an office with a mission-aligned team and make Marines + DoD case management your story, this is the one. ~45 min drive from Glen Burnie.
- **Columbia MD hedge**: #6/#7/#12 Tenable — 25 min drive, security platform with React/TS frontend + Kafka backend. Great for "I want to commute occasionally" optionality.
- **Don't cold-apply where YC warm intro exists**: none of these are YC alumni companies, so cold-apply is the channel. Aledade's recruiting team is responsive.

---

## Active Targets — Verified Open 2026-05-09

### Tier 1 — Top 6 to prioritize

Best fit for bridge-job constraints (remote, senior IC, AI-product surface).

| #   | Company | Role                                                   | Location             | Link                                                                          |
| --- | ------- | ------------------------------------------------------ | -------------------- | ----------------------------------------------------------------------------- |
| 1   | Mercury | Senior Software Engineer, AI Engineering               | Any office or remote | [link](https://job-boards.greenhouse.io/mercury/jobs/5850044004)              |
| 2   | Pomelo  | Staff Software Engineer, Patient Experience            | US remote ($220–260K)| [link](https://job-boards.greenhouse.io/pomelocare/jobs/5818328004)           |
| 3   | Linear  | Senior / Staff Product Engineer, AI                    | NA remote            | [link](https://linear.app/careers/b4a7764e-c680-4bdf-9956-dc78f2ca94d5)       |
| 4   | Replit  | Senior Software Engineer, Agent Platform               | Remote-friendly      | [link](https://jobs.ashbyhq.com/replit/b82de6f8-aebf-47b8-8bdc-39ea33807975)  |
| 5   | Mercury | Senior Software Engineer, Banking Integration Platform | Any office or remote | [link](https://job-boards.greenhouse.io/mercury/jobs/5791111004)              |
| 6   | Vercel  | Forward Deployed Engineer, v0                          | US distributed       | [link](https://vercel.com/careers/forward-deployed-engineer-v0-us-5872425004) |

**Why these six:**

- **Mercury AI Engineering** — fully remote, real comp, defined scope, AI work in a non-AI-native co (lower competition, your background stands out).
- **Pomelo Care Staff SWE** — published $220–260K, US-remote confirmed, TypeScript/React/Kotlin + LLM/voice AI surface, Series C maturity (no founding-eng risk). Lowest application friction in the whole list — comp band and remote eligibility both confirmed up front. Lead with BuildOS multi-LLM + agentic chat.
- **Linear AI** — top-tier product org, NA remote, exact "senior PE on AI feature team" archetype.
- **Replit Agent Platform** — direct overlap with BuildOS agent harness work; pitch BuildOS hard.
- **Mercury Banking Integration** — your Curri 7-partner integration story is _the_ fit.
- **Vercel Forward Deployed v0** — customer-facing AI product work, US-distributed, matches your YC answer about loving customer conversations.

### Tier 2 — Strong adds from 2026-05-09 LinkedIn batch

Apply alongside Tier 1; one open question per company to confirm in screen.

| #   | Company    | Role                              | Location             | Link                                                                | Confirm in screen                          |
| --- | ---------- | --------------------------------- | -------------------- | ------------------------------------------------------------------- | ------------------------------------------ |
| 7   | Braintrust | Software Engineer, Product        | SF/NYC + more        | [link](https://www.braintrust.dev/careers)                          | Does "+more locations" include US-remote?  |
| 8   | Protege    | Software Engineer (mid–staff)     | NYC + remote         | [link](https://jobs.ashbyhq.com/protege)                            | Comp band + remote eligibility             |
| 9   | GitButler  | Senior TypeScript Developer       | SF / Berlin / Remote | [link](https://jobs.gitbutler.com/jobs/frontend-typescript)         | Comp band + scope vs. founding-eng         |

**Why these three:**

- **Braintrust** (`braintrust.dev` — NOT braintrust.com talent marketplace) — Series B $80M, $800M valuation, customers are Notion/Stripe/Vercel/Airtable/Zapier (literally BuildOS's peer group). LLM eval + observability is the perfect pitch surface for your multi-LLM routing + agentic chat work. Open Source Engineer roles (Go, Python) are confirmed remote if Product role requires SF/NYC.
- **Protege** (`withprotege.ai`) — Series A $30M a16z (Jan 2026). Founders are AWS/Meta/Lyft/Block alumni — real product-eng culture, not founding-eng-only. Governed AI training-data marketplace = Curri 7-partner integration story is a direct fit. NYC HQ with documented remote roles.
- **GitButler** — Series A $17M a16z (April 2026). Founder is Scott Chacon (ex-GitHub co-founder, Pro Git author) — career-asset signal. AI dev-tools = BuildOS multi-LLM/MCP-style work pitches directly. Remote-friendly. Caveat: 13-person team, so verify scope is IC-defined and not founding-eng-coded.

### Screen-first — email before investing in a full application

Right shape but at least one critical unknown. Send a short note before drafting a tailored cover letter.

| Company         | Role                                    | Location          | Open question                                          |
| --------------- | --------------------------------------- | ----------------- | ------------------------------------------------------ |
| Meridian AI     | Software Engineer, Product (Full-Stack) | NYC               | Defined scope or founding-eng-coded? (Seed stage)      |
| Lio (askLio)    | Software Engineer                       | Munich + US (new) | Is there a US-remote senior IC track? Comp band?       |
| Hilbert         | AI Engineer – Core / Enterprise         | SF hybrid         | Is a remote senior product role available?             |
| Mega (gomega)   | Software Engineer                       | Brooklyn on-site  | Is remote/DC-hybrid on the table?                      |
| Pluvo           | (only Senior Front-End posted)          | Unknown           | Is a senior full-stack/product-eng slot open?          |

### Full list by company

#### Mercury — fully remote, real comp ($200K+ band)

- Senior Software Engineer, AI Engineering — [link](https://job-boards.greenhouse.io/mercury/jobs/5850044004)
- Senior Software Engineer, Banking Integration Platform — [link](https://job-boards.greenhouse.io/mercury/jobs/5791111004)
- Senior Full-Stack Engineer — [link](https://job-boards.greenhouse.io/mercury/jobs/5493086004)
- Senior Backend Engineer, Product — [link](https://job-boards.greenhouse.io/mercury/jobs/5520964004)
- Senior Software Engineer, Stability — [link](https://job-boards.greenhouse.io/mercury/jobs/5969193004)
- Staff Software Engineer, Fraud — [link](https://job-boards.greenhouse.io/mercury/jobs/5847987004)

#### Linear — Europe / North America remote

- Senior / Staff Product Engineer, AI — [link](https://linear.app/careers/b4a7764e-c680-4bdf-9956-dc78f2ca94d5)
- Senior / Staff Product Engineer — [link](https://linear.app/careers/069c4628-88d7-4e4d-b393-c996fc7f3076)
- Senior / Staff Fullstack Engineer — [link](https://linear.app/careers/d3bc1ced-3ce4-4086-a050-555055dbb1ff)

#### Replit — remote-friendly

- Senior Software Engineer, Agent Platform — [link](https://jobs.ashbyhq.com/replit/b82de6f8-aebf-47b8-8bdc-39ea33807975)
- Staff Software Engineer, Product — [link](https://jobs.ashbyhq.com/replit/47235851-fadd-4bd7-9cc6-61f545059ac1)
- Sr. Staff Software Engineer, Replit Cloud — [link](https://jobs.ashbyhq.com/replit/f98605a1-36d2-4b2f-b9be-f66064a02645)
- Senior Software Engineer, Money — [link](https://jobs.ashbyhq.com/replit/0a71787b-1b86-4f86-be79-0a9723d75cc7)
- Software Engineer, Full Stack — [link](https://jobs.ashbyhq.com/replit/2fa2d079-96a5-4d51-8718-04134ed39032)
- Software Engineer, Growth — [link](https://jobs.ashbyhq.com/replit/447a6e11-b06b-4cc5-9203-cd55883f2af4)

#### Vercel — US distributed (some SF/NYC-only, marked)

- Forward Deployed Engineer, v0 (US) — [link](https://vercel.com/careers/forward-deployed-engineer-v0-us-5872425004)
- Software Engineer, Backend (US) — [link](https://vercel.com/careers/software-engineer-backend-us-5430088004) and [link](https://vercel.com/careers/software-engineer-backend-us-5431123004)
- Software Engineer, AI SDK _(NYC/SF only)_ — [link](https://vercel.com/careers/software-engineer-ai-sdk-5474915004)
- Software Engineer, AI Gateway _(NYC/SF only)_ — [link](https://vercel.com/careers/software-engineer-ai-gateway-5798406004)
- Software Engineer, Agent _(SF only)_ — [link](https://vercel.com/careers/software-engineer-agent-5704320004)

#### Hex — most roles remote-USA-eligible

- Software Engineer, Backend (Product) (SF/NYC/Remote USA) — [link](<https://hex.tech/careers/software-engineer-backend-(product)/>)
- Software Engineer, Backend (Platform) (NYC/Remote USA) — [link](<https://hex.tech/careers/software-engineer-backend-(platform)/>)
- Software Engineer, Foundations (SF/NYC/Remote USA) — [link](https://hex.tech/careers/software-engineer-foundations/)
- AI Research Engineer, Search and Context (SF/NYC/Remote USA) — [link](https://hex.tech/careers/ai-research-engineer-search-and-context/)
- Software Engineer, AI Agent _(SF/NYC only)_ — [link](https://hex.tech/careers/software-engineer-ai-agent/)

#### Cognition (Devin) — verify location on each posting

- Full-Stack Engineer — [link](https://jobs.ashbyhq.com/cognition/20f8d655-da65-413e-88e6-5b1d81377717)
- Software Engineer — [link](https://jobs.ashbyhq.com/cognition/e8086415-62bc-4cc0-96a4-84bb56182d35)
- Software Engineer, Infrastructure — [link](https://jobs.ashbyhq.com/cognition/13fdacf7-b4dc-4b9a-ac43-addc87de79ec)
- AI Enablement Engineer — [link](https://jobs.ashbyhq.com/cognition/811c3f5a-b26d-4162-b49b-93890a91794d)

#### Resend — fully remote Americas

- Backend Engineer, Core Sending — [link](https://resend.com/careers/a95832a8-a2ab-4a63-8303-9989f1fc47d6)
- Developer Experience Engineer — [link](https://resend.com/careers/06bd9cb2-d189-41b6-baf7-42bd5da9610f)

#### Pomelo Care — remote-first US, Series C, TypeScript/React + LLM/voice AI

- Staff Software Engineer, Patient Experience (Remote, $220–260K) — [link](https://job-boards.greenhouse.io/pomelocare/jobs/5818328004)
- Senior Software Engineer, Growth (Remote, $190–220K, voice AI + LLM messaging) — [link](https://job-boards.greenhouse.io/pomelocare/jobs/5818248004)
- Senior Product Security Engineer (US) — [link](https://job-boards.greenhouse.io/pomelocare/jobs/5829729004)

#### Braintrust — Series B, AI eval/observability, BuildOS peer-group customers

- Software Engineer, Product — [careers](https://www.braintrust.dev/careers) (SF/NYC + more — confirm US-remote)
- Eval Engineer — [careers](https://www.braintrust.dev/careers)
- Open Source Engineer (Go) — Remote — [careers](https://www.braintrust.dev/careers)
- Open Source Engineer (Python) — Remote — [careers](https://www.braintrust.dev/careers)
- Software Engineer, Backend / Systems / Design Engineer / DevRel — [careers](https://www.braintrust.dev/careers)

#### Protege (withprotege.ai) — Series A a16z, NYC + remote, AI training-data marketplace

- Software Engineer (mid–staff, full-stack scope) — [link](https://jobs.ashbyhq.com/protege)

#### GitButler — Series A a16z, AI-era Git client, remote-friendly

- Senior TypeScript Developer — [link](https://jobs.gitbutler.com/jobs/frontend-typescript)
- Senior Rust Developer — [careers](https://jobs.gitbutler.com/)
- Gerrit Developer — [careers](https://jobs.gitbutler.com/)

#### Notion — _all SF/NYC, only apply if open to relocation_

- AI Applications Engineer (SF) — [link](https://jobs.ashbyhq.com/notion/bc9a9573-e963-48a7-b7b9-a32017f28916)
- Software Engineer, AI Capture (SF) — [link](https://jobs.ashbyhq.com/notion/b31ce253-4238-4ed6-a5a2-73b63cbf1709)
- Model Behavior Engineer (NYC/SF) — [link](https://jobs.ashbyhq.com/notion/4bbfad88-0830-46c5-8d05-d95d17d583ca)

#### Brex — _SF/NYC hybrid 3 days/week, not remote-friendly_

- Senior Software Engineer, AI — Ecosystem (SF) — [link](https://job-boards.greenhouse.io/brex/jobs/8440272002)
- Senior Software Engineer, Product — [link](https://job-boards.greenhouse.io/brex/jobs/8461333002)

#### Cursor / Anysphere — _mostly SF in-person; only these allow remote_

- Software Engineer, Bugbot (SF/NYC/Remote) — [link](https://cursor.com/careers/software-engineer-bugbot)
- Software Engineer, Enterprise Platform (SF/Remote) — [link](https://cursor.com/careers/software-engineer-enterprise-platform)
- Software Engineer, Security (SF/NYC/Remote) — [link](https://cursor.com/careers/software-engineer-security)

#### Plaid — _NYC/SF/Seattle, no remote listed_

- Senior Software Engineer, Full Stack — check [openings page](https://plaid.com/careers/openings/)
- Senior Software Engineer, Backend — check [openings page](https://plaid.com/careers/openings/)

### Cut from list

- **Granola** — all London-based. Skip unless willing to relocate.
- **Trigger.dev** — confirmed no open positions as of 2026-05-09.
- **Supabase** — current openings are Postgres / Go / CLI specialists, not your shape.
- **Mintlify** — SF in-person only.
- **Figma AI Applied Scientist** — skews ML research / publications, not your shape.
- **Akina, IDEA Factory, Stellar Science** — defense-adjacent, slow processes, often clearance-required.
- **Inngest, LangChain** — Ashby pages didn't render via fetch; check [jobs.ashbyhq.com/inngest](https://jobs.ashbyhq.com/inngest) and [jobs.ashbyhq.com/langchain](https://jobs.ashbyhq.com/langchain) directly.

#### Cuts from 2026-05-09 LinkedIn batch (30-company sweep)

**Crypto / blockchain (hard cut):**

- **Babylon Labs** — Bitcoin staking protocol, $5.6B TVL, $BABY token. Hard cut.
- **OpenGradient** — decentralized AI inference network with $OPG token, a16z **crypto**-backed. Hard cut.
- **The Better Money Company** — stablecoin clearinghouse, a16z **crypto**-backed (founder ex-a16z crypto). Hard cut.

**Heavy infra / hardware / clearance-adjacent:**

- **Mariana Minerals** — autonomous copper/lithium mining (Series A, a16z). Heavy infra.
- **Eclypsium** — firmware/hardware supply-chain security. Infra-heavy + clearance-adjacent.
- **Sentra** — cloud DSPM (data security infra). Open roles confirm: Senior Backend / Architect / DevOps. Infra-heavy.

**Founding-engineer scope (violates "no full mindshare" rule):**

- **Concourse** — Series A $12M; every open eng role is "Founding [X] Engineer", NYC. Strong product, wrong shape. Re-check Q3 2026.
- **Dex** — YC W25, Founding Engineer SF, $130–250K base cap.
- **General Magic** — seed insurtech (~sub-15 ppl), no functional careers page.
- **Nexxa.ai** — seed, Sunnyvale, heavy industry vertical.
- **Pensive** — seed $6.87M, ~10 ppl, careers 403s.

**On-site only outside DC (no remote senior IC role):**

- **Treeline** — SF/LA hybrid, IT-services automation domain.
- **Pillar (security)** — Tel Aviv hybrid only.
- **Handle (usehandle.ai)** — only US-remote role is Forward Deployed (implementation, not product).
- **Mega (gomega.ai)** — Brooklyn on-site (moved to Screen-first; ask about remote first before fully cutting).

**Vertical / domain mismatch:**

- **Boltz** — drug discovery foundation models (computational chemistry hiring bar).
- **Phylo** — biomedical research agents (biology vertical mismatch).
- **Stipple Bio** — wet-lab cancer therapy (not a software co).
- **GRAI** — music research lab, ML/research-heavy roles.
- **QuiverAI** — vector design AI, SF on-site, infra/ML roles.
- **Preset** — managed Superset, no relevant openings, BI/data infra.
- **Airbase** — acquired by Paylocity Sept 2024 (no longer Series B–D AI-native).

### Application status tracker

_Fill in as you apply — flag which ones to pursue via warm YC-alum intro instead of cold apply._

| Company    | Role                                     | Status | Channel |
| ---------- | ---------------------------------------- | ------ | ------- |
| Mercury    | Senior SWE, AI Engineering               |        |         |
| Pomelo     | Staff SWE, Patient Experience            |        |         |
| Linear     | Senior/Staff Product Engineer, AI        |        |         |
| Replit     | Senior SWE, Agent Platform               |        |         |
| Mercury    | Senior SWE, Banking Integration Platform |        |         |
| Vercel     | Forward Deployed Engineer, v0            |        |         |
| Braintrust | SWE, Product (or Open Source Eng)        |        |         |
| Protege    | Software Engineer (mid–staff)            |        |         |
| GitButler  | Senior TypeScript Developer              |        |         |
| Hex        | SWE, Backend (Product)                   |        |         |
| Cognition  | Full-Stack Engineer                      |        |         |
| Resend     | Backend Engineer, Core Sending           |        |         |
|            |                                          |        |         |

---

## Historical Suggestions

These are earlier rounds of suggestions kept for reference. Many have been superseded by the verified active list above.

### Original First-Round Suggestions

These are the stronger picks from the first round.

1. **GoGoGrandparent (YC S16)** — Senior Backend Engineer  
   Location: Remote  
   Why it fits: Node.js + TypeScript, mission-driven product helping older adults live independently.  
   Link: <https://www.ycombinator.com/companies/gogograndparent/jobs>

2. **AI Insurance (YC W22)** — App Factory Software Engineer  
   Location: Remote  
   Why it fits: Node.js + React + TypeScript, AI-adjacent workflow software.  
   Link: <https://www.ycombinator.com/companies/ai-insurance/jobs>

3. **State Affairs** — Software Engineer  
   Location: Washington, DC  
   Why it fits: React + Node.js, LLM tools explicitly mentioned, local to DC.  
   Link: <https://www.stateaffairs.com/careers>

4. **Akina, Inc.** — Software Engineer 2  
   Location: Fort Meade, MD  
   Why it fits: Full-stack with AI/ML integration, JavaScript/Node.js/TypeScript.  
   Link: <https://www.akina.com/careers>

5. **IDEA Factory** — Full-Stack Engineer (Backend focus)  
   Location: Maryland  
   Why it fits: LLM/RAG capabilities, Node.js/Python, strong AI fit.  
   Link: <https://www.theideafactory.us/careers>

6. **Upside** — Senior Full Stack Engineer  
   Location: Washington, DC  
   Why it fits: TypeScript + AI/ML focus, product scale, local market.  
   Link: <https://upside.com/careers>

7. **Capitol AI (YC)** — Software Engineer  
   Location: Washington, DC area  
   Why it fits: AI-native company with likely strong alignment to your profile.  
   Link: <https://www.ycombinator.com/companies/capitol-ai/jobs>

8. **Original row was truncated in the Telegram transcript**  
   Note: I could only recover the first 9 entries cleanly from the earlier chat transcript, so I'm not inventing the 10th one.

### Better Second-Round Suggestions With Direct Links

These are the better additions pulled afterward.

4. **Notion** — Software Engineer, AI Workflows  
   Location: San Francisco or New York  
   Why it fits: direct AI product work, strong product engineering signal  
   Link: <https://jobs.ashbyhq.com/notion/17330e14-83db-49a4-ae31-411690d97dba>

5. **Notion** — Software Engineer, AI Capture  
   Location: San Francisco  
   Why it fits: applied AI feature work inside a top-tier product org  
   Link: <https://jobs.ashbyhq.com/notion/b31ce253-4238-4ed6-a5a2-73b63cbf1709>

6. **Notion** — AI Applications Engineer  
   Location: San Francisco  
   Why it fits: overlap with LLM app-building and productized AI systems  
   Link: <https://jobs.ashbyhq.com/notion/bc9a9573-e963-48a7-b7b9-a32017f28916>

7. **Vercel** — Software Engineer, AI SDK  
   Location: New York City or San Francisco  
   Why it fits: very strong TypeScript/devtools fit, high-signal AI ecosystem role  
   Link: <https://vercel.com/careers/software-engineer-ai-sdk-5474915004>

8. **Vercel** — Software Engineer, AI Gateway  
   Location: New York City or San Francisco  
   Why it fits: backend infra + AI platform exposure, strong market positioning  
   Link: <https://vercel.com/careers/software-engineer-ai-gateway-5798406004>

9. **Vercel** — Software Engineer, Agent  
   Location: San Francisco  
   Why it fits: direct agent product work, very aligned with your current AI/operator background  
   Link: <https://vercel.com/careers/software-engineer-agent-5704320004>

10. **Figma** — AI Applied Scientist  
    Location: US hubs / remote-compatible ecosystem  
    Why it fits: stronger if you want to lean harder into applied AI over classic full-stack  
    Link: <https://boards.greenhouse.io/figma/jobs/5707966004?gh_jid=5707966004>

### Additional Suggestions / Previous Follow-Up Mentions

These were also suggested previously and should live in the same doc.

1. **Stellar Science** — Careers page  
   Why it fits: scientific software, AI/ML, computer vision, HPC, some JavaScript/TypeScript exposure  
   Link: <https://www.stellarscience.com/careers/>

2. **AngelList** — Careers / open positions  
   Why it fits: startup ecosystem company, strong product/data engineering environment  
   Link: <https://www.angellist.com/careers#open-positions>

3. **Val Town** — Careers  
   Why it fits: extremely JavaScript-native product, startup scale, builder-focused  
   Link: <https://www.val.town/careers>

4. **Supabase** — Careers  
   Why it fits: developer platform, TypeScript/postgres ecosystem, remote-friendly  
   Link: <https://supabase.com/careers>

5. **LangChain** — Careers  
   Why it fits: direct AI tooling/platform exposure  
   Link: <https://www.langchain.com/careers>

6. **Mux** — Jobs  
   Why it fits: strong developer product company, infrastructure/product engineering fit  
   Link: <https://www.mux.com/jobs>

7. **Notion** — Full careers page  
   Link: <https://www.notion.com/careers>

8. **Vercel** — Full careers page  
   Link: <https://vercel.com/careers>

9. **Figma** — Full careers page  
   Link: <https://www.figma.com/careers>

---

## Notes

- I added links for every item where I had a defensible careers or job posting URL.
- Some first-round links are company careers/job-board pages rather than the exact original posting, because the original response in Telegram did not include all direct URLs.
- The original 10th first-round item was truncated in the source chat, so it remains unresolved rather than guessed.
- 2026-05-09 update: verified all Tier 1 and full-list-by-company links live as of that date. Recheck before applying — startup roles can close fast.
