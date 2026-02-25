import { NextRequest, NextResponse } from 'next/server';
import { CosmosClient } from '@azure/cosmos';

function getContainer() {
  const connectionString = process.env.COSMOS_CONNECTION_STRING;
  if (!connectionString) throw new Error('COSMOS_CONNECTION_STRING not set');
  const client = new CosmosClient(connectionString);
  return client.database('support-agent').container('cases');
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: caseId } = await params;
    const container = getContainer();

    const { resource: supportCase } = await container.item(caseId, caseId).read();
    if (!supportCase) {
      return NextResponse.json({ error: `Case ${caseId} not found` }, { status: 404 });
    }

    const functionsBaseUrl = process.env.FUNCTIONS_BASE_URL || 'http://localhost:7071';
    const res = await fetch(`${functionsBaseUrl}/api/cases/${caseId}/approve`, {
      method: 'POST',
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Functions API error: ${text}` }, { status: 502 });
    }

    return NextResponse.json({ ok: true, caseId, action: 'approved' });
  } catch (err) {
    console.error('Approve error:', err);
    return NextResponse.json({ error: 'Failed to approve case' }, { status: 500 });
  }
}
