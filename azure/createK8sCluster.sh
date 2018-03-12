#!/bin/bash
resourceGroupName='chronasdev'
cosmosDbName='chronasapi'
aksClusterName='chronask8sdev'
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
#az aks browse --resource-group $resourceGroupName --name $aksClusterName

#az group delete --name $resourceGroupName  --yes~                                                         
