# https://cert-manager.io/docs/installation/kubernetes/ 

kubectl apply --validate=false -f https://raw.githubusercontent.com/jetstack/cert-manager/release-0.12/deploy/manifests/00-crds.yaml
helm repo add jetstack https://charts.jetstack.io
helm repo update

helm install \
  --name cert-manager \
  --namespace cert-manager \
  --version v0.12.0 \
  jetstack/cert-manager

  kubectl get pods --namespace cert-manager

  