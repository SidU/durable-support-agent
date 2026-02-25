import { NextResponse } from 'next/server';
import { getContainer } from '@/lib/cosmos';

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
