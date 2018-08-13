#!/bin/bash

kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/master/deploy/mandatory.yaml
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/master/deploy/provider/cloud-generic.yaml

#PWD as hack to execute it from parent file
kubectl apply -f $PWD/kubernetes/ingress/chronas-api-ingress.yml