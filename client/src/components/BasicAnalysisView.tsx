import React from 'react';
import { BasicAnalysis } from '../types';
import { CheckCircle2, FileCode, Info, ShieldCheck } from 'lucide-react';

interface BasicAnalysisViewProps {
  analysis: BasicAnalysis;
}

export const BasicAnalysisView: React.FC<BasicAnalysisViewProps> = ({ analysis }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top summary row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="status-pill" style={{ color: '#60a5fa' }}>
          <span>Language:</span>
          <strong>{analysis.detectedLanguage}</strong>
        </div>

        {analysis.errorType && (
          <div className="status-pill" style={{ color: '#f87171', borderColor: 'rgba(248, 113, 113, 0.3)' }}>
            <span>Type:</span>
            <strong>{analysis.errorType}</strong>
          </div>
        )}

        <div className="status-pill" style={{ color: '#34d399' }}>
          <ShieldCheck size={12} />
          <span>Redactions:</span>
          <strong>{analysis.redactions} secrets scrubbed</strong>
        </div>
      </div>

      {/* Extracted stack frames */}
      <div className="form-group">
        <label className="form-label">
          <span>
            <FileCode size={13} style={{ display: 'inline', marginRight: 4 }} />
            Extracted Application Frames ({analysis.frames.length})
          </span>
        </label>
        {analysis.frames.length > 0 ? (
          <div className="frames-list">
            {analysis.frames.map((frame, idx) => (
              <div key={idx} className="frame-item">
                <span className="frame-file">{frame.file}</span>
                <span className="frame-loc">
                  Line {frame.line}
                  {frame.column ? `:${frame.column}` : ''}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 20 }}>
            <span>No explicit file:line stack frames detected in provided trace.</span>
          </div>
        )}
      </div>

      {/* Static knowledge hints */}
      <div className="form-group">
        <label className="form-label">
          <span>Static Pattern Hints</span>
        </label>
        <div className="check-list">
          {analysis.hints.map((hint, idx) => (
            <div key={idx} className="check-item">
              <CheckCircle2 size={15} style={{ color: '#3b82f6', flexShrink: 0, marginTop: 2 }} />
              <span>{hint}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Normalized trace preview */}
      <div className="form-group">
        <label className="form-label">Normalized Trace (Secret-Redacted)</label>
        <div className="code-block-container">
          <pre>{analysis.normalizedTrace}</pre>
        </div>
      </div>

      {/* Limitations disclosure */}
      <div className="secrets-warning" style={{ background: 'rgba(59, 130, 246, 0.08)', borderColor: 'rgba(59, 130, 246, 0.25)', color: '#93c5fd' }}>
        <Info size={16} style={{ flexShrink: 0 }} />
        <p>
          <strong>Free Diagnostic Limitations:</strong> {analysis.limitations}
        </p>
      </div>
    </div>
  );
};
