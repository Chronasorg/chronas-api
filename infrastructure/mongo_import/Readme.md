1. Check if the pod is already running. If so continue with point 5

   ```bash
   kubectl get pod
   ```

2. add the files you want to restore in the "dump" directory of this folder

3. rebuild and push the image to this repo "aumanjoa/helper:mongorestore"

4. run this command to execute the container in the cluster

```bash
kubectl run -i --tty --attach restore --image=aumanjoa/helper:mongorestore
```

5. copy new files to the pod with contains the name "restore"  with by using this command

   > Copy /tmp/dump local file to/home/dump/ in a remote pod in namespace

   ```bash
   kubectl cp /tmp/dump <some-pod>:/home/dump/
   ```

6. connect to the container with contains the name "restore"

```bash
kubectl exec -it [POD_NAME] /bin/bash
```

6. run this commands inside the container:

```bash
mongoimport --host "mongo-0.mongo,mongo-1.mongo" --port 27017 --drop --db chronas-api --collection areas --file /home/dump/areas.json

mongoimport --host "mongo-0.mongo,mongo-1.mongo" --port 27017 --drop --db chronas-api --collection markers --file /home/dump/markers.json

mongoimport --host "mongo-0.mongo,mongo-1.mongo" --port 27017 --drop --db chronas-api --collection discussions --file /home/dump/discussions.json

mongoimport --host "mongo-0.mongo,mongo-1.mongo" --port 27017 --drop --db chronas-api --collection forums --file /home/dump/forums.json

mongoimport --host "mongo-0.mongo,mongo-1.mongo" --port 27017 --drop --db chronas-api --collection metadatas --file /home/dump/metadatas.json

mongoimport --host "mongo-0.mongo,mongo-1.mongo" --port 27017 --drop --db chronas-api --collection opinions --file /home/dump/opinions.json
```

---
For complete restore

``
kubectl cp dump/dumpNov4 restore-64cc7968d5-pmz9d:/home/dump/
``

``kubectl exec -it restore-64cc7968d5-pmz9d /bin/bash
``

``` mongorestore --host mongo-0.mongo,mongo-1.mongo --port 27017 --drop -d chronas-api /home/dump/dumpNov4/chronas-api-staging```

---

If you want to restore from an gzip file from backup.

1. copy the dump to the mongo-restore pod

   ```bash
   kubectl cp test-1545717600.gz restore-64cc7968d5-mp7fk:/tmp
   ```

2. restore the dump from the gz file

   ```bash
   mongorestore --gzip --archive=test-1545717600.gz --host "mongo-0.mongo,mongo-1.mongo" --port 27017 --drop
   ```



   ```bash
mongorestore --ssl \
    --host="chronas-db-cluster.niceurl.com:27017" \
    --numParallelCollections 4 \
    --username=user \
    --password=pw \
    --gzip --archive=test-1637215200.gz \
    --drop \
    --sslCAFile rds-combined-ca-bundle.pem   ```

---

If you want to dump and restore within the restore pod

1. dump the complete database 

   ```bash
   mongodump  --host "mongo-0.mongo,mongo-1.mongo" --port 27017 -d chronas-api  -o /home/dump
   ```

2. restore the database

   ```bash
   mongorestore --host mongo-0.mongo,mongo-1.mongo --port 27017 --drop -d chronas-api /home/dump
   ```
