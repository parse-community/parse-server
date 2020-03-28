#!/bin/bash
  
set -e

echo "[SCRIPT] Before Install Script :: Setup Postgres ${POSTGRES_MAJOR_VERSION}"

if [[ $POSTGRES_MAJOR_VERSION -lt 11 ]]; then
  # Setup postgres 9 or 10
  sudo sed -i 's/port = 5432/port = 5433/' /etc/postgresql/${POSTGRES_MAJOR_VERSION}/main/postgresql.conf

  # Stop the current running service
  sudo service postgresql stop

  # Remove correct version of postgres
  if [[ $POSTGRES_MAJOR_VERSION -lt 10 ]]; then
    sudo apt-get remove -q 'postgresql-10.*'
  else
    sudo apt-get remove -q 'postgresql-9.*'
  fi

  sudo service postgresql start

else 
  # Setup postgres 11 or higher

  #Copy defauilt hba config file and tell postgres to reload it
  sudo cp /etc/postgresql/{10,${POSTGRES_MAJOR_VERSION}}/main/pg_hba.conf
  psql -v ON_ERROR_STOP=1 -p 5433 --username "postgres" --dbname "${POSTGRES_DB}" <<-EOSQL
    SELECT pg_reload_conf();  
EOSQL
fi
