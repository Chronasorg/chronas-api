az group create --name kubanet --location westus2
az aks create --resource-group kubanet --name myK8sCluster --agent-count 1 --generate-ssh-keys

az group delete --name kubanet --yes

kubectl cluster-info

