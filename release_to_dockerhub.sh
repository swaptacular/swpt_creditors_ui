#!/bin/sh
set -e

./check_service_worker.sh "$@"

swpt_creditors_ui="epandurski/swpt_creditors_ui:$1"
docker build -t "$swpt_creditors_ui" --target app-image .
git tag "v$1"
git push origin "v$1"
docker login
docker push "$swpt_creditors_ui"
