<!-- tasker/167-mentions-follow-edits.md -->

# 167 — Mentions follow edits (rename, fix a spelling, remove a name)

**Status:** BUILT + SHIPPED 2026-11-18 (code in f03d04d2f; migration `20261118200000` APPLIED in prod, file committed 22bc8dad1; no live run yet) · **Opened:** 2026-11-18 · **Parent:** 160 / 165
**DJ (2026-11-18):** "What if I go in that document and replace the reference to their name? …
We need to tag these entities properly in a task or a document wherever they show up." He fixed
"Phil Valeo" → "Phillip Velayo" in the doc "Pistol Shooting Client Website Context Document"
(`450087fd-…`).

## What happens today (checked 2026-11-18)

- **Docs:** nothing. The docs reader ran once (script); no re-read on edit. The doc still links
  to the misspelled entry "Phil Valeo" with the old quote; the corrected name isn't linked.
- **Tasks:** an edit re-reads the task and syncs, but the sync only ADDS links. The old name's
  link and entry stay.
- **Spelling variants pile up as separate people.** DJ's graph has: Phil (20 links), Phil Vallejo
  (3, tasks), Phil Valeo (1, this doc), Phil Velayo (3), Phillip Velayo (3, radar docs). Name
  matching is exact, so none of them were flagged. Velayo/Phillip Velayo were sorted into the
  public circle (wrong).

## Fix

1. **A record's mentions are replaced on every re-read.** Links a reader made from that task/doc
   that aren't in the new reading are removed (never links the user made by hand).
2. **Docs re-read on edit:** after a doc is saved (debounced ~5 min idle, content-hash skip),
   the free local name finder (tasker 165) re-reads it and updates its mentions.
3. **Orphans disappear:** an entry made only by a reader that loses its last mention and has no
   facts the user added → hidden (reversible).
4. **Corrections become merges:** when a re-read drops name A and adds a similar name B in the same
   place (same surrounding words), it's a spelling fix → A folds into B automatically if A was
   only reader-made; otherwise a "same person?" question.
5. **Spelling variants:** a new person name close to an existing inner-circle person (similar
   spelling + shared org/project) → "same person?" question, phrased by the identity check.
6. Ambitious option: visible tags. Names in a doc/task show as linked chips (hover = card), fix a
   tag by picking the right entry; tags are stored as positions, not written into the text.

## DJ's call (2026-11-18)

"I think we need direct references to places where entities are mentioned in a document or in a
task, so we know surgically where these entities are. We need to have a quick way to verify or
look up to see if those have changed or not. … Ideally, we should have some kind of highlighted
item on that person. If you delete it, then it knows that you delete that entity off of that
document, and it updates the knowledge stuff. I want to do this in a clean way."

Phil: don't merge by hand. "Let's use this as a test case for Phil Velayo." The new system has to
resolve Phil's five entries itself (or ask the right "same person?" questions), and we report
what it did.

## Design (decided 2026-11-18)

- `knowledge_mentions`: one row per place a name appears: owner, entity, record (task/document),
  field, start/end offsets, the exact text, ~32 chars before/after (quote + prefix/suffix
  anchoring, like web annotations), the record's content hash when anchored, made by reader or
  user, status. `knowledge_record_links` stays as the per-record summary the card shows.
- Quick change check on save: hash differs → re-anchor each mention (exact text at offsets → else
  search with prefix/suffix nearby). Same text → moved; prefix/suffix found but text between
  changed → the mention was edited (spelling fix / rename → identity check, fold or ask); nothing
  found → the mention was deleted (remove; orphan rule). New names only from changed text.
- Highlights in the doc and task editors as decorations (never written into the text); hover =
  card; "Not a person / remove tag" is remembered for that spot.

**DJ (2026-11-18, scope add):** "I want to update the knowledge graph, and I want to update the
visible names." → an explicit "Update the name in N places" action after a rename or fold (never a
silent rewrite), preview list, one Undo.

