<!-- apps/web/src/lib/tests/onto/writer/03-documents-and-recall.md -->

# 03 — Documents & Recall

**Entry context**: `project` (`entity_id = {{PROJECT_ID}}`).

This is the suite's most important behavior: the author fills in project canon, and the agent
**later answers questions by reading those documents** rather than from chat memory or invention.
It exercises the retrieval chain `search_project → get_document_outline → read_document_section`.

`01` created two **empty stub** documents — `{{DOC_PROTAGONIST}}` ("Character Profile —
Protagonist") and `{{DOC_MAGIC}}` ("Magic System"). Section A fills those stubs with canon the
author dictates here (the first time the protagonist gets a name). Section B then recalls it.

---

## A. Creating / filling documents

### 3.1 — Establish the protagonist (fill the stub, don't duplicate)

The author names the protagonist for the first time.

**User input**

```text
The protagonist's name is Elena. She's an orphan the village blacksmith took in and trained, so she grew up at the forge. Put that in her character profile.
```

**Expected tool calls**

```jsonc
search_project({ project_id: "{{PROJECT_ID}}", query: "protagonist character profile", types: ["document"] })
// → finds the existing stub {{DOC_PROTAGONIST}}
update_onto_document({
  document_id: "{{DOC_PROTAGONIST}}",
  title: "Character Profile — Elena (Protagonist)",
  content: "## Name\nElena.\n\n## Background\nAn orphan the village blacksmith took in and trained. She grew up at the forge, which is how she became a young blacksmith."
})
```

**✅ Pass**

- **Updates the existing stub** and retitles it to include "Elena" — does not create a second
  character document.
- Content captures only what the author said (name + orphan-raised-by-the-village-blacksmith). This
  is consistent with the `01` premise (she _is_ a young blacksmith — because the smith raised and
  trained her).

**❌ Fail**

- Creates a brand-new "Elena" doc and leaves the orphaned `{{DOC_PROTAGONIST}}` stub behind for
  future searches to trip over.
- Pads the profile with invented biography (parents, hometown, love interest) the author never gave.

---

### 3.2 — Establish the magic system (fill the stub)

**User input**

```text
Fill in the magic system. It's called living steel. Rules: only smiths born under a blood moon can forge it; every forging costs the smith a memory; the more powerful the weapon, the older the memory burned away; and living steel can't be unmade once it's quenched.
```

**Expected tool calls**

```jsonc
search_project({ project_id: "{{PROJECT_ID}}", query: "magic system", types: ["document"] })
// → existing stub {{DOC_MAGIC}}
update_onto_document({
  document_id: "{{DOC_MAGIC}}",
  title: "Magic System — Living Steel",
  content: "## Who can forge\nOnly smiths born under a blood moon can forge living steel.\n\n## The cost\nEvery forging costs the smith a memory. The more powerful the weapon, the older the memory burned away.\n\n## Irreversibility\nLiving steel cannot be unmade once it is quenched."
})
```

**✅ Pass**

- Fills the existing `{{DOC_MAGIC}}` stub; `content` actually contains the four rules the author
  gave, under scannable headings (so later recall can target one section).
- Does **not** create a second magic document.

**❌ Fail**

- Leaves `content` empty / "TODO", losing the rules the author just dictated.
- Creates a parallel "Magic System v2" doc instead of filling the stub.

---

### 3.3 — Create a genuinely new document, placed in the tree

The kingdom has no doc yet (`01` only stubbed the character and magic docs).

**User input**

```text
Start a worldbuilding doc for the kingdom — it's called Emberhold, ruled by a dying king, and its forge-temples are slowly losing their fire. Put it next to the magic system doc.
```

**Expected tool calls**

```jsonc
create_onto_document({
  project_id: "{{PROJECT_ID}}",
  title: "Kingdom — Emberhold",
  description: "The setting: a kingdom whose forge-temples are losing their fire under a dying king.",
  type_key: "document.knowledge.worldbuilding",
  content: "## Emberhold\nRuled by a dying king. Its forge-temples are slowly losing their fire.",
  parent_id: "[same parent as {{DOC_MAGIC}}]"   // or move_document_in_tree afterward
})
```

**✅ Pass** — a real new document (this is the suite's clean "create" case), `content` populated
from what the author said, nested beside the magic doc via `parent_id` (or `move_document_in_tree`).
The kingdom name "Emberhold" is allowed here because the **author** supplied it.
**❌ Fail** — creates an unrelated top-level doc ignoring the requested placement, or invents extra
kingdom lore.

---

## B. Recall — answer FROM the document (the key tests)

> **Ground truth, and where it comes from** (all author-supplied, never agent-invented):
> the premise (a young female blacksmith, magical weapon forging) is from the `01` create prompt;
> the protagonist's name **Elena** and her orphan/raised-at-the-forge backstory are from **3.1**;
> the magic system **living steel** and its **memory cost** are from **3.2**; the kingdom
> **Emberhold** is from **3.3**. The recall tests check the agent retrieves these rather than
> inventing or misremembering them.

### 3.4 — Question whose answer lives in a doc

**User input**

```text
Remind me — what's the cost of forging in my magic system?
```

**Expected tool calls (the chain)**

```jsonc
search_project({ project_id: "{{PROJECT_ID}}", query: "magic system forging cost", types: ["document"] })
// → Magic System — Living Steel
get_document_outline({ document_id: "{{DOC_MAGIC}}" })          // sees "The cost" heading
read_document_section({ document_id: "{{DOC_MAGIC}}", anchor: "the-cost" })
```

**✅ Pass**

- Agent **calls a read tool** before answering — it does not answer purely from the earlier chat
  turn / conversational memory.
- The answer states the cost is **a memory per forging**, scaling with the weapon's power, and
  **references the document** ("from your _Magic System — Living Steel_ doc…").
- Uses `get_document_outline` + `read_document_section` rather than dumping the entire body when the
  doc has more than a couple of sections.

**❌ Fail (any of these)**

- Answers from memory with no read-tool call.
- **Hallucinates** a different cost ("forging drains your life force") not in the doc.
- Reads the doc but answers with something the doc doesn't say.

---

### 3.5 — Recall across a different doc (character)

**User input**

```text
Who raised Elena, again?
```

**Expected tool calls**

```jsonc
search_project({ project_id: "{{PROJECT_ID}}", query: "Elena raised guardian background", types: ["document"] })
// → Character Profile — Elena
get_onto_document_details({ document_id: "{{DOC_PROTAGONIST}}" })   // short doc → full read is fine
```

**✅ Pass** — reads Elena's profile and answers "**the village blacksmith** (he took her in as an
orphan and trained her)," grounded in the 3.1 content. For a short profile,
`get_onto_document_details` (full read) is acceptable instead of outline+section.

**❌ Fail** — confidently answers "her parents" / "the king" — i.e. invents a guardian the doc
contradicts — or answers without reading the profile at all.

---

### 3.6 — Honest "not in the doc" (negative grounding)

**User input**

```text
What's Elena's favorite food, per her profile?
```

**Precondition**: Elena's profile (from 3.1) says nothing about food.

**✅ Pass** — agent reads the profile, finds nothing, and **says so**: "Your profile doesn't cover
that — want me to add it?" It may _offer_ a suggestion but clearly labels it as a new invention,
not recall.

**❌ Fail** — fabricates "She loves honey cakes" and presents it as if it were already in the
profile.

---

### 3.7 — Update a doc from new information

**User input**

```text
Actually, change the forging cost: it costs a memory and a year of the smith's life.
```

**Expected tool calls**

```jsonc
get_onto_document_details({ document_id: "{{DOC_MAGIC}}" })   // load current content
update_onto_document({
  document_id: "{{DOC_MAGIC}}",
  content: "## Who can forge\n...unchanged...\n\n## The cost\nEvery forging costs the smith a memory AND a year of their life. The more powerful the weapon, the older the memory burned away.\n\n## Irreversibility\n...unchanged..."
})
```

**✅ Pass** — loads current content first, edits **only** the cost section to add the new clause,
preserves "Who can forge" and "Irreversibility". After this, a 3.4-style recall returns the updated
rule.

**❌ Fail** — overwrites the whole doc with just the one new sentence, deleting the other rules; or
spins up a brand-new "Magic System v2" doc and leaves the stale one to be found by future searches.

---

### 3.8 — Large-doc selective read (efficiency)

**Precondition**: `{{DOC_OVERVIEW}}` has grown long, with headings like "Premise", "Characters",
"Themes", "Setting".

**User input**

```text
What did I write down for the themes of the book?
```

**✅ Pass** — `get_document_outline` → `read_document_section(anchor: "themes")`. Reads **only** the
Themes section.
**❌ Fail** — `get_onto_document_details` to pull the entire overview into context just to quote one
section (wasteful), or quotes Premise text and calls it themes.

---

## Why these are good tests

The recall cases (3.4–3.8) catch the failure that matters most in a writing tool: the agent
**confidently making up canon** — a name, a rule, a guardian — that the author either never set or
explicitly changed. Every passing case requires a real read-tool call _and_ an answer faithful to
what was read; every failure mode is a distinct, observable wrong behavior (no read / wrong read /
hallucinated detail / destructive overwrite / duplicate doc).
