#!/bin/bash
#this script waits until a new version is deployed

i=0
b=10

while true; do

    response=$(curl -sb -H "Accept: application/json" "https://$(host)/v1/version")
    if [[ $response = *"$(Build.BuildId)"* ]]; then
        echo "New version found"
        break
    else
        echo "new version not found waiting for 30 secounds"
        sleep 30
    fi

    if [ "$i" -gt "$b" ]
    then
        echo "new version not found, deployment failed"
        exit 1
        break
    fi

    i=$[$i+1]

done