#!/bin/bash
echo $MONGO_URI
mongorestore --uri $MONGO_URI --drop /home/dump/
echo "restore done"