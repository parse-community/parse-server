#!/bin/bash

set -e

echo "[SCRIPT] Before Script :: Setup Parse DB for Postgres ${POSTGRES_MAJOR_VERSION}"

node -e 'require("./lib/index.js")'
greenkeeper-lockfile-update

psql -v ON_ERROR_STOP=1 -p 5433 --username "postgres" --dbname "${POSTGRES_DB}" <<-EOSQL
    CREATE DATABASE parse_server_postgres_adapter_test_database;
    \c parse_server_postgres_adapter_test_database;
    CREATE EXTENSION postgis;
    CREATE EXTENSION postgis_topology;
EOSQL
