@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Existing or new Azure App Service name.')
param appName string

@description('Globally unique Key Vault name used for runtime secrets.')
param keyVaultName string

@description('Whether this deployment should grant the App Service managed identity Key Vault Secrets User. Keep false for least-privilege CI; assign the role separately when runtime secrets are introduced.')
param assignKeyVaultSecretsUserRole bool = false

@description('App Service plan name.')
param appServicePlanName string = '${appName}-plan'

@allowed([
  'B1'
  'S1'
  'P0v3'
])
@description('App Service plan SKU. B1 is the cost-conscious default for a production portal.')
param appServicePlanSku string = 'B1'

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: appServicePlanSku
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enablePurgeProtection: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    publicNetworkAccess: 'Enabled'
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: false
    siteConfig: {
      alwaysOn: true
      ftpsState: 'Disabled'
      http20Enabled: true
      linuxFxVersion: 'NODE|24-lts'
      minTlsVersion: '1.2'
      appCommandLine: 'node server.mjs'
      appSettings: [
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'false'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~24'
        }
        {
          name: 'KEY_VAULT_URI'
          value: keyVault.properties.vaultUri
        }
      ]
    }
  }
}

var keyVaultSecretsUserRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '4633458b-17de-408a-b874-0445c86b69e6'
)

resource keyVaultSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (assignKeyVaultSecretsUserRole) {
  name: guid(keyVault.id, webApp.id, keyVaultSecretsUserRoleDefinitionId)
  scope: keyVault
  properties: {
    roleDefinitionId: keyVaultSecretsUserRoleDefinitionId
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output appDefaultHostname string = webApp.properties.defaultHostName
output appPrincipalId string = webApp.identity.principalId
output keyVaultUri string = keyVault.properties.vaultUri
