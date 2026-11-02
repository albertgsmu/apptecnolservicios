@description('Name prefix used for all Azure resources.')
param namePrefix string = 'jpmantenimiento'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('App Service plan SKU for the backend.')
param appServiceSku string = 'B1'

@description('PostgreSQL admin username.')
param postgresAdminUser string = 'jpadmin'

@secure()
@description('PostgreSQL admin password.')
param postgresAdminPassword string

@secure()
@description('JWT secret used by the backend.')
param jwtSecret string

@description('Frontend origin allowed by CORS. Leave empty to allow all Azure Static Web App defaults.')
param frontendOrigin string = ''

var backendAppName = '${namePrefix}-api'
var appServicePlanName = '${namePrefix}-plan'
var postgresServerName = take(replace('${namePrefix}pg${uniqueString(resourceGroup().id)}', '-', ''), 63)
var staticWebAppName = '${namePrefix}-web'
var postgresConnectionString = 'postgresql://${postgresAdminUser}@${postgresServer.properties.fullyQualifiedDomainName}:5432/jp_mantenimiento?sslmode=require'
var allowedOrigins = empty(frontendOrigin) ? 'https://${staticWebAppName}.azurestaticapps.net' : '${frontendOrigin},https://${staticWebAppName}.azurestaticapps.net'

resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: appServiceSku
    tier: 'Basic'
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: postgresServerName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: postgresAdminUser
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
    availabilityZone: '1'
    createMode: 'Default'
  }
}

resource postgresDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: postgresServer
  name: 'jp_mantenimiento'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource webApp 'Microsoft.Web/sites@2023-01-01' = {
  name: backendAppName
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      alwaysOn: true
      minTlsVersion: '1.2'
      ftpsState: 'FtpsOnly'
      appSettings: [
        {
          name: 'WEBSITES_PORT'
          value: '3000'
        }
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'PORT'
          value: '3000'
        }
        {
          name: 'JWT_SECRET'
          value: jwtSecret
        }
        {
          name: 'ALLOWED_ORIGINS'
          value: allowedOrigins
        }
        {
          name: 'DATABASE_URL'
          value: postgresConnectionString
        }
      ]
      http20Enabled: true
    }
  }
}

resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    repositoryUrl: ''
    branch: 'main'
    buildProperties: {
      appLocation: '/'
      outputLocation: 'dist'
      apiLocation: ''
    }
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
  }
}

output backendUrl string = 'https://${webApp.properties.defaultHostName}'
output frontendUrl string = 'https://${staticWebApp.properties.defaultHostname}'
output postgresHost string = postgresServer.properties.fullyQualifiedDomainName
output postgresDatabaseName string = postgresDatabase.name
