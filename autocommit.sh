#!/bin/bash
while true
do
    changes=$(git diff --name-only)
    git add .
    git commit -m "Auto: updated files -> $changes"
    sleep 600
done
