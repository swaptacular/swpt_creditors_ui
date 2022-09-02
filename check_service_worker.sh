#!/bin/sh

if [ -z "$1" ]; then
    echo "Usage: check_service_worker.sh TAG"
    return 1
fi

echo -n "Checking whether the service worker has been updated... "
text="\${appName}-v$1"
if grep -q "$text" public/sw.js; then
    echo "OK"
else
    echo
    echo "Error: public/sw.js does not contain the string '$text'."
    return 1
fi
