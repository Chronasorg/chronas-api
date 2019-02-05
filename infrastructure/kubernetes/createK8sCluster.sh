#!/bin/bash
resourceGroupName='chronas'
aksClusterName='chronas'
aksLocation=westeurope
latestVersion=1.12.4

#create cluster in westeu
az group create --name $resourceGroupName --location $aksLocation

echo "Getting latest kubernetes version"

echo "Creating kubernetes service $aksClusterName in $aksLocation"
az aks create --resource-group $resourceGroupName --name $aksClusterName --location $aksLocation --node-count 2 --node-vm-size Standard_DS2_v2 \
--kubernetes-version $latestVersion --generate-ssh-keys

echo "Waiting provision to complete"
az aks wait -g $resourceGroupName -n $aksClusterName --created --interval 60 --timeout 1800
az aks get-credentials --resource-group $resourceGroupName --name $aksClusterName

return
echo "Creating helm config"
kubectl apply -f $PWD/helm-rbac.yaml
#wait for helm to run
sleep 2m

echo "Initiliaze helm"
helm init --service-account tiller

echo "Install ngnix ingress"
helm install stable/nginx-ingress --namespace kube-system --set controller.replicaCount=2 --set controller.service.externalTrafficPolicy=Local

sleep 2m

echo 'create ingress'
#bash $PWD/kubernetes/ingress/deployIngress.sh

echo 'create lets encrypt cert manager'
bash $PWD/cert-manager/installCertManager.sh

echo 'provision mongodb'
kubectl apply -f $PWD/mongo/mongo-statefulset.yml

echo 'check if secretes exist'
kubectl get secrets



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
