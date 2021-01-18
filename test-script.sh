#!/bin/bash

# Remove all
minikube delete --all

# Stage 1: Ready minikube
minikube start
minikube ssh << END
pwd
mkdir cs-field-guide
mkdir cs-field-guide/csfieldguide
exit
END

# Stage 2: Provide project context
docker-compose build
docker-compose up --remove-orphans
scp -i $(minikube ssh-key) -r csfieldguide/* docker@$(minikube ip):/home/docker/cs-field-guide/csfieldguide/

# Stage 3: Configure cluster
minikube addons enable ingress
kubectl apply -f test-config-secrets.yaml
kubectl apply -f test-config-volumes.yaml
kubectl apply -f test-config-postgres.yaml
kubectl apply -f test-config-django.yaml
kubectl apply -f test-config-ingress.yaml
minikube dashboard
