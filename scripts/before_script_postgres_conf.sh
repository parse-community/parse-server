#!/bin/bash

set -e

echo "[SCRIPT] Before Script :: Setup Parse Postgres configuration file"

# DB Version: 13
# OS Type: linux
# DB Type: web
# Total Memory (RAM): 6 GB
# CPUs num: 1
# Data Storage: ssd

PGPASSWORD=postgres psql -v ON_ERROR_STOP=1 -h localhost -U postgres <<-EOSQL
    ALTER SYSTEM SET max_connections TO '200';
    ALTER SYSTEM SET shared_buffers TO '1536MB';
    ALTER SYSTEM SET effective_cache_size TO '4608MB';
    ALTER SYSTEM SET maintenance_work_mem TO '384MB';
    ALTER SYSTEM SET checkpoint_completion_target TO '0.9';
    ALTER SYSTEM SET wal_buffers TO '16MB';
    ALTER SYSTEM SET default_statistics_target TO '100';
    ALTER SYSTEM SET random_page_cost TO '1.1';
    ALTER SYSTEM SET effective_io_concurrency TO '200';
    ALTER SYSTEM SET work_mem TO '3932kB';
    ALTER SYSTEM SET min_wal_size TO '1GB';
    ALTER SYSTEM SET max_wal_size TO '4GB';
    SELECT pg_reload_conf();
EOSQL

exec "$@"
