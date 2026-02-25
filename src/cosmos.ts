import { CosmosClient, Container } from '@azure/cosmos';
import { SupportCase } from './types.js';

const DB_NAME = process.env.COSMOS_DB_NAME || 'support-agent';
const CONTAINER_NAME = process.env.COSMOS_CONTAINER_NAME || 'cases';

let container: Container;

export function initCosmos() {
  const connectionString = process.env.COSMOS_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('COSMOS_CONNECTION_STRING environment variable is required');
  }

  const client = new CosmosClient(connectionString);
  const database = client.database(DB_NAME);
  container = database.container(CONTAINER_NAME);
}

export async function createCase(supportCase: SupportCase): Promise<void> {
  await container.items.create(supportCase);
}

export async function getCase(caseId: string): Promise<SupportCase | undefined> {
  try {
    const { resource } = await container.item(caseId, caseId).read<SupportCase>();
    return resource;
  } catch {
    return undefined;
  }
}

export async function updateCase(caseId: string, updates: Partial<SupportCase>): Promise<void> {
  const existing = await getCase(caseId);
  if (!existing) throw new Error(`Case ${caseId} not found`);

  const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  await container.item(caseId, caseId).replace(updated);
}

export async function getPendingCases(): Promise<SupportCase[]> {
  const { resources } = await container.items
    .query<SupportCase>({
      query: "SELECT * FROM c WHERE c.status = 'pending_approval' ORDER BY c.createdAt DESC",
    })
    .fetchAll();
  return resources;
}
