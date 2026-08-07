import React, { useState, useEffect } from 'react';
import { get } from '../lib/api';

export default function Health() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const d = await get<any>('/api/health');
        setData(d);
      } catch (e) {
        setData({ error: String(e) });
      } finally {
        setLoading(false);
      }
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
        <span className="spin" style={{ width: 24, height: 24, borderWidth: 3, borderTopColor: 'var(--shelby)' }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="hgi-stroke hgi-activity-01" style={{ color: 'var(--green)' }} />
            <span className="card-title">System Health</span>
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {data?.error ? (
              <div style={{ color: 'var(--red)', fontWeight: 600 }}>
                <i className="hgi-stroke hgi-alert-01" style={{ marginRight: 8 }} />
                Failed to load health status
              </div>
            ) : (
              <>
                <div>
                  <div className="form-label">Status</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: data.status === 'ok' ? 'var(--green)' : 'var(--amber)' }}>
                    <div className="dot-live" style={{ background: data.status === 'ok' ? 'var(--green)' : 'var(--amber)', position: 'static' }} />
                    {data.status?.toUpperCase() || 'UNKNOWN'}
                  </div>
                </div>
                <div>
                  <div className="form-label">Service</div>
                  <div style={{ fontWeight: 600 }}>{data.service}</div>
                </div>
                <div>
                  <div className="form-label">Environment</div>
                  <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{data.environment}</div>
                </div>
                <div>
                  <div className="form-label">Commit SHA</div>
                  <div className="mono" style={{ fontWeight: 600 }}>{data.version}</div>
                </div>
                <div>
                  <div className="form-label">Last Updated</div>
                  <div style={{ fontSize: 13, opacity: 0.8 }}>
                    {data.timestamp ? new Date(data.timestamp).toLocaleString() : '—'}
                  </div>
                </div>
              </>
            )}
          </div>
          
          <div style={{ marginTop: 30 }}>
            <div className="form-label">Raw Response</div>
            <pre style={{
              background: 'var(--input-bg)', padding: 16, borderRadius: 8,
              border: '1px solid var(--border)', fontSize: 13, overflowX: 'auto',
              color: 'var(--text-primary)'
            }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
