# docs/marketing/social-media/reddit/tools/fetch-sub.sh
#!/usr/bin/env bash
# Fetch Reddit data for a subreddit via the public JSON API with rate-limit-aware
# pacing and retry. Skips files that already exist and are non-empty so re-runs resume cleanly.
#
# Usage:
#   fetch-sub.sh <sub-name> [search_query1] [search_query2] ...
#
# Outputs:
#   /tmp/reddit-research/raw/<sub>-*.json  (raw endpoint responses)
#   /tmp/reddit-research/summary/<sub>.md  (synthesis-ready summary)
#
# Used by:
#   .claude/commands/reddit-warmup.md  (Stage 1 daily engagement flow)

set -euo pipefail

SUB="${1:?sub name required}"; shift || true
RAW="/tmp/reddit-research/raw"
SUMMARY="/tmp/reddit-research/summary"
mkdir -p "$RAW" "$SUMMARY"

UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
BASE="https://www.reddit.com/r/$SUB"

# Reddit anon rate limit is ~10 req/min. 7s pacing keeps us under it.
PACE=7

fetch() {
    local path="$1" out="$2"
    local target="$RAW/${SUB}-${out}.json"
    if [ -s "$target" ]; then
        echo "  skip (cached): $out"
        return 0
    fi
    local attempt=0 max=5 wait=$PACE code="000"
    while [ $attempt -lt $max ]; do
        attempt=$((attempt+1))
        code=$(curl -sS -A "$UA" -o "$target" -w "%{http_code}" "$BASE/$path" || echo "000")
        if [ "$code" = "200" ]; then
            echo "  ok [$code]: $out"
            sleep $PACE
            return 0
        fi
        echo "  retry $attempt [$code]: $out (wait ${wait}s)" >&2
        rm -f "$target"
        sleep $wait
        wait=$((wait*2))
    done
    echo "  FAILED after $max tries [$code]: $out" >&2
    return 1
}

echo "Fetching r/$SUB ..."

fetch "about.json"                      "about"
fetch "about/rules.json"                "rules"
fetch "top.json?t=week&limit=25"        "top-week"
fetch "top.json?t=month&limit=25"       "top-month"
fetch "new.json?limit=100"              "new"
fetch "hot.json?limit=25"               "hot"

# Per-sub search queries — the command passes the thread-type patterns
# from each sub's profile file.
if [ $# -eq 0 ]; then
    set -- "what tool" "recommend" "alternative"
fi
i=0
for q in "$@"; do
    i=$((i+1))
    target="$RAW/${SUB}-search-${i}.json"
    enc=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$q")
    echo "$q" > "$RAW/${SUB}-search-${i}.query"
    if [ -s "$target" ]; then
        echo "  skip (cached): search-${i}"
        continue
    fi
    attempt=0; max=5; wait=$PACE; code="000"
    while [ $attempt -lt $max ]; do
        attempt=$((attempt+1))
        code=$(curl -sS -A "$UA" -o "$target" -w "%{http_code}" "$BASE/search.json?q=%22$enc%22&restrict_sr=1&t=month&sort=relevance&limit=10" || echo "000")
        if [ "$code" = "200" ]; then
            echo "  ok [$code]: search-${i} ($q)"
            sleep $PACE
            break
        fi
        echo "  retry $attempt [$code]: search-${i} (wait ${wait}s)" >&2
        rm -f "$target"
        sleep $wait
        wait=$((wait*2))
    done
done

# Build a synthesis-ready summary the agent can read and use for scoring.
python3 - "$SUB" "$RAW" "$SUMMARY" <<'PY'
import json, os, sys, glob, re

sub, raw_dir, summary_dir = sys.argv[1], sys.argv[2], sys.argv[3]

def j(name):
    p = f"{raw_dir}/{sub}-{name}.json"
    if not os.path.exists(p) or os.path.getsize(p) == 0: return None
    try:
        return json.load(open(p))
    except json.JSONDecodeError:
        return None

out = []
out.append(f"# r/{sub} — data summary")
out.append("")

a = j("about")
if a and 'data' in a:
    d = a['data']
    out.append("## About")
    out.append(f"- subscribers: {d.get('subscribers')}")
    out.append(f"- active_user_count: {d.get('active_user_count')}")
    out.append(f"- created_utc: {d.get('created_utc')}")
    out.append(f"- over18: {d.get('over18')}")
    out.append(f"- subreddit_type: {d.get('subreddit_type')}")
    out.append(f"- lang: {d.get('lang')}")
    out.append(f"- submission_type: {d.get('submission_type')}")
    out.append(f"- public_description: {(d.get('public_description') or '').strip()}")
    out.append(f"- title: {(d.get('title') or '').strip()}")
    st = (d.get('submit_text') or '').strip()
    if st:
        out.append(f"\n### submit_text (posting guidance)\n\n```\n{st[:2500]}\n```\n")
    desc = (d.get('description') or '').strip()
    if desc:
        out.append(f"\n### description (sidebar)\n\n```\n{desc[:3500]}\n```\n")

r = j("rules")
if r and 'rules' in r:
    out.append("## Rules (verbatim)")
    for i, rule in enumerate(r['rules'], 1):
        sn = rule.get('short_name','')
        desc = (rule.get('description') or '').strip()
        kind = rule.get('kind','')
        out.append(f"\n**{i}. [{kind}] {sn}**")
        if desc: out.append(f"\n> {desc}")
    out.append("")

def post_row(p):
    d = p['data']
    t = d.get('title','')[:140]
    return (f"- ↑{d.get('score'):>5} 💬{d.get('num_comments'):>4} | {t} | "
            f"https://www.reddit.com/r/{sub}/comments/{d.get('id')}/")

def list_posts(name, heading, limit=15):
    data = j(name)
    if not data or 'data' not in data: return
    out.append(f"\n## {heading}")
    posts = data['data'].get('children', [])[:limit]
    for p in posts:
        out.append(post_row(p))

list_posts("top-week",  "Top posts — past week (top 15)", 15)
list_posts("top-month", "Top posts — past month (top 15)", 15)
list_posts("hot",       "Hot posts (top 15)", 15)

nw = j("new")
if nw and 'data' in nw:
    posts = [p['data'] for p in nw['data'].get('children', [])]
    removed = 0
    for p in posts:
        if p.get('removed_by_category') or p.get('removed_by') or (p.get('selftext') in ['[removed]','[deleted]']):
            removed += 1
    out.append(f"\n## Moderation signal (latest {len(posts)} new posts)")
    out.append(f"- removed_count_visible_in_api: {removed}")
    out.append("  (Reddit JSON API often hides removed posts entirely; absence ≠ no removals.)")

for f in sorted(glob.glob(f"{raw_dir}/{sub}-search-*.query")):
    idx = re.search(r"search-(\d+)\.query", f).group(1)
    q = open(f).read().strip()
    data = j(f"search-{idx}")
    if not data or 'data' not in data: continue
    out.append(f"\n## Search: \"{q}\" (past month, top 10 by relevance)")
    posts = data['data'].get('children', [])[:10]
    if not posts:
        out.append("- (no results)")
    for p in posts:
        out.append(post_row(p))

open(f"{summary_dir}/{sub}.md","w").write("\n".join(out))
print(f"Wrote {summary_dir}/{sub}.md ({len(''.join(out))} chars)")
PY
