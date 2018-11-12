#### MongoDB database backup

We use an container which backups the database to an Azure Blob Storage account once a day

The solutionis based on mgob: https://github.com/stefanprodan/mgob/tree/master/k8s

To create the backup do the following:

1. replace in "gob-azure-cfg.yaml" the value of "connectionString" to your azure BlobStorage

2. Run this command to create the config

3. ```bash
   kubectl apply -f ./mgob-azure-cfg.yaml
   ```

3. Run this command to create the container which does the backup

4. ```bash
   kubectl apply -f ./mgob-azure-dep.yaml
   ```

4. After some minutes check the logs of the container if everything is fine

```bash
kubectl logs -f mgob-0 
```