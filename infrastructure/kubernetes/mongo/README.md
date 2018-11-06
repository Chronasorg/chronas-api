To create the mongo statefull set run

```bash
kubectl apply -f mongo-statefulset.yml
```

to connect to the cluster in kubernetes do a port forward of one port to your localhost using

```bash
kubectl port-forward mongo-0 27017
```

and connect to your localhost using e.g. robomongo