## 2026-11-18: BUILT (UNCOMMITTED)

### What DJ sees

- **Names are highlighted wherever they appear** in a doc (read view) and a task description
  (dotted accent underline, every place, not only the first). Hover (mouse, ~0.35 s) or keyboard
  focus → a small peek (name, what it is, summary line, "Click for more"); click → the full
  knowledge card. Names not in the graph yet keep the task card on their first mention.
- **While editing** (CodeMirror), tagged names are underlined too and the underline follows the
  name as you type around it (decorations only; the stored text is never touched).
- **Remove tag**: the card opened from a tag has a footer "Tagged here in this doc · Remove tag".
  Toast with Undo. Remembered at that spot: a re-read never re-tags it. When it was the entry's
  last tag in that record, the record drops off the entry's "In your work" (back on Undo).
- **Fix a spelling** ("Phil Valeo" → "Phillip Velayo"): ~5 min after you stop typing in a doc (a
  task: ~15–30 s, with its normal re-read) the tag follows the new words; the old entry folds into
  "Phillip Velayo" when a reader made it and you never added anything to it (the old spelling stays
  as an alias, so re-reading "Phil Valeo" anywhere files it under Phillip Velayo, never a new
  entry). If you had added details to it, or the new name only might be the same, you get "Is Phil
  Valeo the same person as Phillip Velayo?" in the duplicates review instead.
- **Replace a name with a different one** ("Phil Valeo" → "Rod Chamberlin"): old tag goes, Rod is
  tagged. **Replace it with ordinary words** ("a friend") or delete it: the tag goes; the
  reader-made link goes when no tag is left; an entry a reader made that is left with no link
  anywhere and nothing you added is hidden (`hidden_reason = 'orphan'`, reversible; it comes back
  by itself when the name shows up again).
- **Similar spellings** filed as separate people become one "same person?" question per variant,
  each asked against the group's fullest name, never repeated once answered.
- **"Update the name in N places"** on the knowledge card: a quiet line "Still written “Phil
  Velayo” in 3 places · Update to Phillip Velayo" → dialog with each place (Task/Doc · title, the
  sentence struck through → the new sentence), every place you can edit ticked. Apply replaces
  exactly those words through the normal task/doc saves (permissions, history and doc versions
  apply; a doc that changed meanwhile is skipped), the tags stay attached, toast "Updated the name
  in 3 places · Undo" (Undo writes the old words back the same way). One-word references
  ("Phil") are never offered.

### Phil test (dry run, free, prod read with the worker's service client, nothing written)

`cd apps/worker && pnpm exec tsx scripts/knowledge-mentions-backfill.ts --user-email <DJ> --names phil`

