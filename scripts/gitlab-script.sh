#!/bin/bash
export DOCKER_HOST=tcp://127.0.0.1:4243

PDF_FOLDER=__pdfs__

URL=`jq --raw-output .homepage package.json`

mkdir "$PDF_FOLDER"
chmod a+rwx "$PDF_FOLDER"

npm run pdf -- "$URL" || exit 0

chown jenkins.jenkins "$PDF_FOLDER"
chmod 755 "$PDF_FOLDER"

npm run toc