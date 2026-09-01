import React, { useState } from 'react';
import { useToast } from '../contexts/AppContext';

export default function Governance() {
  const toast = useToast();
  const [approvals, setApprovals] = useState<Record<string, string[]>>({
    'dep-8f4b2a1c': ['0xSecEng99', '0xDataSci22']
  });

  const pendingDeployments = [
    { id: 'dep-99f2e77a', model: 'Vision Edge v2.5.0', region: 'EU-Central', status: 'Pending Approval', required: 3, signedBy: ['0xDataSci22'] },
    { id: 'dep-8f4b2a1c', model: 'Drone Nav v3.3', region: 'Global', status: 'Approved', required: 2, signedBy: ['0xSecEng99', '0xDataSci22'] }
  ];

  const handleSign = (id: string) => {
    toast(`Multi-Sig Cryptographic Signature applied to ${id}`, 'success');
    setApprovals(prev => ({
      ...prev,
      [id]: [...(prev[id] || []), '0xCurrentUser01']
    }));
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="hgi-stroke hgi-shield-02" style={{ color: 'var(--coral)' }} />
            <span className="card-title">Multi-Sig Deployment Governance</span>
          </div>
        </div>
        <div className="card-body">
          <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 14 }}>
            Enterprise deployments require 2-of-3 multi-sig approval before the Aptos smart contract releases the manifest to the edge fleet.
          </p>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Deployment</th>
                  <th>Region</th>
                  <th>Approvals</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingDeployments.map(dep => {
                  const currentSigners = approvals[dep.id] || dep.signedBy;
                  const isApproved = currentSigners.length >= dep.required;
                  const hasSigned = currentSigners.includes('0xCurrentUser01');
                  return (
                    <tr key={dep.id}>
                      <td><strong>{dep.model}</strong><br/><span className="mono" style={{fontSize: 12, opacity: 0.6}}>{dep.id}</span></td>
                      <td>{dep.region}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 600, color: isApproved ? 'var(--green)' : 'var(--amber)' }}>
                            {currentSigners.length}/{dep.required}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Signatures</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${isApproved ? 'badge-green' : 'badge-amber'}`}>
                          {isApproved ? 'Approved (On-Chain)' : 'Pending Signatures'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {!isApproved && !hasSigned ? (
                          <button className="btn btn-primary btn-sm" onClick={() => handleSign(dep.id)}>
                            <i className="hgi-stroke hgi-signature" /> Sign Manifest
                          </button>
                        ) : (
                          <button className="btn btn-sm" disabled>
                            {hasSigned && !isApproved ? 'Signed' : 'Execute Rollout'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
