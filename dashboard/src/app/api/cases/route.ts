import { NextResponse } from 'next/server';
import { CosmosClient } from '@azure/cosmos';

function getContainer() {
  const connectionString = process.env.COSMOS_CONNECTION_STRING;
  if (!connectionString) throw new Error('COSMOS_CONNECTION_STRING not set');
  const client = new CosmosClient(connectionString);
  return client.database('support-agent').container('cases');
}

export async function GET() {
  try {
    const container = getContainer();
    const { resources } = await container.items
      .query({
        query: "SELECT * FROM c WHERE c.status = 'pending_approval' ORDER BY c.createdAt DESC",
      })
      .fetchAll();

    return NextResponse.json(resources);
  } catch (err) {
    console.error('Failed to fetch cases:', err);
    return NextResponse.json({ error: 'Failed to fetch cases' }, { status: 500 });
  }
}
