'use client';

import { useEffect, useState } from 'react';

interface SupportCase {
  id: string;
  userName: string;
  orderId: string;
  action: 'refund' | 'escalation';
  refundAmount?: number;
  issueDescription: string;
  createdAt: string;
  status: string;
}

export default function DashboardPage() {
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  async function fetchCases() {
    try {
      const res = await fetch('/api/cases');
      if (res.ok) {
        const data = await res.json();
        setCases(data);
      }
    } catch (err) {
      console.error('Failed to fetch cases:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCases();
    const interval = setInterval(fetchCases, 5000);
    return () => clearInterval(interval);
  }, []);

  async function handleAction(caseId: string, action: 'approve' | 'reject') {
    setActionInProgress(caseId);
    try {
      const res = await fetch(`/api/cases/${caseId}/${action}`, { method: 'POST' });
      if (res.ok) {
        setCases((prev) => prev.filter((c) => c.id !== caseId));
      } else {
        const err = await res.json();
        alert(`Failed to ${action}: ${err.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`Failed to ${action}: ${err}`);
    } finally {
      setActionInProgress(null);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString();
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginBottom: 8 }}>Support Agent Dashboard</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Pending cases requiring supervisor approval. Auto-refreshes every 5 seconds.
      </p>

      {loading ? (
        <p>Loading...</p>
      ) : cases.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, backgroundColor: '#fff', borderRadius: 8, border: '1px solid #e0e0e0' }}>
          <p style={{ fontSize: 18, color: '#999' }}>No pending cases</p>
          <p style={{ color: '#bbb' }}>Cases will appear here when customers request refunds or escalations.</p>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #e0e0e0' }}>
              <th style={thStyle}>Case ID</th>
              <th style={thStyle}>Customer</th>
              <th style={thStyle}>Order</th>
              <th style={thStyle}>Action</th>
              <th style={thStyle}>Amount</th>
              <th style={thStyle}>Description</th>
              <th style={thStyle}>Created</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid #e0e0e0' }}>
                <td style={tdStyle}><code>{c.id}</code></td>
                <td style={tdStyle}>{c.userName}</td>
                <td style={tdStyle}>{c.orderId || '—'}</td>
                <td style={tdStyle}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    backgroundColor: c.action === 'refund' ? '#fff3cd' : '#f8d7da',
                    color: c.action === 'refund' ? '#856404' : '#721c24',
                  }}>
                    {c.action}
                  </span>
                </td>
                <td style={tdStyle}>{c.refundAmount ? `$${c.refundAmount.toFixed(2)}` : '—'}</td>
                <td style={{ ...tdStyle, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.issueDescription}
                </td>
                <td style={tdStyle}>{formatDate(c.createdAt)}</td>
                <td style={tdStyle}>
                  <button
                    onClick={() => handleAction(c.id, 'approve')}
                    disabled={actionInProgress === c.id}
                    style={{ ...btnStyle, backgroundColor: '#28a745', color: '#fff', marginRight: 8 }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleAction(c.id, 'reject')}
                    disabled={actionInProgress === c.id}
                    style={{ ...btnStyle, backgroundColor: '#dc3545', color: '#fff' }}
                  >
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: 13,
  fontWeight: 600,
  color: '#555',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 14,
};

const btnStyle: React.CSSProperties = {
  padding: '6px 16px',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};
