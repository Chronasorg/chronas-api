#!/bin/bash
kubectl create serviceaccount -n kube-system tiller
kubectl create clusterrolebinding tiller-binding --clusterrole=cluster-admin --serviceaccount kube-system:tiller
helm init --service-account tiller
helm repo update
helm install --name my-release stable/cert-manager --set rbac.create=false

#PWD as a hack to call it from parent script
kubectl create -f $PWD/kubernetes/cert-manager/letsencryp-clusterissuer-prod.yaml
kubectl create -f $PWD/kubernetes/cert-manager/chronas-api-certificate.yml