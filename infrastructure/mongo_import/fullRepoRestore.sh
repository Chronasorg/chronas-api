#!/bin/bash

# 0: start restore: kubectl run -i --tty --attach restore --image=aumanjoa/helper:mongorestore &

if [[ $# -eq 0 ]] ; then
    echo "first argument: name of mongodump name placed in your local dump folder, example: dumpNov4"
    echo "second argument: name of local db, example: chronas-api-staging"
    exit 0
fi

mongodump --db chronas-api-staging -o dump/$1

restorePodName=`kubectl get pod | grep restore | awk '{print $1;}'`

echo "*** using $restorePodName as restore podname, now copying local dump to pod"

kubectl cp dump/$1 $restorePodName:/home/dump/

echo "*** copy done, now executing the mongorestore on pod"

kubectl exec -it $restorePodName -- bash -c "mongorestore --host mongo-0.mongo,mongo-1.mongo --port 27017 --drop -d chronas-api /home/dump/$1/$2 --writeConcern '{w:0}'"

kubectl delete deployment restore
