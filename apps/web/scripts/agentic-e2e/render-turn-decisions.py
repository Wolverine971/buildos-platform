# apps/web/scripts/agentic-e2e/render-turn-decisions.py
# Usage: python3 scripts/agentic-e2e/render-turn-decisions.py <out.json> [...]
# Renders declared contracts, reviewer revisions/clarifications/approvals, and mutation calls per turn.
import json,sys
CTRL={'declare_turn_contract','request_proposal_revision','request_turn_clarification','approve_turn_contract_review','approve_mutation_batch_review','cancel_turn_contract'}
for f in sys.argv[1:]:
    rows=json.load(open(f))
    print("#"*30, f.split('/')[-1])
    for r in rows:
        print(f"\n=== {r['scenario']} rep{r['rep']} pass={r['pass']} turn_run={r['turn_run'][:8]}")
        for e in r['execs']:
            n=e['tool_name']; a=e.get('arguments') or {}; res=e.get('result') or {}
            if n=='declare_turn_contract':
                outs=[]
                for o in a.get('outcomes',[]):
                    outs.append(f"{o.get('action')}/{o.get('entity_kind')} targets={len(o.get('target_ids') or [])} min={o.get('minimum_successful_effects')} fields={o.get('required_fields')} changes={o.get('changes')}")
                print(f"  [{e['sequence_index']}] DECLARE ok={e['success']} summary={a.get('summary','')[:160]!r}")
                for o in outs: print("        -", o)
                if not e['success']: print("        ERR:", (e.get('error_message') or json.dumps(res))[:400])
            elif n=='request_proposal_revision':
                print(f"  [{e['sequence_index']}] REVISION reason={a.get('reason','')[:400]!r}\n        required_correction={a.get('required_correction','')[:400]!r}")
            elif n=='request_turn_clarification':
                print(f"  [{e['sequence_index']}] CLARIFY reason={a.get('reason','')[:400]!r}\n        question={a.get('question','')[:300]!r}")
            elif n in ('approve_turn_contract_review','approve_mutation_batch_review'):
                rc=a.get('reference_candidates')
                print(f"  [{e['sequence_index']}] {n.upper()} reason={a.get('reason','')[:300]!r} ref_candidates={json.dumps(rc)[:300] if rc else None}")
            elif n.startswith(('create_onto','update_onto','move_document')):
                print(f"  [{e['sequence_index']}] MUT {n} ok={e['success']} args={json.dumps(a)[:220]} err={(e.get('error_message') or '')[:120]}")
            else:
                print(f"  [{e['sequence_index']}] {n} ok={e['success']}")
