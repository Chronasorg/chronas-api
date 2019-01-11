#!/bin/bash
if [[ $# -eq 0 ]] ; then
    echo "first argument: name of collection placed in your local dump folder, example: markers"
    exit 0
fi

restorePodName=`kubectl get pod | grep restore | awk '{print $1;}'`

echo "*** using $restorePodName as restore podname, no copy to local dump to pod"

kubectl cp dump/$1.json $restorePodName:/home/dump/

echo "*** copy done, now executing the mongoimport of $1 on pod"

kubectl exec -it $restorePodName -- bash -c "mongoimport --host \"mongo-0.mongo,mongo-1.mongo\" --port 27017 --drop --db chronas-api --collection $1 --file /home/dump/$1.json"
