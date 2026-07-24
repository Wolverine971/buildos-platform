# Queue Editing — how to keep `queue.json` honest

The user never hand-edits `queue.json`. You patch it, then re-run the engine so the new picture is immediately visible. The queue drifting from reality is the one failure mode that breaks the whole pipeline.

File: `docs/marketing/ops/queue.json`. Schema is documented in `docs/marketing/ops/README.md`.

## The rule

**Every real-world action → an immediate queue patch → re-run the engine.**

After editing, always run:

```bash
node scripts/marketing/ops/status.mjs --today=<today>
```

and show the delta ("that cleared 5 overdue → now 16").

## Common edits

**Mark a deliverable posted** (`/marketing done T35 linkedin-post <url>`):
- Find item `T35` → deliverable `linkedin-post` → set `status: "posted"`, `posted_at: "<today>"`, `url: "<url>"`.

**Mark a deliverable drafted** (a publish kit was just built):
- Set each drafted lane's `status: "drafted"`.

**Mark a blog published** (`/marketing done T37 blog`):
- Set item `status: "published"`, `published_at: "<today>"`, fill `path` + `slug`. Add its 5 deliverables at `status: "pending"` so the 48h extraction clock starts.

**Attach a resolved asset** (stage ②):
- On the deliverable, push the file path into `assets: [...]`. Once `assets` is non-empty the asset-gap finding clears.

**Add a new idea** (`/marketing add "<title>"`):
- Append an item: `{ id, track, type:"blog", title, status:"idea", rank:<next>, published_at:null }`. Pick an `id` (T## for anti-feed) and a `rank` (see backlog-synthesis for re-ranking).

**Record metrics** (stage ④):
- Push into the item's `metrics: [{ platform, posted_at, impressions, engagements, note }]`.

## Editing mechanics

- Prefer the `Edit` tool for surgical single-field changes; only rewrite the whole file when restructuring many items.
- Keep valid JSON (no trailing commas — this repo's Prettier bans them anyway). If unsure, after editing run the engine; a JSON error surfaces immediately as `status.mjs error`.
- Preserve the `_comment` field and the `note` fields — they carry context the engine ignores but humans need.
- Statuses are a strict lifecycle: item `idea → drafted → scheduled → published`; deliverable `pending → drafted → scheduled → posted` (or `skipped`). Never skip backwards without saying why.
