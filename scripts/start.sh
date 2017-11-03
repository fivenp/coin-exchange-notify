#!/bin/sh
# shellcheck shell=dash

set -e

cd "$(dirname "$0")/../"
npm install
while true
do
    echo # Newline for better readability
    echo '--- Running script'
    node index.js
    echo '--- Waiting for 15 minutes...'
    sleep 900 # seconds
done
