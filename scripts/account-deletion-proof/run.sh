#!/usr/bin/env bash
# scripts/account-deletion-proof/run.sh
# Prints the read-only deletion receipt for one account against PRODUCTION
# (supabase --linked). Counts only; no content is selected. Capture the actor id
# before the purge (select id from onto_actors where user_id = ...) to also
# check the tombstone and the references to it.
set -euo pipefail
user_id="${1:?usage: run.sh <user_id> [actor_id]}"
actor_id="${2:-}"
uuid='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
[[ "$user_id" =~ $uuid ]] || { echo "user_id must be a uuid" >&2; exit 2; }
[[ -z "$actor_id" || "$actor_id" =~ $uuid ]] || { echo "actor_id must be a uuid" >&2; exit 2; }
here="$(cd "$(dirname "$0")" && pwd)"
sql="$(sed -e "s/:'user_id'/'$user_id'/g" -e "s/:'actor_id'/'$actor_id'/g" "$here/receipt.sql")"
supabase db query --linked "$sql"
