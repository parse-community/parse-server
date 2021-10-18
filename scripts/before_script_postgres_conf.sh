#!/bin/bash

set -e

echo "[SCRIPT] Before Script :: Setup Parse Postgres configuration file"

su - postgres

cat >> ${PGDATA}/postgresql.conf <<EOSQL

# DB Version: 13
# OS Type: linux
# DB Type: web
# Total Memory (RAM): 6 GB
# CPUs num: 1
# Data Storage: ssd

max_connections = 200
shared_buffers = 1536MB
effective_cache_size = 4608MB
maintenance_work_mem = 384MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 3932kB
min_wal_size = 1GB
max_wal_size = 4GB
EOSQL

exec "$@"
