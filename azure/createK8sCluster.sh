
#create westus
az group create --name chronas-k8s --location westus2
az aks create --resource-group chronas-k8s --name myK8sCluster --agent-count 1 --generate-ssh-keys


#create ukwest
az group create --name chronas-k8s --location ukwest
az aks create --resource-group chronas-k8s --name myK8sCluster --agent-count 1 --generate-ssh-keys -s Standard_D1_v2



#get credentials
az aks get-credentials --resource-group=chronas-k8s --name=myK8sCluster
#dashbaord
az aks browse --resource-group chronas-k8s --name myK8sCluster


az group delete --name chronas-k8s --yes

kubectl cluster-info

