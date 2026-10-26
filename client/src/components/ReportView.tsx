import React, { useState } from 'react';
import { Report } from '../types';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  HelpCircle,
  MapPin,
  ShieldAlert,
  Wrench,
} from 'lucide-react';

interface ReportViewProps {
  report: Report;
}

export const ReportView: React.FC<ReportViewProps> = ({ report }) => {
  const [copiedCode, setCopiedCode] = useState(false);

  const handleCopyCode = () => {
    if (report.suggestedFix.codeExample?.code) {
      navigator.clipboard.writeText(report.suggestedFix.codeExample.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const isMockReceipt = report.receipt.mode === 'mock';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Receipt Badge Header */}
      <div className="receipt-card">
        <div className="receipt-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`receipt-badge ${isMockReceipt ? 'mock' : 'live'}`}>
              {isMockReceipt ? 'Mock payment (no blockchain)' : 'Testnet settlement'}
            </span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              Network: <strong>{report.receipt.network}</strong>
            </span>
          </div>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            Source: {report.source === 'ai' ? `AI (${report.model})` : 'Deterministic Mock Template'}
          </span>
        </div>

        {report.receipt.payer && (
          <div style={{ fontSize: 11, color: '#94a3b8', wordBreak: 'break-all' }}>
            Payer: <code>{report.receipt.payer}</code>
          </div>
        )}

        {report.receipt.transaction ? (
          <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: '#34d399' }}>
            <span>Tx Hash: {report.receipt.transaction}</span>
            <ExternalLink size={12} />
          </div>
        ) : (
          <div style={{ fontSize: 11, color: '#64748b' }}>
            Transaction Hash: <em>null (isolated local mock mode)</em>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="form-group">
        <label className="form-label">Diagnostic Summary</label>
        <div style={{ padding: '12px 14px', background: 'var(--bg-code)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', lineHeight: 1.5 }}>
          {report.summary}
        </div>
      </div>

      {/* Root Cause Analysis: Confirmed Facts vs Hypotheses */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group">
          <label className="form-label" style={{ color: '#34d399' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={13} />
              Confirmed Facts
            </span>
          </label>
          <div className="check-list">
            {report.rootCause.confirmed.map((fact, idx) => (
              <div key={idx} className="check-item">
                <span className="check-bullet">&bull;</span>
                <span>{fact}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" style={{ color: '#fbbf24' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <HelpCircle size={13} />
              Hypotheses
            </span>
          </label>
          <div className="check-list">
            {report.rootCause.hypotheses.map((hyp, idx) => (
              <div key={idx} className="check-item">
                <span className="check-bullet" style={{ color: '#fbbf24' }}>?</span>
                <span>{hyp}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Location */}
      {report.location && (
        <div className="form-group">
          <label className="form-label">
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={13} style={{ color: '#f87171' }} />
              Offending Code Location
            </span>
          </label>
          <div className="frame-item">
            <span className="frame-file">{report.location.file}</span>
            <span className="frame-loc">Line {report.location.line}</span>
          </div>
          <span style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
            Basis: {report.location.basis}
          </span>
        </div>
      )}

      {/* Step-by-step debugging checklist */}
      <div className="form-group">
        <label className="form-label">
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Wrench size={13} />
            Step-by-Step Debugging Plan
          </span>
        </label>
        <div className="check-list">
          {report.debuggingSteps.map((step, idx) => (
            <div key={idx} className="check-item">
              <span style={{ fontWeight: 700, color: '#60a5fa', minWidth: 20 }}>
                {idx + 1}.
              </span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Suggested fix */}
      <div className="form-group">
        <label className="form-label">Suggested Fix & Implementation</label>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 8, lineHeight: 1.5 }}>
          {report.suggestedFix.explanation}
        </p>

        {report.suggestedFix.codeExample && (
          <div className="code-block-container">
            <div className="code-block-header">
              <span>{report.suggestedFix.codeExample.language} Fix Proposal</span>
              <button type="button" className="copy-btn" onClick={handleCopyCode}>
                {copiedCode ? <Check size={12} style={{ color: '#34d399' }} /> : <Copy size={12} />}
                {copiedCode ? 'Copied' : 'Copy Code'}
              </button>
            </div>
            <pre>{report.suggestedFix.codeExample.code}</pre>
          </div>
        )}

        <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
          <strong>Why this fix resolves it:</strong> {report.suggestedFix.whyItHelps}
        </div>

        {/* Mandatory Honesty Rule: Not executed or verified */}
        <div className="verified-disclaimer" style={{ marginTop: 8 }}>
          <ShieldAlert size={14} style={{ color: '#fbbf24', flexShrink: 0 }} />
          <span>
            <strong>Execution Status:</strong> <code>executed: {String(report.suggestedFix.executed)}</code> &mdash; Not executed or verified. Code suggestions must be tested prior to production deployment.
          </span>
        </div>
      </div>

      {/* Verification steps */}
      <div className="form-group">
        <label className="form-label">Verification & Test Cases</label>
        <div className="check-list">
          {report.verification.map((v, idx) => (
            <div key={idx} className="check-item">
              <CheckCircle2 size={14} style={{ color: '#34d399', flexShrink: 0, marginTop: 2 }} />
              <span>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Alternative causes */}
      {report.alternativeCauses.length > 0 && (
        <div className="form-group">
          <label className="form-label">
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={13} style={{ color: '#f59e0b' }} />
              Alternative Causes (If Evidence Is Insufficient)
            </span>
          </label>
          <div className="check-list">
            {report.alternativeCauses.map((cause, idx) => (
              <div key={idx} className="check-item">
                <span className="check-bullet" style={{ color: '#f59e0b' }}>&bull;</span>
                <span>{cause}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
