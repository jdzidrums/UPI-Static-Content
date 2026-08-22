# GitHub Actions workflow activation

`github-actions-main_upi-static-content.yml` is the production CI/CD workflow for the partner integration portal.

Replace `.github/workflows/main_upi-static-content.yml` with this file in a commit made by a repository administrator or a GitHub credential with Actions workflow-write permission. The current repository credential can publish application code but cannot modify workflow files.

Before merging the activated workflow to `main`:

1. Run `scripts/bootstrap-azure.sh` from an authenticated administrative workstation.
2. Confirm the `production` GitHub Environment and the documented secrets and variables.
3. Open a pull request so the build-and-validation job runs without deploying. Keep `DEPLOY_AZURE` unset until the Azure secrets exist; the bootstrap script enables it automatically.
4. Merge only after the Azure subscription, resource group, globally unique Key Vault name, and App Service name are approved.

The first authorized `main` run can provision App Service and Key Vault when `PROVISION_AZURE=true`, deploy the validated artifact, and smoke-test the home and trust-center routes.
