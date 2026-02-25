import { CosmosClient, Container } from '@azure/cosmos';

const DB_NAME = process.env.COSMOS_DB_NAME || 'support-agent';
const CONTAINER_NAME = process.env.COSMOS_CONTAINER_NAME || 'cases';

// Singleton Cosmos client — reused across all API routes
let _container: Container | null = null;

export function getContainer(): Container {
  if (!_container) {
    const connectionString = process.env.COSMOS_CONNECTION_STRING;
    if (!connectionString) throw new Error('COSMOS_CONNECTION_STRING not set');
    const client = new CosmosClient(connectionString);
    _container = client.database(DB_NAME).container(CONTAINER_NAME);
  }
  return _container;
}
