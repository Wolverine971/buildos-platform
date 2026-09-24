#!/usr/bin/env python3
# scripts/supabase-health/preflight.py
"""Read-only release checks; exit nonzero for missing RPCs, unsafe grants or stale cron receipts."""
import argparse
from pathlib import Path
import re

import health

MAINTENANCE = {
    'recover_dead_agentic_chat_turns': ('integer,boolean', ['p_batch_size', 'p_workflow_handoff']),
    'reap_stranded_queued_agentic_chat_turns': ('integer,integer', ['p_queued_before_seconds', 'p_batch_size']),
}
ADMIN = {
    'acquire_migration_platform_lock': ('uuid,uuid,integer', ['p_run_id', 'p_locked_by', 'p_duration_minutes']),
    'get_subscription_overview': ('', []),
}


def evaluate(sections, scope='all', require_cron=False):
    checks = []

    def check(name, passed):
        checks.append({'check': name, 'passed': bool(passed)})

    functions = sections.get('functions', [])
    expected = {**(MAINTENANCE if scope in ('all', 'maintenance') else {}),
                **(ADMIN if scope in ('all', 'security') else {})}
    for name, (args, names) in expected.items():
        matches = [f for f in functions if f['name'] == name]
        check(name + ': one exact signature', len(matches) == 1 and
              matches[0]['identity'].removeprefix('public.') == f'{name}({args})')
        if len(matches) != 1:
            continue
        fn = matches[0]
        # TABLE-returning functions also include output names after their inputs.
        check(name + ': named input arguments', (fn['argument_names'] or [])[:len(names)] == names)
        check(name + ': service-only execution', fn['service_execute'] and not any(
            fn[k] for k in ('anon_execute', 'authenticated_execute', 'public_execute')))
        check(name + ': invoker', not fn['definer'])
        config = fn['config'] or []
        path = 'search_path=pg_catalog, public' if name in MAINTENANCE else 'search_path=""'
        check(name + ': pinned search_path', path in config)
        if name == 'recover_dead_agentic_chat_turns':
            check(name + ': bounded lock wait', 'lock_timeout=2s' in config)

    migrations = []
    if scope in ('all', 'maintenance'):
        migrations += ['20260924000000', '20260924000100', '20260924150000']
    if scope in ('all', 'security'):
        migrations += ['20260924202321']
        check('legacy phase RPC absent', not any(f['name'] == 'batch_update_phase_dates' for f in functions))
    for version in migrations:
        check('migration recorded: ' + version, version in sections.get('migrations', []))

    if require_cron:
        cron = sections.get('cron', {})
        age = cron.get('seconds_since_success')
        check('maintenance cron succeeded within 5 minutes', age is not None and 0 <= age <= 300)
        check('latest maintenance cron succeeded', cron.get('latest_status') == 'success')
        check('no maintenance cron warnings/errors in last 15 minutes', cron.get('errors_last_15m') == 0)
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project-ref', required=True)
    parser.add_argument('--scope', choices=['maintenance', 'security', 'all'], default='all')
    parser.add_argument('--require-cron', action='store_true', help='For deployments that run the web cron; omit on isolated QA')
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    if not re.fullmatch('[a-z]{20}', args.project_ref):
        parser.error('A project ref must be 20 lowercase letters')
    result = {'project_ref': args.project_ref, 'collected_at': health.now(), 'read_only': True,
              'scope': args.scope, 'require_cron': args.require_cron}
    print(f'Read-only preflight ({args.scope}): {args.project_ref}')
    try:
        rows = health.query(args.project_ref, (health.HERE / 'sql/preflight.sql').read_text())
        sections = {r['section']: r['data'] for r in rows}
        result['sections'] = sections
        result['checks'] = evaluate(sections, args.scope, args.require_cron)
        result['passed'] = all(c['passed'] for c in result['checks'])
        for check in result['checks']:
            print(('PASS ' if check['passed'] else 'FAIL ') + check['check'])
    except Exception as error:
        result['passed'] = False
        result['error'] = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        print('Unavailable: ' + result['error'])
    health.save(args.out, result)
    return 0 if result['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
