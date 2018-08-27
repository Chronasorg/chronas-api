#!/bin/bash

helm install stable/nginx-ingress --namespace kube-system --set rbac.create=false --set controller.service.externalTrafficPolicy=Local

#PWD as hack to execute it from parent file
kubectl apply -f $PWD/kubernetes/ingress/chronas-api-ingress.yml
