#!/bin/bash
resourceGroupName='chronas-k8s1'
cosmosDbName='chronas-api-test1'
aksClusterName='chronask8sCluster1'
#create westeu
az group create --name $resourceGroupName --location westeurope
az aks create --resource-group $resourceGroupName --name $aksClusterName --node-count 1 --generate-ssh-keys -s Standard_D1_v2
az aks get-credentials --resource-group $resourceGroupName --name $aksClusterName

az cosmosdb create \
	--name $cosmosDbName \
	--kind MongoDB \
	--resource-group $resourceGroupName \
	--max-interval 10 \
	--max-staleness-prefix 200

az cosmosdb list-connection-strings \
	--name $cosmosDbName \
	--resource-group $resourceGroupName 


#dashbaord
#az aks browse --resource-group chronas-k8s --name myK8sCluster

#az group delete --name 'chronas-k8s-dev' --yes