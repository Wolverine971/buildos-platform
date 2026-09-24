# scripts/agentic/gate-pass-timeline.py
# Per-pass timeline of gate turns (tasker 101): when each model pass started, how long it ran, and
# the time between passes (tool execution, reviews, persistence).
# Usage, from a gate output dir: python3 <repo>/scripts/agentic/gate-pass-timeline.py cedar-02-task-batch 1-1 2-1 3-1
import json,sys,re
from datetime import datetime
def ts(s):
    s=s.replace('Z','+00:00')
    m=re.match(r'(.*T\d\d:\d\d:\d\d)(\.\d+)?(.*)',s)
    frac=(m.group(2) or '.0')[1:]
    frac=(frac+'000000')[:6]
    return datetime.fromisoformat(f"{m.group(1)}.{frac}{m.group(3)}")
case=sys.argv[1]; reps=sys.argv[2:] or ['1','2','3']
for rep in reps:
    d=json.load(open(f'turns/{case}-{rep}.json'))
    r=d['result']; tm=r.get('timing') or {}
    passes=sorted(d['modelPasses'], key=lambda p:p['request_started_at'])
    rs=ts(tm['requestStartedAt']) if tm.get('requestStartedAt') else ts(passes[0]['request_started_at'])
    print(f"\n=== {case}-{rep}: total {tm.get('totalDurationMs',0)/1000:.1f}s ttft {(tm.get('ttftMs') or 0)/1000:.1f}s finished={r.get('finishedReason')} calls={len(r.get('toolCalls',[]))}")
    prev_end=rs
    for p in passes:
        s=ts(p['request_started_at']); e=ts(p['request_completed_at']) if p.get('request_completed_at') else s
        md=p.get('metadata') or {}
        role=md.get('passRole') or '?'
        print(f"  start +{(s-rs).total_seconds():5.1f}s  (idle {max(0,(s-prev_end).total_seconds()):4.1f}s)  {role:16s} {str(p.get('model_used'))[:28]:28s} {str(p.get('provider'))[:12]:12s} {(e-s).total_seconds():5.1f}s  in={p.get('prompt_tokens')} out={p.get('completion_tokens')} reas={p.get('reasoning_tokens')}")
        prev_end=max(prev_end,e)
    print(f"  end-of-last-pass → terminal: {(rs.timestamp()+tm.get('totalDurationMs',0)/1000)-prev_end.timestamp():.1f}s")
