#!/bin/sh
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'
BOLD='\033[1m'
CHECK="${GREEN}\xE2\x9C\x93${NC}"
DEFAULT_MONGODB_URI='mongodb://localhost:127.0.0.1:27017/parse'

confirm() {
  DEFAULT=$1;
  shift
  printf "$@"
  read -r YN
  if [ "$YN" = "" ] && [ "$DEFAULT" = 'N' ]; then
    exit 1
  elif [ "$YN" != "" ] && [ "$YN" != "y" ] && [ "$YN" != "Y" ]; then
    echo 'Bye Bye!'
    exit 1
  fi
}

genstring() {
  local l=$1
  [ "$l" == "" ] && l=40
  LC_ALL=C tr -dc A-Za-z0-9 < /dev/urandom | head -c ${l}
}

check_node() {
  node=`which node 2>&1`
  ret=$?

  if [ $ret -eq 0 ] && [ -x "$node" ]; then
    echo "${CHECK} node:" $(node -v)
    (exit 0)
  else
    echo "parse-server cannot be installed without Node.js." >&2
    exit 1
  fi
}

check_npm() {
  npm=`which npm 2>&1`
  ret=$?

  if [ $ret -eq 0 ] && [ -x "$npm" ]; then
    echo "${CHECK} npm:" $(npm -v)
    (exit 0)
  else
    echo "parse-server cannot be installed without npm." >&2
    exit 1
  fi
}


echo ''
echo '                                       
             `.-://////:-..`            
         `:/oooooooooooooooo+:.`        
      `:+oooooooooooooooooooooo+/`      
     :+ooooooooooooooooooooooooooo/.    
   .+oooooooooooooo/:.....-:+ooooooo-   
  .+ooooooooooooo/` .:///:-` -+oooooo:  
 `+ooooooooooooo: `/ooooooo+- `ooooooo- 
 :oooooooooooooo  :ooooooooo+` /oooooo+ 
 +ooooooooooooo/  +ooooooooo+  /ooooooo.
 oooooooooooooo+  ooooooooo`  .oooooooo.
 +ooooooooooo+/: `ooooooo`  .:ooooooooo.
 :ooooooo+.`````````````  /+oooooooooo+ 
 `+oooooo- `ooo+ /oooooooooooooooooooo- 
  .+ooooo/  :/:` -ooooooooooooooooooo:  
   .+ooooo+:-..-/ooooooooooooooooooo-   
     :+ooooooooooooooooooooooooooo/.    
      `:+oooooooooooooooooooooo+/`      
         `:/oooooooooooooooo+:.`        
             `.-://////:-..`            

              parse-server

'


INSTALL_DIR=""
printf "Enter an installation directory\n"
printf "(%s): " "${PWD}"
read -r INSTALL_DIR

if [ "$INSTALL_DIR" = "" ]; then
  INSTALL_DIR="${PWD}"
fi

echo ''
printf "This will setup parse-server in %s\n" "${INSTALL_DIR}"
confirm 'Y' 'Do you want to continue? (Y/n): '

check_node
check_npm

printf "Setting up parse-server in %s" "${INSTALL_DIR}\n"

if [ -d "${INSTALL_DIR}" ]; then
  echo "{CHECK} ${INSTALL_DIR} exists"
else
  mkdir -p "${INSTALL_DIR}"
  echo "${CHECK} Created ${INSTALL_DIR}"
fi

cd "${INSTALL_DIR}"

if [ -f "package.json" ]; then
  echo "\n${RED}package.json exists${NC}"
  confirm 'N' "Do you want to continue? \n${RED}this will erase your configuration${NC} (y/N): "
fi


if [ -f 'config.json' ]; then
  echo "\n${RED}config.json exists${NC}"
  confirm 'N' "Do you want to continue? \n${RED}this will erase your configuration${NC} (y/N): "
fi

APP_NAME=''
i=0
while [ "$APP_NAME" = "" ]
do
  [[ $i != 0 ]] && printf "${RED}An application name is required!${NC}\n"
  printf "Enter your ${BOLD}Application Name${NC}: "
  read -r APP_NAME
  i=$(($i+1))
done

printf "Enter your ${BOLD}Application Id${NC} (leave empty to generate): "
read -r APP_ID

[[ $APP_ID = '' ]] && APP_ID=$(genstring) && printf "\n$APP_ID\n\n"

printf "Enter your ${BOLD}Master Key${NC} (leave empty to generate): "
read -r MASTER_KEY

[[ $MASTER_KEY = '' ]] && MASTER_KEY=$(genstring) && printf "\n$MASTER_KEY\n\n"

printf "Enter your ${BOLD}mongodbURI${NC} (%s): " $DEFAULT_MONGODB_URI
read -r MONGODB_URI

[[ $MONGODB_URI = '' ]] && MONGODB_URI="$DEFAULT_MONGODB_URI"

cat > ./config.json << EOF
{
  "applicationId": "${APP_ID}",
  "masterKey": "${MASTER_KEY}",
  "appName": "${APP_NAME}",
  "cloud": "./cloud/main",
  "databaseURI": "${MONGODB_URI}"
}
EOF
echo "${CHECK} Created config.json"

# Make a proper npm app name
NPM_APP_NAME=$(echo "$APP_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
cat > ./package.json << EOF
{
  "name": "$NPM_APP_NAME",
  "description": "parse-server for $APP_NAME",
  "scripts": {
    "start": "parse-server config.json"
  },
  "dependencies": {
    "parse-server": "^2.0.0"
  }
}
EOF
echo "${CHECK} Created package.json"

if [ -d "./cloud/" ]; then
  echo "${CHECK} cloud/ exists"
else
  mkdir -p ./cloud
  echo "${CHECK} Created cloud/"
fi

if [ -e "./cloud/main.js" ]; then
  echo "${CHECK} cloud/main.js exists"
else
  echo "${CHECK} Created cloud/main.js"
  cat > ./cloud/main.js << EOF
// Cloud Code entry point

EOF
fi

if [ -d "./public/" ]; then
  echo "${CHECK} public/ exists"
else
  mkdir -p ./public
  echo "${CHECK} Created public/"
fi

echo "\n${CHECK} running npm install\n"

npm install -s

CURL_CMD=$(cat << EOF
curl -X POST -H 'X-Parse-Application-Id: ${APP_ID}' \\
  -H 'Content-Type: application/json' \\
  -d '{"foo":"bar"}' http://localhost:1337/parse/classes/TestObject
EOF)

echo "\n${CHECK} Happy Parsing!\n\n"
echo "${CHECK} Make sure you have ${BOLD}mongo${NC} listening on ${BOLD}${MONGODB_URI}${NC}"
echo "${CHECK} start parse-server by running ${BOLD}npm start${NC}"
echo "${CHECK} Test your setup with:\n\n${CURL_CMD}\n"
