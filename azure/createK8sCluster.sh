
#create westus
az group create --name chronas-k8s --location westus2
az aks create --resource-group chronas-k8s --name myK8sCluster --agent-count 1 --generate-ssh-keys


#create ukwest - not working
az group create --name chronas-k8s --location ukwest
az aks create --resource-group chronas-k8s --name myK8sCluster --agent-count 1 --generate-ssh-keys


#get credentials
az aks get-credentials --resource-group=chronas-k8s --name=myK8sCluster
#dashbaord
az aks browse --resource-group chronas-k8s --name myK8sCluster


az group delete --name chronas-k8s --yes

#TODO
#write mongo db data to disk
#api port change to 80
#rework dockerfiles
#check how to update existing pods