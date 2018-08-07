#!/bin/bash
host=tempchronasapi.documents.azure.com
user=tempchronasapi
password=N2Rn45wvSdzaqhhYoXZjNYAColQ6A8LMFqOtfdtXzfSf1REuOAMFLtCdPwgsgwVYehkxEQ9mRjOp7wyHYjko5A==

#mongorestore --host $host:10255 -u $user -p $password --ssl --sslAllowInvalidCertificates --numInsertionWorkers 1 --batchSize 24 --drop --db chronas-api chronas-api

#mongorestore --host $host:10255 -u $user -p $password --ssl --sslAllowInvalidCertificates --numInsertionWorkers 1 --batchSize 24 --drop --db chronas-api chronas-api
mongoimport --host $host:10255 -u $user -p $password --ssl --sslAllowInvalidCertificates --jsonArray --db chronas-api --collection chronas-api --file chronas-api/areas.metadata.json --numInsertionWorkers 4 --batchSize 24