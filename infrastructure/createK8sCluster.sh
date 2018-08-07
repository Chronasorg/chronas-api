#!/bin/bash
resourceGroupName='chronasdev'
cosmosDbName='chronasapi'
aksClusterName='chronask8sdev'
#create cluster in westeu
az group create --name $resourceGroupName --location westeurope
#az aks create --resource-group $resourceGroupName --name $aksClusterName --node-count 2 --enable-addons monitoring --generate-ssh-keys -s Standard_DS1_v2 --kubernetes-version 1.10.6
#az aks get-credentials --resource-group $resourceGroupName --name $aksClusterName

echo 'create ingress'
bash $PWD/kubernetes/ingress/deployIngress.sh

echo 'create lets encrypt cert manager'
bash $PWD/kubernetes/cert-manager/installCertManager.sh

echo 'provision mongodb'
kubectl apply -f $PWD/kubernetes/mongo/mongo-statefulset.yml

#az cosmosdb create \
#        --name $cosmosDbName \
#        --kind MongoDB \
#        --resource-group $resourceGroupName \
#        --max-interval 10 \
#        --max-staleness-prefix 200

#az cosmosdb list-connection-strings \
#        --name $cosmosDbName \
#         --resource-group $resourceGroupName


#dashbaord
#az aks browse --resource-group $resourceGroupName --name $aksClusterName

#az group delete --name $resourceGroupName  --yes                                                     
