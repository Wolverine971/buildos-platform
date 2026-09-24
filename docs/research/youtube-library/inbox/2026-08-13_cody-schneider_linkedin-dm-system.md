<!-- docs/research/youtube-library/inbox/2026-08-13_cody-schneider_linkedin-dm-system.md -->

# “He’s Sending 250,000 LinkedIn DMs a Month” — transcript notes and BuildOS analysis

**Video:** [Cody Schneider with Nick Abraham](https://www.youtube.com/watch?v=9jAun-5IxZE)  
**Published:** 2026-08-13  
**Duration:** 49:34  
**Analysis date:** 2026-08-28

## Bottom line

The headline tactic is not the strategy BuildOS should copy.

The video’s headline tactic is a high-volume InMail operation built from scraped Open Profile
status, rotated Sales Navigator licenses, rented LinkedIn identities, and automated sequencers.
LinkedIn says bulk InMail is unavailable, InMails must be sent individually, third-party scraping
and message automation are prohibited, and members may not share or use another person’s account.
That makes the exact implementation an account, reputation, and platform-dependency risk:

- [LinkedIn: InMail messages in Sales Navigator](https://www.linkedin.com/help/linkedin/answer/a102025/inmail-in-sales-navigator-overview?lang=en)
- [LinkedIn: prohibited software and extensions](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions)
- [LinkedIn User Agreement](https://www.linkedin.com/legal/user-agreement)

The durable idea underneath it is strong:

> Find an undercrowded channel where the buyer is already active, use behavior as a signal, split
> the audience into small problem-specific segments, make every touch relevant to that segment,
> respond immediately, and remember the result so the next touch gets smarter.

For BuildOS, the compliant version is **signal → proof → conversation → setup → remembered
relationship**. DJ’s posts and comments create distribution; the BuildOS Page and product provide
proof; warm, manual messages convert demonstrated interest into a useful setup conversation.

## Timestamped near-transcript

These notes preserve the substance and sequence without reproducing the full copyrighted transcript.

- **00:00–04:00 — Thesis and setup.** Cody frames marketing as a search for temporary GTM
  arbitrage. Nick says Leadbird sends roughly 250,000 LinkedIn InMails per month and far more total
  LinkedIn messages across customers.
- **04:00–08:00 — Why LinkedIn appears to outperform email.** Cold email is cheap and crowded.
  Nick claims the same leads produce about three times the reply rate and almost twice the positive
  reply rate on LinkedIn. His explanation is channel saturation, not magical copy: a mediocre offer
  can perform better where the inbox is quieter.
- **08:00–12:00 — The InMail mechanism.** The operation identifies Premium members with Open
  Profiles so messages do not consume normal InMail credits. Nick then describes rotating multiple
  Sales Navigator licenses to raise the number sent from one profile.
- **10:00–14:00 — The risky scaling layer.** He describes buying cheaper regional licenses,
  renting other people’s profiles, and using sequencers or a custom system to automate delivery.
  Cody adds another operator who allegedly sends 600,000 DMs per month from profiles supplied by
  overseas workers.
- **14:00–18:00 — Audience activity is the best targeting signal.** Nick says targeting people who
  were active on LinkedIn in the previous 30–45 days can nearly double reply rates. Cody generalizes
  the point: use the channel where a specific buyer already spends time; he cites Instagram DMs for
  visual local-service businesses.
- **18:00–22:00 — Cold email becomes a set of micro-campaigns.** Instead of pulling one big ICP
  list, map the total addressable market, identify subsegments and signals, then write a separate
  message for each combination. Their example splits lead-generation agencies by delivery channel:
  cold calling, email, or LinkedIn.
- **22:00–26:00 — One-to-one marketing, not generic outbound.** AI makes it cheap to research each
  company and turn a message into a miniature ad for that business. They also split campaigns by
  the recipient’s email infrastructure so deliverability problems can be isolated without pausing
  the whole audience.
- **24:00–28:00 — Segment by role as well as company.** The same product gets a different reason to
  care depending on the person. A finance buyer at a cold-calling agency receives a cost-reduction
  angle; an operator receives a workflow angle. Nick sees this as useful for finding a SaaS
  product’s first thousand users, provided the market is large enough and execution is precise.
- **28:00–32:00 — Other undercrowded channels and speed to lead.** They mention direct mail and
  calling as channels returning to favor. Nick uses human SDRs for positive replies during business
  hours and an AI voice agent after hours so an interested lead receives a fast response. They also
  acknowledge serious legal risk around unsolicited AI calls and texts.
- **32:00–38:00 — The operational layer is the real bottleneck.** LinkedIn and email replies flow
  into a unified inbox and CRM. Positive replies trigger contact enrichment, assignment, follow-up,
  and after-hours handling. Nick argues that launching campaigns is easy; converting a reply into a
  meeting, following up, and reactivating old opportunities is where most systems fail.
- **38:00–42:00 — Marketing operations as software.** They describe CRMs with usable APIs/MCPs as
  infrastructure that agents can update behind the scenes. One example finds past champions who
  changed companies and reintroduces the product at the new employer.
- **42:00–46:00 — Store response history.** Nick recommends retaining reply data and using it as a
  future lead-scoring signal. He calls people with a history of engaging “power responders” and
  claims campaigns to that group can reach a 9% reply rate.
- **46:00–49:34 — Nurture and closing.** Positive replies that later go quiet are placed into a
  weekly nurture stream. They close by emphasizing balanced email infrastructure, relevant offers,
  ongoing follow-up, and volume.

## Claim audit

| Claim in the video                                                          | What supports it                             | How to treat it                                                                            |
| --------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 250,000 InMails/month; more than one million total LinkedIn messages        | Guest assertion                              | Directional anecdote, not verified evidence                                                |
| LinkedIn gets roughly 3x email’s reply rate and nearly 2x its positive rate | Guest says the same lead lists were compared | Interesting hypothesis; no sample size, time range, raw counts, or campaign controls shown |
| Activity in the last 30–45 days nearly doubles replies                      | Guest assertion                              | Strong test idea; do not present as a benchmark                                            |
| Four stacked licenses allow about 3,200 Open Profile InMails per profile    | Description of their current implementation  | Platform-dependent and contrary to LinkedIn’s stated individual-send/use-limit model       |
| Every B2B/service market tested performs well                               | Guest impression                             | Overgeneralized; offer quality, audience fit, and identity trust still matter              |
| “Power responders” reach a 9% email reply rate                              | Historical internal response data            | Useful first-party scoring concept, but an unverified result                               |
| Fast follow-up improves reply-to-meeting conversion                         | Operational experience                       | Credible principle; measure it in BuildOS rather than importing a benchmark                |

The speakers are selling outbound services and adjacent tools. The claims are useful for hypothesis
generation, but the video is not a controlled case study.

## The BuildOS GTM motion to use

```text
active audience signal
  → one narrow pain/role segment
  → real BuildOS receipt that answers the pain
  → DJ post + useful comments in existing conversations
  → manual follow-up after demonstrated interest
  → audience-specific setup
  → activation and seven-day return
  → response language stored for the next post
```

This strengthens the current [Creator Acquisition Operating System](../../../marketing/campaigns/creator-acquisition/README.md)
instead of replacing it. That system already has the right account split: **DJ distributes; BuildOS
proves**.

### Initial LinkedIn segment

Stay with the Writer pilot long enough to learn one coherent audience. On LinkedIn, bias the Writer
segment toward people who are visibly present there:

- nonfiction authors and author-operators;
- ghostwriters and editors;
- book coaches and publishing professionals;
- creator-business operators working on long-horizon intellectual projects.

Do not alternate Writer, YouTuber, general productivity, recruiting, and AI-founder posts in the
same four-week test. The personal brand may ultimately span them, but one campaign needs one dialect.

### Signals worth using

Use public, manually observed signals that make the next touch timely:

- a recent post about returning to a manuscript or stalled long-form project;
- a comment describing scattered notes, continuity loss, or tool sprawl;
- an announced book, newsletter, research project, or content series;
- a role change that creates a new workflow or team-coordination problem;
- prior thoughtful engagement with one of DJ’s posts.

The last category is the safe version of “power responders”: people who have already chosen to
interact, not a scraped list of people known to answer cold messages.

## How this should shape DJ’s LinkedIn content

### Four repeatable post jobs

1. **Audience-recognition post** — name a precise moment: “You finally get 90 minutes to write and
   spend the first 40 remembering the book.”
2. **Receipt post** — show a real before/after from an owned or permissioned project. Screenshot,
   short screen recording, or native document; never a canned demo presented as customer proof.
3. **Judgment post** — turn the receipt into a portable idea: “The problem is not motivation. It is
   re-entry tax,” “Context compounds,” or “Productivity is a byproduct of clear thinking.”
4. **Founder-proof post** — show the decisions and mistakes behind the system: “I overengineered
   it,” “Hard work does not speak for itself,” or a product constraint that still needs work.

The feed should teach the category and show the work. The product mention is the consequence of the
insight, not the premise of every post.

### Receipt-post structure

1. **Specific moment:** two lines in the audience’s language.
2. **Visible evidence:** the real input, transformation, and next move.
3. **Founder judgment:** what this changed in DJ’s understanding.
4. **Useful takeaway:** one thing the reader can apply without BuildOS.
5. **Low-friction CTA:** a diagnostic question or one relevant setup slot.

Working draft, to complete only after the real receipt exists:

> You finally get 90 minutes to work on the project you care about.  
> You spend the first 40 reconstructing it.
>
> That is not procrastination. It is a re-entry tax.
>
> I tested this on **[real project]**. The notes were all there, but the current state was not. I
> captured **[real input]**, turned it into **[truthful visible structure]**, and made the next move
> explicit: **[next move]**.
>
> The lesson: an idea bank stores material. A working project has to preserve decisions, open
> threads, and what happens next.
>
> Writers and author-operators: when you return after two weeks away, what do you have to rebuild
> before you can work?

### Warm follow-up

Only message after a real signal, and write it manually:

> Your comment about **[specific re-entry problem]** stayed with me. I just documented how I’m
> handling that in **[real project]**. Happy to send the breakdown if it would be useful—no pitch.

If they ask for it, send the artifact and ask one diagnostic question. Offer a setup only when their
answer reveals a real match.

## Four-week LinkedIn test

Each week:

- observe 3–5 current conversations in the chosen segment;
- leave five useful comments that add an example, distinction, or question;
- select one repeated pain and capture one real BuildOS receipt;
- publish one proof-supported post from DJ’s profile;
- selectively repost the proof from the BuildOS Page with added context;
- respond to substantive comments the same day;
- send manual follow-ups only to people who explicitly engage or request help;
- record the person, segment, signal, language, post, conversation, and outcome.

Primary scorecard:

- 4 real receipts published;
- 20 useful comments;
- qualified comments and profile visits;
- relevant DMs or artifact requests;
- 3 setup conversations;
- creators who reach a useful first-project state;
- seven-day returns.

Treat impressions and follower growth as diagnostics. The test wins when the right people enter a
conversation, try a real workflow, and come back.

## Do not copy from the video

- rented or fake profiles;
- shared credentials or cookies;
- rotating licenses to circumvent use limits;
- scraped Open Profile or activity data;
- automated connection requests, InMails, comments, likes, or DMs;
- calendar links in unsolicited first messages;
- adding silent prospects to nurture without a reviewed consent/compliance basis;
- AI replies that impersonate DJ without clear controls and human review.

The scarce asset is not message volume. It is DJ’s identity and the trust around BuildOS. Protect
that asset while borrowing the video’s best principle: relevance compounds when every interaction
teaches the next one.
