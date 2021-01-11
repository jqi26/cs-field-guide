#!/bin/bash

# Stage 1 must be done in advance

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
