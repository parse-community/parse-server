#!/bin/bash
  
set -e

source ~/.nvm/nvm.sh

echo "[SCRIPT] Before Install Script :: Setup Postgres ${POSTGRES_MAJOR_VERSION}"

nvm install $NODE_VERSION
nvm use $NODE_VERSION
npm install -g greenkeeper-lockfile@1

#Stop the default service since changes are needed to the config file
sudo service postgresql stop
#Switched installed default port to 5433 since URI is is using this port
sudo sed -i 's/port = 5432/port = 5433/' /etc/postgresql/${POSTGRES_MAJOR_VERSION}/main/postgresql.conf

# Currently the Xenial immage lists posgres < 11 are pre-installed, we can use those 
# as long as we change the port of the one we need. Note that we leave PGPORT=5432
# as there were random issues that popped up with looking for older versions of postgis
# when using the default port
if [[ $POSTGRES_MAJOR_VERSION -lt 11 ]]; then
  # Setup postgres 9 or 10

  sudo service postgresql start ${POSTGRES_MAJOR_VERSION}

else

  # Setup postgres 11 or higher
  sudo cp /etc/postgresql/{10,${POSTGRES_MAJOR_VERSION}}/main/pg_hba.conf
  sudo service postgresql start ${POSTGRES_MAJOR_VERSION}

fi