- 278 records linked (180 tasks, 98 docs) → 3,028 tags (old link quotes re-anchored against
  today's text + every place a linked name appears). 0 problems.
- **Doc `450087fd` "Pistol Shooting Client Website Context Document":** the old quote "…referred by
  **Phil Valeo** from thecadretraining.com…" re-anchors as an **edit in place** → "Phillip Velayo"
  (spelling, Jaro-Winkler valeo/velayo 0.89, phil/phillip prefix) → **FOLD** Phil Valeo into the
  existing Phillip Velayo (Phil Valeo was backfill-made, 1 link, no facts). The doc's tag points at
  Phillip Velayo, the link moves with the merge, alias "Phil Valeo" kept. The real doc job path
  (local name finder on the doc, dry) gives the same fold in 3.4 s.
- **"Same person?" questions** (one per variant, against the fullest name):
    - Is Phil Velayo the same person as Phillip Velayo? (spelling; both in the Radar project)
    - Is Phil Vallejo the same person as Phillip Velayo? (possible: vallejo/velayo; Phil Vallejo is
      inner circle with the same first name)
    - Is Phil the same person as Phillip Velayo? (one-word "Phil" shares projects only with this
      group of spellings)
- **Plain "Phil"** (20 links, 77 tags): stays its own entry; one question above. Never auto-merged,
  never offered for renaming (one-word).
- **If DJ answers "Same" to the Velayo/Vallejo questions**, "Update the name in 12 places" would
  offer: task "Follow up with Phil Velayo…" (title + description), task "Monday meeting with Logan
  (referral from Phil Velayo)" (title + description), task "Call the nearby armory back… Phil
  Vallejo" (title + description), task "Ship precision rifle to Phil Vallejo for build" (title),
  doc "Historical operating plan" (2: "**Phil Vallejo** (referral connector, warm)", "Rod + Phil
  Vallejo referrals"), doc "Radar — November 13" (3, two inside YouTube link titles). DJ unticks
  any he wants left alone.
- All 14 questions DJ's graph would get: the 3 above, Pat Svehla / Patrick (Pat) Svehla, and 10
  one-word names (Louis, Vinny, Griffin, Laura, Logan, Sam, Emily, Ian, Matt, Lauren → their full
  name in the same project). Steve Baker / Steven Bartlett was a false pair → rule tightened.
- No deletions, link removals or hides in DJ's current data (every old link's name is still in its
  record's text).

### Pieces

| Piece                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Where                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Migration `20261118200000_knowledge_mentions.sql`: `knowledge_mentions` (owner, entity, record task/document, field title/description/content, offsets, text, prefix/suffix ≤64, content hash, made_by reader/user, status active/removed; RLS owner-only; indexes record, entity, record-any-owner), `knowledge_mention_reads` (hash + reader version per owner/record; signed-in read-only), `knowledge_entities.hidden_reason` ('orphan'), trigger: a merge repoints mentions to the survivor, queue type `knowledge_doc_mentions` | `supabase/migrations/`                                                                         |
| Anchoring + name similarity + record plan (pure): `findNameSpans`, `anchorAt`, `anchorFromQuote`, `reanchorMentions` (same → moved by context → edited between prefix/suffix → deleted; joint claiming, markdown-tolerant folded context), `nameRelation` (same/spelling/possible/short), `planRecordMentions`, `applyMentionRenames`, `sentenceAround`, `offersRename`                                                                                                                                                               | `packages/shared-agent-ops/src/knowledge/mentions.ts`                                          |
| DB sync: `syncRecordMentions` (re-anchor, corrections fold/ask, replace the record's tags, links add/remove, orphan hide, similar-name questions, dry run), `askSimilarNames`, `reviveOrphanEntries`, `setMentionTagStatus`                                                                                                                                                                                                                                                                                                           | `.../knowledge/mention-sync.ts`                                                                |
| Store: a name folded into another resolves to the survivor (no re-created "Phil Valeo"); un/hiding clears `hidden_reason`                                                                                                                                                                                                                                                                                                                                                                                                             | `.../knowledge/knowledge-store.ts`                                                             |
| Tasks: after each read the task's tags follow the text (also on an empty read, so a deleted name loses tag + reader link). No extra model calls.                                                                                                                                                                                                                                                                                                                                                                                      | `apps/worker/src/workers/knowledge/taskEntityKnowledgeSync.ts`, `extractTaskEntitiesWorker.ts` |
| Docs: `knowledge_doc_mentions` job, queued after each doc embedding job, 5 min out, dedup per doc + content hash (a newer save supersedes it), hash + reader-version skip, local name finder for the creator, re-anchor for every other user with tags; kill switch `KNOWLEDGE_DOC_MENTIONS=off`                                                                                                                                                                                                                                      | `apps/worker/src/workers/knowledge/documentMentionsWorker.ts`, `src/worker.ts`                 |
| Backfill (dry default)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `apps/worker/scripts/knowledge-mentions-backfill.ts`                                           |
| Web API: `GET /api/knowledge/mentions` (+tasks, +tags), `PATCH /api/knowledge/mentions/:id` (remove/undo), `GET /api/knowledge/entities/:id/name-updates`, `POST /api/knowledge/name-updates`                                                                                                                                                                                                                                                                                                                                         | `apps/web/src/routes/api/knowledge/…`, `$lib/server/knowledge/name-updates.server.ts`          |
| Web UI: tag mode + hover/focus peek in `entityMentions` (tags re-found in the page by words + context), `RecordKnowledgeMentions` (tags, peek, removeTag + Undo, re-check after task edits), `RecordKnowledgePopover` footer, `KnowledgeMentionPeek`, `KnowledgeNameUpdates` on the card, CodeMirror `mention-highlights`                                                                                                                                                                                                             | `apps/web/src/lib/components/…`                                                                |

### Commands and cost (all free: no model or search calls; questions are phrased from a template)

- Apply: `pnpm db:rehearse supabase/migrations/20261118200000_knowledge_mentions.sql --check supabase/tests/knowledge_graph.check.sql --refresh --role-probe`
  → PASSED (knowledge_graph check incl. new mention assertions, archived scope, fold coverage,
  write-lock, account purge; role probe unchanged). 1 DATA note: the hidden_reason CHECK validates
  577 rows, all NULL (new column) → safe. Then `supabase db query --linked -f …` +
  `supabase migration repair --status applied 20261118200000 --linked`.
- Deploy order: migration → worker (registers `knowledge_doc_mentions`; queue rows before the deploy
  would wait unclaimed) → web. Before the migration the task sync logs a warning and keeps working.
- Live backfill (after the migration): `cd apps/worker && KNOWLEDGE_MENTIONS_LIVE=1 pnpm exec tsx
scripts/knowledge-mentions-backfill.ts --user-email <DJ> --live` (writes ~3k tag rows, 1 fold,
  14 questions; free).

### Tests

shared knowledge 100 (mentions 22 incl. Phil anchoring/markdown/quote seeds/one-word case,
mention-sync 7 incl. dry vs live Phil fold, ask when invested, delete → orphan hide, user links
kept, task re-read link removal, similar-name groups asked once, ambiguous one-word skipped,
re-read of a folded name), worker 20 (doc job enqueue/debounce/supersede + task entities + doc
plan), web 9 (tag placement in rendered text, name-update list/apply/skip/Undo). Worker typecheck +
test types clean, web check 0/0, eslint clean on changed files, Svelte autofixer: no new issues.
Not browser-verified (needs the migration + a deploy or local dev against prod with the tables).

### Decisions for DJ (veto-able)

1. **One-word names get "same person?" questions** when every full name they could be shares a
   project with them (10 in your graph: Logan → Logan Valcarce, Matt → Matt Solowynsky…). Veto =
   full names only (4 questions).
2. **"Possible" spellings** (Phil Vallejo / Phil Velayo) are asked when they share a project or an
   org, or one is someone you know with the same first name. Folding is only ever automatic for a
   corrected spelling of an entry no one but a reader made.
3. **Doc re-reads run for everyone** (free, ~0.1–1 s CPU per doc, the name finder adds ~150 MB to
   the general worker once it first reads a doc). Kill switch `KNOWLEDGE_DOC_MENTIONS=off`.
4. **Hover peek, click card**: the full card has buttons and a backdrop, so hover shows a small
   preview and click opens the card (no focus stealing while you read).

### Landmines / notes

- Data noise the tags make visible: one-word org entries like "Pistol" (doc reader, 165) get tagged
  where written with a capital ("Pistol"); lowercase "pistol" never is. Hide the entry to stop it.
- Task title tags aren't highlighted (title renders as plain text; first-mention task cards stay).
- A doc's tags lag edits by ~5 min (debounce); the editor underline follows live.

## 2026-11-18: APPLIED + live tagging pass for DJ

- Migration `20261118200000_knowledge_mentions` APPLIED (prod dry run with ROLLBACK, apply, repair).
- Live backfill (free): 278 records (180 tasks, 98 docs), 3,028 tags, 1 correction → Phil Valeo
  folded into Phillip Velayo, 0 deletions / link removals / hides, 0 problems. 14 new "same person?"
  questions (18 pending in total with the 4 earlier org duplicates).
- Rename preview for Phillip Velayo (after DJ answers "Same") lists 12 places; 3 of them are inside
  YouTube link titles in the Nov 13 Radar (someone else's video title): those should be unticked by
  default. Follow-up: don't offer renames inside link text / quoted external titles.
- Code UNCOMMITTED; highlights + edit tracking need web + worker deploy.

## 2026-11-18: post-deploy check (f03d04d2f)

- Live and working: /knowledge filters + sort + checkboxes + "Enrich N" dialog (presets incl.
  Education and Phone & email, re-research warning, "$0.00 of $5.00 used"), research tray, 18
  questions in the duplicates review with their wording, highlights + hover preview in docs and
  task descriptions, Phillip Velayo card "Also known as Phil Valeo". Workers registered
  knowledge_doc_mentions + knowledge_enrich; DJ's 9:32 Cody research ran on the new code
  ($0.0023, sourced from codyshootingcomplex.org).
- BUG found + fixed (UNCOMMITTED): `syncRecordMentions` deleted a record's tags before inserting
  the new ones; a failed insert left the record with none (seen once on the Pistol doc during a
  --record re-run: 7 → 0; re-run restored 8). Now insert first, delete old by id after, roll back a
  partial insert. Regression test added (mention-sync.test.ts). Needs worker + web deploy.
- Second "Phillip Velayo" in the Pistol doc wasn't tagged by the bulk pass; a re-read tags it (8 now).
- Hid orphan place "Barry, Vale of Glamorgan" (left from the retracted UK LA Industrial facts).
- Not verified: phone layout (Chrome resize is a no-op here).

## 2026-11-21: duplicate entries from the doc re-reader — FIXED (UNCOMMITTED)

- Symptom (DJ screenshot): Craig, John, Lola, Tom ×6 and Lucinda ×4 on /knowledge, all from the
  "Pitch Desk — who to contact & what to say" doc; 41 possible duplicates.
- Cause: the document re-read job (`documentMentionsWorker`, via 'system') files names through
  `KnowledgeStore.record`, whose one-word person rule reused an existing entry only for via
  task/backfill. Each edit of the doc → a new "Craig". Once 2+ existed, no via could reuse them, so
  copies compounded. Another user has 20 and 15 copies of two people.
- Fix (`knowledge-store.ts`): via 'system' counts as the user's own notes; and the user's own
  notes naming someone with several same-name entries file under the oldest instead of creating
  another. Two regression tests. Needs worker deploy.
- DJ's data cleaned: the 'system' copies merged into the original entries (Craig/John/Lola/Tom 5
  each, Lucinda 3). Pending questions 41 → 20. Other user's copies NOT touched (merges are final;
  needs DJ's OK).

## 2026-11-21: merge by hand (DJ picked the ambitious version) — BUILT (UNCOMMITTED)

- Tick 2+ rows → "Merge N" in the bottom bar; "Merge…" on an entry's own card (search for the
  other one); the duplicates review gains a "Same name" section (exact kind + name, e.g. "Craig" ×3)
  with one-click merge, Review, and "Different people" (answers every pair so it never returns).
- `KnowledgeMergeDialog.svelte`: each entry's tasks & docs / highlights / details, added date and
  source; suggested keep = shared entry, else most attached, then oldest; untick "Same" per row;
  states it can't be undone (the merge RPC drops duplicate details).
- Store: `mergePreview`, `mergeMany` (≤25), `listNameTwins`, `markDifferent`; API
  `/api/knowledge/merge` GET ?ids=, POST merge[], PATCH entity_ids. No migration. 7 new tests.
- Verified: svelte-check 0 errors, 125 knowledge tests, local browser (opened the dialog from the
  list and the card, untick, add-another search; did NOT click Merge on real data).
