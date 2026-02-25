import { NextRequest, NextResponse } from 'next/server';
import { getContainer } from '@/lib/cosmos';

const VALID_ACTIONS = ['approve', 'reject'] as const;
type Action = (typeof VALID_ACTIONS)[number];

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; action: string }> }) {
  try {
    const { id: caseId, action } = await params;

    if (!VALID_ACTIONS.includes(action as Action)) {
      return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
    }

    const container = getContainer();
    const { resource: supportCase } = await container.item(caseId, caseId).read();
    if (!supportCase) {
      return NextResponse.json({ error: `Case ${caseId} not found` }, { status: 404 });
    }

    const functionsBaseUrl = process.env.FUNCTIONS_BASE_URL || 'http://localhost:7071';
    const res = await fetch(`${functionsBaseUrl}/api/cases/${caseId}/${action}`, {
      method: 'POST',
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Functions API error: ${text}` }, { status: 502 });
    }

    const pastTense = action === 'approve' ? 'approved' : 'rejected';
    return NextResponse.json({ ok: true, caseId, action: pastTense });
  } catch (err) {
    console.error('Case action error:', err);
    return NextResponse.json({ error: 'Failed to process case' }, { status: 500 });
  }
}
