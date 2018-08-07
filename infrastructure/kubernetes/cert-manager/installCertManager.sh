kubectl create serviceaccount -n kube-system tiller
kubectl create clusterrolebinding tiller-binding --clusterrole=cluster-admin --serviceaccount kube-system:tiller
helm init --service-account tiller
helm install --name my-release stable/cert-manager --set rbac.create=false
kubectl create -f letsencryp-clusterissuer-prod.yaml
kubectl create -f chronas-api-certificate.yml