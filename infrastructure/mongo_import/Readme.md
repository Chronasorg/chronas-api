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
