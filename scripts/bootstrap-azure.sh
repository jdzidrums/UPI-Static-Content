#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="${REPOSITORY:-jdzidrums/UPI-Static-Content}"
AZURE_LOCATION="${AZURE_LOCATION:-westus2}"
AZURE_RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-rg-upi-static-content-prod}"
AZURE_WEBAPP_NAME="${AZURE_WEBAPP_NAME:-UPI-Static-Content}"
AZURE_KEY_VAULT_NAME="${AZURE_KEY_VAULT_NAME:?Set AZURE_KEY_VAULT_NAME to a globally unique Key Vault name}"
EDI_SUPPORT_EMAIL="${EDI_SUPPORT_EMAIL:-edisupport@ultrapro.com}"
BOOKINGS_URL="${BOOKINGS_URL:-https://outlook.office.com/book/Gf5423982311f4b3ab05454634c0d6b7a@ultrapro.com/s/g887hXf47UGAtzwghQraEg2?ismsaljsauthenabled}"
ENTRA_APP_NAME="${ENTRA_APP_NAME:-github-upi-static-content-prod}"

for command in az gh jq; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command not found: $command" >&2
    exit 1
  fi
done

AZURE_SUBSCRIPTION_ID="$(az account show --query id --output tsv)"
AZURE_TENANT_ID="$(az account show --query tenantId --output tsv)"
SUBSCRIPTION_SCOPE="/subscriptions/${AZURE_SUBSCRIPTION_ID}"

az group create \
  --name "$AZURE_RESOURCE_GROUP" \
  --location "$AZURE_LOCATION" \
  --only-show-errors >/dev/null

AZURE_CLIENT_ID="$(az ad app list --display-name "$ENTRA_APP_NAME" --query '[0].appId' --output tsv)"
if [ -z "$AZURE_CLIENT_ID" ]; then
  AZURE_CLIENT_ID="$(az ad app create --display-name "$ENTRA_APP_NAME" --query appId --output tsv)"
fi

AZURE_PRINCIPAL_ID="$(az ad sp show --id "$AZURE_CLIENT_ID" --query id --output tsv 2>/dev/null || true)"
if [ -z "$AZURE_PRINCIPAL_ID" ]; then
  AZURE_PRINCIPAL_ID="$(az ad sp create --id "$AZURE_CLIENT_ID" --query id --output tsv)"
fi

FEDERATED_CREDENTIAL_FILE="$(mktemp)"
trap 'rm -f "$FEDERATED_CREDENTIAL_FILE"' EXIT

jq -n \
  --arg name "github-production-environment" \
  --arg subject "repo:${REPOSITORY}:environment:production" \
  '{name:$name,issuer:"https://token.actions.githubusercontent.com",subject:$subject,description:"GitHub Actions production environment",audiences:["api://AzureADTokenExchange"]}' \
  > "$FEDERATED_CREDENTIAL_FILE"

if ! az ad app federated-credential list --id "$AZURE_CLIENT_ID" --query "[?name=='github-production-environment'] | [0].name" --output tsv | grep -q .; then
  az ad app federated-credential create \
    --id "$AZURE_CLIENT_ID" \
    --parameters "$FEDERATED_CREDENTIAL_FILE" \
    --only-show-errors >/dev/null
fi

az role assignment create \
  --assignee-object-id "$AZURE_PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --role Contributor \
  --scope "$SUBSCRIPTION_SCOPE/resourceGroups/$AZURE_RESOURCE_GROUP" \
  --only-show-errors >/dev/null

gh secret set AZURE_CLIENT_ID --repo "$REPOSITORY" --body "$AZURE_CLIENT_ID"
gh secret set AZURE_TENANT_ID --repo "$REPOSITORY" --body "$AZURE_TENANT_ID"
gh secret set AZURE_SUBSCRIPTION_ID --repo "$REPOSITORY" --body "$AZURE_SUBSCRIPTION_ID"

gh variable set AZURE_RESOURCE_GROUP --repo "$REPOSITORY" --body "$AZURE_RESOURCE_GROUP"
gh variable set AZURE_WEBAPP_NAME --repo "$REPOSITORY" --body "$AZURE_WEBAPP_NAME"
gh variable set AZURE_KEY_VAULT_NAME --repo "$REPOSITORY" --body "$AZURE_KEY_VAULT_NAME"
gh variable set AZURE_LOCATION --repo "$REPOSITORY" --body "$AZURE_LOCATION"
gh variable set EDI_SUPPORT_EMAIL --repo "$REPOSITORY" --body "$EDI_SUPPORT_EMAIL"
gh variable set BOOKINGS_URL --repo "$REPOSITORY" --body "$BOOKINGS_URL"
gh variable set PROVISION_AZURE --repo "$REPOSITORY" --body "true"
gh variable set DEPLOY_AZURE --repo "$REPOSITORY" --body "true"

echo "Azure OIDC and GitHub Actions configuration is ready for ${REPOSITORY}."
echo "The first main-branch deployment will provision/reconcile App Service and Key Vault."
