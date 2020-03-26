#!/bin/bash
  
set -e

source ~/.nvm/nvm.sh

echo "[SCRIPT] Before Install Script :: Setup Postgres ${POSTGRES_MAJOR_VERSION}"

nvm install $NODE_VERSION
nvm use $NODE_VERSION
npm install -g greenkeeper-lockfile@1


if [[ $POSTGRES_MAJOR_VERSION -lt 11 ]]; then
  # Setup postgres 9 or 10
  sudo sed -i 's/port = 5432/port = ${PARSE_PG_PORT}/' /etc/postgresql/${POSTGRES_MAJOR_VERSION}/main/postgresql.conf

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
  sudo sed -i 's/port = 5433/port = ${PARSE_PG_PORT}/' /etc/postgresql/${POSTGRES_MAJOR_VERSION}/main/postgresql.conf
  sudo cp /etc/postgresql/{10,${POSTGRES_MAJOR_VERSION}}/main/pg_hba.conf
  sudo systemctl stop postgresql@${POSTGRES_MAJOR_VERSION}-main
  sudo systemctl start postgresql@${POSTGRES_MAJOR_VERSION}-main
  # Remove previous versions of postgres
  #sudo apt-get remove -q 'postgresql-9.*' 'postgresql-10.*'
  #sudo service postgresql start
fi
