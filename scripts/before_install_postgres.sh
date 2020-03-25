#!/bin/bash
  
set -e

source ~/.nvm/nvm.sh

echo "[SCRIPT] Before Install Script :: Setup Postgres ${POSTGRES_MAJOR_VERSION}"

nvm install $NODE_VERSION
nvm use $NODE_VERSION
npm install -g greenkeeper-lockfile@1

# Setup postgres 9 or 10
sudo service postgresql stop

if [[ $POSTGRES_MAJOR_VERSION -lt 11 ]]; then

  sudo sed -i 's/port = 5432/port = 5433/' /etc/postgresql/${POSTGRES_MAJOR_VERSION}/main/postgresql.conf
    
  # Remove correct version of postgres
  if [[ $POSTGRES_MAJOR_VERSION -lt 10 ]]; then
    sudo apt-get remove -q 'postgresql-10.*'
  else
    sudo apt-get remove -q 'postgresql-9.*'
  fi

  sudo service postgresql start ${POSTGRES_MAJOR_VERSION}

else 

  # Setup postgres 11 or higher
  sudo cp /etc/postgresql/{10,${POSTGRES_MAJOR_VERSION}}/main/pg_hba.conf
  /usr/lib/postgresql/${POSTGRES_MAJOR_VERSION}/bin/pg_ctl -D /var/lib/postgresql/${POSTGRES_MAJOR_VERSION}/main -l logfile start
  # Remove previous versions of postgres
  #sudo apt-get remove -q 'postgresql-9.*' 'postgresql-10.*'
  sudo service postgresql start ${POSTGRES_MAJOR_VERSION}
fi
