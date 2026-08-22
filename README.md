# Ultra PRO Partner Integration Portal

Partner-facing onboarding information for Ultra PRO EDI, API, and managed file integrations. The site covers the process from first contact through production rollout and includes the Ultra PRO IT Microsoft Bookings experience, timeline guidance, integration examples, privacy guidance, and a controlled trust-document library.

## Local development

Use Node.js 24 or later. There are no third-party runtime dependencies.

```sh
npm test
npm start
```

`npm test` builds `site/` into `dist/` and validates required files, local links, configuration tokens, trust-document references, and common credential patterns. `npm start` serves `dist/` on `http://localhost:8080` by default.

Public configuration can be overridden at build time:

```sh
EDI_SUPPORT_EMAIL="edisupport@ultrapro.com" \
BOOKINGS_URL="https://outlook.office.com/book/.../" \
npm run build
```

## Content safety

- Do not add credentials, certificates, private keys, access tokens, production payloads, customer data, or confidential audit reports to the repository.
- The trust center is driven by `site/data/trust-documents.json`.
- A document may be marked `published` only after the approved public file is added under `site/audits/`.
- Restricted materials stay `controlled` and route requestors to EDI Support. A static site cannot safely enforce an NDA or hide a permanent download credential.
- Certification and compliance claims require evidence and approval before publication.

## GitHub Actions configuration

The replacement deployment workflow is maintained at `ci/github-actions-main_upi-static-content.yml`. Install it as `.github/workflows/main_upi-static-content.yml` using a GitHub credential with Actions workflow-write permission. The deployment uses Microsoft Entra workload identity federation (OIDC); it does not use a publish profile or a long-lived Azure client secret.

GitHub Environment or repository secrets:

| Name | Purpose |
|---|---|
| `AZURE_CLIENT_ID` | Client ID of the Entra application or user-assigned identity trusted by GitHub OIDC |
| `AZURE_TENANT_ID` | Microsoft Entra tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID |

GitHub variables:

| Name | Example / purpose |
|---|---|
| `AZURE_WEBAPP_NAME` | `UPI-Static-Content` |
| `AZURE_RESOURCE_GROUP` | `rg-upi-static-content-prod` |
| `AZURE_KEY_VAULT_NAME` | Globally unique production Key Vault name |
| `AZURE_LOCATION` | `westus2` |
| `EDI_SUPPORT_EMAIL` | `edisupport@ultrapro.com` |
| `BOOKINGS_URL` | Public Ultra PRO IT Microsoft Bookings URL |
| `SITE_URL` | Optional custom domain used by the deployment smoke test |
| `PROVISION_AZURE` | Set to `true` to reconcile `infra/main.bicep` before deployment |
| `DEPLOY_AZURE` | Set to `true` after Azure secrets are configured to enable production deployment |

The repository includes `scripts/bootstrap-azure.sh` to create or reuse the Entra application, add the production-environment federated credential, grant resource-group deployment rights, and set GitHub variables/secrets without copy-and-paste credential handling. It requires authenticated `az` and `gh` sessions and `jq`.

## Azure architecture and secrets

`infra/main.bicep` defines:

- Linux Azure App Service running Node.js 24;
- HTTPS-only configuration, TLS 1.2 minimum, HTTP/2, FTPS disabled, and a hardened static server;
- a system-assigned managed identity;
- Azure Key Vault with RBAC, purge protection, and soft-delete retention; and
- Key Vault Secrets User access for the App Service managed identity.

The current static portal has no runtime secret. Public values such as the support address and Bookings URL are GitHub variables and are expected to be visible in the deployed HTML. Future runtime credentials must be placed in Key Vault and read server-side through managed identity. Never inject a Key Vault secret into client-side HTML or JavaScript.

## Deployment flow

1. Pull requests build and validate the site.
2. A merge to `main` rebuilds the exact deployment artifact; Azure deployment runs only when `DEPLOY_AZURE=true`.
3. GitHub requests a short-lived Azure token through OIDC.
4. If `PROVISION_AZURE=true`, Bicep reconciles App Service, managed identity, and Key Vault.
5. The zip package deploys to the Production slot.
6. The workflow smoke-tests the home page and trust center.

The workflow follows current Microsoft guidance to use OIDC for GitHub-to-Azure authentication and managed identity for App Service-to-Key Vault access.

## Document downloads

The partner workflow PDF and DOCX are maintained in `site/downloads/` so the deployed site can offer the same approved onboarding content. Regenerate and visually verify both formats before replacement.
