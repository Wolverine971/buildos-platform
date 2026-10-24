# scripts/migration-rehearsal/check-project-join-races.py
"""Task 143 two-session regression checks, against a stopped --keep rehearsal only.

Usage: python3 scripts/migration-rehearsal/check-project-join-races.py /tmp/buildos-rehearsal-...
Never connects to a hosted database. Starts/stops the disposable socket-only cluster.
"""
from pathlib import Path
import json
import shutil
import subprocess
import sys
import time


def ident(number: int) -> str:
    return f'f143aaaa-0000-4000-8000-{number:012d}'


def main() -> None:
    cluster = Path(sys.argv[1]).resolve()
    if cluster.parent != Path('/tmp').resolve() or not cluster.name.startswith('buildos-rehearsal-'):
        raise SystemExit('Only a disposable /tmp/buildos-rehearsal-* cluster is allowed')
    pg_bin = Path(shutil.which('pg_ctl') or '/opt/homebrew/opt/postgresql@16/bin/pg_ctl').parent
    data, socket = cluster / 'data', cluster / 'socket'
    if not data.is_dir() or not socket.is_dir():
        raise SystemExit('Rehearsal data/socket directory missing')
    if subprocess.run([str(pg_bin / 'pg_ctl'), '-D', str(data), 'status'], capture_output=True).returncode == 0:
        raise SystemExit('Cluster must be stopped; this script owns its lifecycle')
    command = [str(pg_bin / 'psql'), '-XqAt', '-v', 'ON_ERROR_STOP=1', '-h', str(socket),
               '-p', '5432', '-U', 'postgres', '-d', 'postgres']

    def sql(query: str) -> str:
        result = subprocess.run(command, input=query, text=True, capture_output=True, timeout=15)
        if result.returncode:
            raise AssertionError(result.stderr)
        return result.stdout.strip()

    def session(user: int, name: str) -> str:
        claims = json.dumps({'role': 'authenticated', 'sub': ident(user)})
        return (f"SET application_name='{name}'; SET statement_timeout='10s'; BEGIN; "
                f"SET LOCAL request.jwt.claims='{claims}'; SET LOCAL request.jwt.claim.sub='{ident(user)}'; "
                "SET LOCAL request.jwt.claim.role='authenticated'; SET LOCAL ROLE authenticated; ")

    subprocess.run([str(pg_bin / 'pg_ctl'), '-D', str(data), '-l', str(cluster / 'postgres.log'),
                    '-o', f"-p 5432 -k {socket} -c listen_addresses='' -c fsync=off "
                    '-c full_page_writes=off -c synchronous_commit=off -c max_locks_per_transaction=1024',
                    '-w', 'start'], check=True, capture_output=True)
    try:
        values = ','.join(f"('{ident(n)}','race143.{n}@example.com')" for n in range(1,6))
        sql(f'INSERT INTO auth.users(id,email) VALUES {values}; '
            f'INSERT INTO public.users(id,email) VALUES {values} ON CONFLICT DO NOTHING; '
            'INSERT INTO public.onto_actors(id,kind,name,user_id) VALUES ' + ','.join(
                f"('{ident(n+20)}','human','Race {n}','{ident(n)}')" for n in range(1,6)) + '; '
            f"INSERT INTO public.onto_projects(id,name,type_key,created_by,state_key) VALUES "
            f"('{ident(101)}','Race project','project.default','{ident(21)}','active'); "
            f"INSERT INTO public.onto_project_members(project_id,actor_id,role_key,access) VALUES "
            f"('{ident(101)}','{ident(21)}','owner','admin') ON CONFLICT DO NOTHING;")
        sql(session(1, 'task143-setup') +
            f"SELECT public.create_project_invite_link('{ident(101)}','{ident(401)}',repeat('b',64)); COMMIT;")

        for user, (first, second) in enumerate([
            ('approve', 'invite'), ('invite', 'approve'), ('invite', 'link'), ('link', 'invite')
        ], start=2):
            invite_id, request_id = ident(200+user), ident(300+user)
            sql(f"INSERT INTO public.onto_project_invites(id,project_id,invitee_email,invitee_user_id,role_key,access,agent_access,token_hash,invited_by_actor_id,status,expires_at) "
                f"VALUES('{invite_id}','{ident(101)}','race143.{user}@example.com','{ident(user)}','editor','write','write',lpad('{user}',64,'0'),'{ident(21)}','pending',now()+interval '1 day'); "
                f"INSERT INTO public.people_requests(id,from_user_id,to_user_id,kind) VALUES "
                f"('{request_id}','{ident(user)}','{ident(1)}','access');")

            calls = {
                'invite': f"SELECT to_jsonb(r) FROM public.accept_project_invite_by_id('{invite_id}') r; ",
                'link': "SELECT public.accept_project_invite_link(repeat('b',64)); ",
                'approve': f"SELECT public.decide_people_request('{request_id}','approve',"
                    f"'[{{\"project_id\":\"{ident(101)}\",\"role\":\"viewer\",\"agent_access\":\"off\"}}]'); "
            }
            # The first transaction holds the same lock the RPC takes. Keep stdin open
            # so we can prove the other real RPC waits before releasing the first.
            one = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE, text=True)
            two = None
            try:
                assert one.stdin and one.stdout
                one.stdin.write(session(1 if first == 'approve' else user, 'task143-first') +
                    f"SELECT pg_advisory_xact_lock(hashtextextended('project-join:{ident(user)}',0)); "
                    "SELECT 'locked';\n")
                one.stdin.flush()
                while one.stdout.readline().strip() != 'locked':
                    if one.poll() is not None:
                        raise AssertionError('First transaction failed before acquiring lock')
                two = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                       stderr=subprocess.PIPE, text=True)
                assert two.stdin
                two.stdin.write(session(1 if second == 'approve' else user, 'task143-second') + calls[second] + 'COMMIT;\n')
                two.stdin.close()
                two.stdin = None
                waiting = False
                for _ in range(100):
                    waiting = sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='task143-second' AND wait_event='advisory');") == 't'
                    if waiting:
                        break
                    time.sleep(.02)
                assert waiting, f'{first}/{second}: second session never waited on the join lock'
                one.stdin.write(calls[first] + 'COMMIT;\n')
                one.stdin.close()
                one.stdin = None
                output_one, error_one = one.communicate(timeout=15)
                output_two, error_two = two.communicate(timeout=15)
                assert one.returncode == 0, error_one
                assert two.returncode == 0, error_two
                if second == 'invite':
                    assert 'already_member' in output_two, output_two
                if second == 'link':
                    assert 'already_member' in output_two, output_two
                expected_role, expected_agents = ('viewer','off') if 'approve' in (first,second) else (
                    ('editor','write') if first == 'invite' else ('viewer','read'))
                actual = sql(f"SELECT role_key||':'||agent_access FROM public.onto_project_members WHERE project_id='{ident(101)}' AND actor_id='{ident(user+20)}' AND removed_at IS NULL;")
                assert actual == expected_role+':'+expected_agents, actual
                notices = sql(f"SELECT count(*) FROM public.notification_events WHERE event_type='project.invite.accepted' AND actor_user_id='{ident(user)}';")
                assert notices == ('0' if first == 'approve' else '1'), notices
                print(f'PASS {first} vs {second}: serialized, actual permissions preserved, {notices} owner notices')
            finally:
                for process in (one, two):
                    if process is not None and process.poll() is None:
                        process.kill()
                        process.wait()
    finally:
        subprocess.run([str(pg_bin / 'pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'],
                       check=True, capture_output=True)


if __name__ == '__main__':
    main()
