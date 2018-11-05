1. add the files you want to restore in the "dump" directory of this folder
2. rebuild and push the image to this repo "aumanjoa/helper:mongorestore"
3. run this command to run the container in the cluster

```bash
kubectl run -i --tty --attach restore --image=aumanjoa/helper:mongorestore
```

4. connect to the container with 

```bash
kubectl exec -it [POD_NAME] /bin/bash
```

5. run this commands inside the container:

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
