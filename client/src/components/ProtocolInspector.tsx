import React, { useState } from 'react';
import { InspectorState } from '../types';
import { Check, Copy, Eye, Terminal } from 'lucide-react';

interface ProtocolInspectorProps {
  inspector: InspectorState | null;
}

export const ProtocolInspector: React.FC<ProtocolInspectorProps> = ({ inspector }) => {
  const [copiedCurl, setCopiedCurl] = useState(false);

  if (!inspector) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <Eye size={20} />
        </div>
        <p>No HTTP transactions recorded yet. Run a free analysis or request a debug report to inspect live headers.</p>
      </div>
    );
  }

  const is402 = inspector.status === 402;
  const is200 = inspector.status === 200;

  // Build copyable curl
  const curlHeaders = Object.entries(inspector.requestHeaders)
    .map(([k, v]) => `-H "${k}: ${v}"`)
    .join(' ');
  const curlCmd = `curl -i -X ${inspector.method} "http://localhost:8787${inspector.url}" ${curlHeaders} -d '${JSON.stringify(inspector.requestBody)}'`;

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(curlCmd);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Top summary row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="status-pill" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
            {inspector.method}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: '#e2e8f0' }}>
            {inspector.url}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Time: {inspector.timestamp}</span>
          <div
            className="http-status-tag"
            style={{
              backgroundColor: is402 ? 'var(--status-402-bg)' : is200 ? 'var(--status-live-bg)' : 'var(--status-error-bg)',
              color: is402 ? '#38bdf8' : is200 ? '#34d399' : '#f87171',
              borderColor: is402 ? 'rgba(56, 189, 248, 0.4)' : is200 ? 'rgba(52, 211, 153, 0.4)' : 'rgba(248, 113, 113, 0.4)',
            }}
          >
            HTTP {inspector.status} {inspector.statusText}
          </div>
        </div>
      </div>

      {/* Copyable curl command */}
      <div className="code-block-container">
        <div className="code-block-header">
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Terminal size={12} />
            Reproduce Request via curl
          </span>
          <button type="button" className="copy-btn" onClick={handleCopyCurl}>
            {copiedCurl ? <Check size={12} style={{ color: '#34d399' }} /> : <Copy size={12} />}
            {copiedCurl ? 'Copied' : 'Copy curl'}
          </button>
        </div>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{curlCmd}</pre>
      </div>

      {/* Headers split */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Request Headers */}
        <div className="code-block-container">
          <div className="code-block-header">
            <span>Request Headers</span>
          </div>
          <pre>{JSON.stringify(inspector.requestHeaders, null, 2)}</pre>
        </div>

        {/* Response Headers */}
        <div className="code-block-container">
          <div className="code-block-header">
            <span>Response Headers</span>
          </div>
          <pre>{JSON.stringify(inspector.responseHeaders, null, 2)}</pre>
        </div>
      </div>

      {/* Bodies */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="code-block-container">
          <div className="code-block-header">
            <span>Request Body (JSON)</span>
          </div>
          <pre>{JSON.stringify(inspector.requestBody, null, 2)}</pre>
        </div>

        <div className="code-block-container">
          <div className="code-block-header">
            <span>Response Body (JSON)</span>
          </div>
          <pre>{JSON.stringify(inspector.responseBody, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
};
