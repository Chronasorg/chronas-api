az group create --name chronas-k8s --location westus2
az aks create --resource-group chronas-k8s --name myK8sCluster --agent-count 1 --generate-ssh-keys

az aks get-credentials --resource-group=chronas-k8s --name=myK8sCluster


az group delete --name kubanet --yes

kubectl cluster-info

