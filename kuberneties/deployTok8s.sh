#!/bin/bash

#kubectl create -f mongo-deployment.yml
#kubectl create -f mongo-service.yml
kubectl apply -f chronas-secret.yml
kubectl apply -f chronas-map.yml
kubectl apply -f chronas-front-deployment.yml
kubectl apply -f chronas-front-service.yml