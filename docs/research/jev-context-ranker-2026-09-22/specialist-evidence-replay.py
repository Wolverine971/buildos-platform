# docs/research/jev-context-ranker-2026-09-22/specialist-evidence-replay.py
"""Free replay: would the research specialist's single read batch contain the answer?

Budget is the specialist's real one: 4 documents x 6,000 characters, one batch.
Arms:
  today_oracle  - 20 most recent doc titles; model picks the must docs perfectly (upper bound);
                  reads the FIRST 6,000 chars of each (what the SQL read does today).
  jev_docs      - Jev's top-4 documents; reads the first 6,000 chars of each.
  jev_sections  - Jev's top-4 documents; fills each 6,000-char slot with its best-scoring
                  sections (skip-not-stop), falling back to the opening.
Uses cached Jev scores (twostage runs, 3 reps) from the 2026-09-22 eval. No network calls.
"""
import json, re, sys
from datetime import datetime

EVAL = sys.argv[1]
LABELS = sys.argv[2]
MAX_DOCS, PER_DOC = 4, 6000
MAX_PACKET_HEADINGS = 40


def clip(s, n):
    t = re.sub(r"\s+", " ", str(s or "")).strip()
    return t if len(t) <= n else t[: n - 1] + "…"


def parse_sections(md):
    lines = (md or "").split("\n")
    heads, fenced = [], False
    for i, line in enumerate(lines):
        if re.match(r"^\s*```", line):
            fenced = not fenced
        if fenced:
            continue
        m = re.match(r"^(#{1,3})\s+(.+?)\s*#*\s*$", line)
        if m:
            heads.append((i, len(m.group(1)), m.group(2)))
    offsets, pos = [], 0
    for line in lines:
        offsets.append(pos)
        pos += len(line) + 1
    out = []
    for k, (i, lvl, h) in enumerate(heads):
        end = len(lines)
        for j in range(k + 1, len(heads)):
            if heads[j][1] <= lvl:
                end = heads[j][0]
                break
        body = "\n".join(lines[i:end])
        out.append({"heading": h, "level": lvl, "start": offsets[i], "body": body})
    return out


def packet_headings(doc, sections):
    pool = [s for i, s in enumerate(sections)
            if not (i == 0 and s["level"] == 1 and clip(s["heading"], 200) == clip(doc["title"], 200))]
    if len(pool) <= MAX_PACKET_HEADINGS:
        return pool
    keep = [s for s in pool if s["level"] <= 2][:MAX_PACKET_HEADINGS]
    ids = {id(s) for s in keep}
    for s in pool:
        if len(ids) >= MAX_PACKET_HEADINGS:
            break
        ids.add(id(s))
    return [s for s in pool if id(s) in ids]


def ts(v):
    if not v:
        return 0
    m = re.match(r"^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d+))?(.*)$", str(v).replace("Z", "+00:00"))
    frac = (m.group(2) or "0")[:6].ljust(6, "0")
    return datetime.fromisoformat(f"{m.group(1)}.{frac}{m.group(3) or '+00:00'}").timestamp()


def linked(project):
    ids = set()
    def walk(nodes):
        for n in nodes or []:
            if isinstance(n, dict) and n.get("id"):
                ids.add(str(n["id"]))
                walk(n.get("children"))
    walk(((project or {}).get("doc_structure") or {}).get("root"))
    return ids


def load_dump(path):
    data = json.load(open(path))["rows"][0]["data"]
    return json.loads(data) if isinstance(data, str) else data


labels = json.load(open(LABELS))
dumps = {key: load_dump(f"{EVAL}/raw-{pid}.json") for key, pid in labels["projects"].items()}


def must_docs(sc, docs):
    return [d for d in docs if any(d["id"].startswith(p) for p in sc["must"])]


def covered_sections(sc, reads):
    """reads: {doc_id: [(start, end)] char ranges read}. A labeled section counts when its
    heading and at least 1,000 chars (or all) of its body fall inside what was read."""
    hit = 0
    for ms in sc["mustSections"]:
        for doc_id, ranges in reads.items():
            if not doc_id.startswith(ms["doc"]):
                continue
            for s in ranges["sections"]:
                if ms["heading"] not in s["heading"]:
                    continue
                need = min(len(s["body"]), 1000)
                got = sum(max(0, min(e, s["start"] + need) - max(b, s["start"])) for b, e in ranges["spans"])
                if got >= need:
                    hit += 1
                    break
    return hit


def read_opening(doc):
    return {"spans": [(0, PER_DOC)], "sections": parse_sections(doc.get("content") or "")}


def read_best_sections(doc, ref, answers):
    sections = parse_sections(doc.get("content") or "")
    heads = packet_headings(doc, sections)
    scored = sorted(((answers.get(f"h_{ref}_{j}", -1), s) for j, s in enumerate(heads)),
                    key=lambda x: -x[0])
    spans, used = [], 0
    for p, s in scored:
        if p < 0.25:
            break
        size = len(s["body"])
        if used + size > PER_DOC:
            continue  # skip, don't stop
        spans.append((s["start"], s["start"] + size))
        used += size
    if not spans:
        return read_opening(doc)
    return {"spans": spans, "sections": sections}


rows = []
for sc in labels["scenarios"]:
    if sc.get("control"):
        continue
    dump = dumps[sc["project"]]
    docs = dump["documents"]
    ref_of = {d["id"]: f"d{i}" for i, d in enumerate(docs)}
    mdocs = must_docs(sc, docs)
    lk = linked(dump["project"])
    inventory = sorted(docs, key=lambda d: (int(d["id"] in lk), -max(ts(d.get("updated_at")), ts(d.get("created_at")))))[:20]
    inv_ids = {d["id"] for d in inventory}
    today_pick = [d for d in mdocs if d["id"] in inv_ids][:MAX_DOCS]
    today = {d["id"]: read_opening(d) for d in today_pick}
    per_rep = []
    for rep in range(3):
        run = json.load(open(f"{EVAL}/out2/cache/{sc['key']}.twostage.{rep}.json"))
        a = run["answers"]
        top = sorted(docs, key=lambda d: -a.get(f"e_{ref_of[d['id']]}", 0))[:MAX_DOCS]
        jd = {d["id"]: read_opening(d) for d in top}
        js = {d["id"]: read_best_sections(d, ref_of[d["id"]], a) for d in top}
        per_rep.append((
            sum(d["id"] in jd for d in mdocs),
            covered_sections(sc, jd),
            covered_sections(sc, js),
        ))
    mean = lambda i: sum(r[i] for r in per_rep) / len(per_rep)
    doc_chars = {d["id"]: len(d.get("content") or "") for d in mdocs}
    rows.append({
        "scenario": sc["key"],
        "question": sc["message"],
        "mustDocs": len(mdocs),
        "mustDocChars": sum(doc_chars.values()),
        "mustDocsBeyond6k": sum(1 for v in doc_chars.values() if v > PER_DOC),
        "todayDocsReachable": len(today_pick),
        "jevDocsPicked": mean(0),
        "mustSections": len(sc["mustSections"]),
        "todaySections": covered_sections(sc, today),
        "jevDocsSections": mean(1),
        "jevSectionsSections": mean(2),
    })

print(json.dumps(rows, indent=1))
