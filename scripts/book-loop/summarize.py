# scripts/book-loop/summarize.py
# Summarize one book-loop turn JSON: reply, tool calls, and what changed.
import json, sys
d = json.load(open(sys.argv[1]))
print('completed', d['completed'], d['finishedReason'], f"{d['totalDurationMs']/1000:.0f}s", 'errors', d['errors'])
print('session', d['sessionId'])
print('--- REPLY\n' + (d['assistantText'] or '(empty)'))
print('--- TOOLS')
for c in d['toolCalls']:
    f = c.get('function', c)
    print('  ', f.get('name'), str(f.get('arguments'))[:300])
print('--- PROJECT', json.dumps(d['projectChanges'])[:600])
for t, v in d['diff'].items():
    for k in ('created', 'updated', 'removed'):
        for e in v[k]:
            print(' ', t, k, e['label'], list(e.get('changes', {}).keys()) if k == 'updated' else '')
