#!/bin/bash

helm install stable/nginx-ingress --namespace kube-system --set controller.service.externalTrafficPolicy=Local
