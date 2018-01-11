#!/bin/bash

kubectl create -f mongo-deployment.yml
kubectl create -f mongo-service.yml
kubectl create -f chronas-map.yml
kubectl create -f chronas-front-deployment.yml
kubectl create -f chronas-front-service.yml
