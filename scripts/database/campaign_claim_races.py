# scripts/database/campaign_claim_races.py
"""Two real PostgreSQL sessions contend before the first claim commits."""
from concurrent.futures import ThreadPoolExecutor
import os
import subprocess
import time


def expect(condition, message):
    if not condition:
        raise AssertionError(message)


def check_campaign_claim_races(db, database):
    db.sql("""
        INSERT INTO public.email_campaigns(id, name, status) VALUES
          ('c3000000-0000-4000-8000-000000000001','Race A','sending'),
          ('c3000000-0000-4000-8000-000000000002','Race B','sending');
        INSERT INTO public.email_campaign_recipients(campaign_id,email,status,scheduled_for)
        SELECT id, id::text || '@example.test', 'queued', now() FROM public.email_campaigns
        WHERE id IN ('c3000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000002');
    """, database=database)
    for cap in (1, 2):
        db.sql("TRUNCATE private.email_campaign_send_reservations; UPDATE public.email_campaign_recipients SET status='queued', attempt_count=0;", database=database)
        env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
        env['PGOPTIONS'] = '-c statement_timeout=15000 -c idle_in_transaction_session_timeout=20000'
        first = subprocess.Popen(db.command(database), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, text=True, env=env)
        try:
            first.stdin.write(f"BEGIN; SET ROLE service_role; SELECT count(*) FROM public.claim_email_campaign_sends(1,120,{cap});\n")
            first.stdin.flush()
            expect(first.stdout.readline().strip() == '1', 'first session must claim one row')
            with ThreadPoolExecutor(max_workers=1) as executor:
                second = executor.submit(db.sql,
                    f"SET application_name='campaign_cap_contender'; SET ROLE service_role; SELECT count(*) FROM public.claim_email_campaign_sends(1,120,{cap});",
                    database=database)
                blocked = False
                deadline = time.monotonic() + 10
                while not second.done() and time.monotonic() < deadline:
                    blocked = db.sql("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name='campaign_cap_contender' AND wait_event='advisory';", database=database).strip() == '1'
                    if blocked:
                        break
                    time.sleep(0.02)
                # Always unblock before asserting so a failed regression cannot hang cleanup.
                first.stdin.write('COMMIT;\n\\q\n')
                first.stdin.flush()
                _, error = first.communicate(timeout=20)
                expect(first.returncode == 0, error)
                result = second.result(timeout=20).strip()
                expect(blocked, 'second claim must wait for the shared allowance transaction')
                expect(result == str(cap - 1), f'cap {cap}: second claim returned {result}')
            expect(db.sql("SELECT count(*) FROM public.email_campaign_recipients WHERE status='sending';", database=database).strip() == str(cap), 'claimed row count must match cap')
            expect(db.sql("SELECT count(*) FROM private.email_campaign_send_reservations;", database=database).strip() == str(cap), 'every claimed row needs one reservation')
            expect(db.sql("SELECT bool_and(attempt_count=1) FROM public.email_campaign_recipients WHERE status='sending';", database=database).strip() == 't', 'no recipient may be claimed twice')
            print(f'PASS campaign concurrent claims: shared cap {cap}', flush=True)
        finally:
            if first.poll() is None:
                first.kill()
                first.communicate()
