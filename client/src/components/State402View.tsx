import React, { useState } from 'react';
import { PaymentRequiredResponse } from '../types';
import { Check, Copy, CreditCard, Lock, Terminal } from 'lucide-react';

interface State402ViewProps {
  paymentRequired: PaymentRequiredResponse;
  isMockMode: boolean;
  onMockPay: () => void;
  isPaying: boolean;
}

export const State402View: React.FC<State402ViewProps> = ({
  paymentRequired,
  isMockMode,
  onMockPay,
  isPaying,
}) => {
  const [copied, setCopied] = useState(false);
  const requirement = paymentRequired.requirements?.accepts?.[0];
  const cliCommand = 'npm run pay-client --workspace=server';

  const handleCopy = () => {
    navigator.clipboard.writeText(cliCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="state-402-banner">
      <div className="state-402-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="http-status-tag">HTTP 402 PAYMENT REQUIRED</div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
            Resource Gated by x402 Protocol
          </span>
        </div>
        <Lock size={16} style={{ color: '#38bdf8' }} />
      </div>

      <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.4 }}>
        The detailed AI debugging report is a discrete paid operation. The server returned an authentic
        HTTP 402 response containing machine-readable payment constraints.
      </p>

      {/* Decoded requirements */}
      {requirement && (
        <div className="code-block-container" style={{ margin: '4px 0' }}>
          <div className="code-block-header">
            <span>Decoded x402 Payment Constraints</span>
            <span>Version: {paymentRequired.requirements.x402Version}</span>
          </div>
          <table className="requirements-table">
            <tbody>
              <tr>
                <td>Resource</td>
                <td>{requirement.resource}</td>
              </tr>
              <tr>
                <td>Target Network</td>
                <td>{requirement.network}</td>
              </tr>
              <tr>
                <td>Asset Contract</td>
                <td style={{ wordBreak: 'break-all' }}>{requirement.asset}</td>
              </tr>
              <tr>
                <td>Amount Required</td>
                <td>
                  <strong>{parseInt(requirement.maxAmountRequired, 10) / 1_000_000} USDC</strong>{' '}
                  ({requirement.maxAmountRequired} atomic units)
                </td>
              </tr>
              <tr>
                <td>Recipient (Pay-To)</td>
                <td style={{ wordBreak: 'break-all' }}>{requirement.payTo}</td>
              </tr>
              <tr>
                <td>Authorization Scheme</td>
                <td>{requirement.scheme}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Action based on mode */}
      <div style={{ marginTop: 8 }}>
        {isMockMode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: '#fbbf24' }}>
              <strong>Local Development Mode Active:</strong> You can exercise the complete x402 flow
              (402 &rarr; sign &rarr; verify &rarr; settle &rarr; report) via the isolated Mock Facilitator.
            </div>
            <button
              type="button"
              className="btn btn-mock-pay"
              onClick={onMockPay}
              disabled={isPaying}
            >
              {isPaying ? <span className="loading-spinner" /> : <CreditCard size={15} />}
              Simulate x402 Payment & Unlock Report (Mock)
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: '#34d399' }}>
              <strong>Live Network Mode:</strong> Sign the payment using your funded testnet wallet.
              To preserve security, private keys are never handled in the browser.
            </div>
            <div className="code-block-container">
              <div className="code-block-header">
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Terminal size={12} />
                  CLI Payment Command (with local .env key)
                </span>
                <button type="button" className="copy-btn" onClick={handleCopy}>
                  {copied ? <Check size={12} style={{ color: '#34d399' }} /> : <Copy size={12} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre>{cliCommand}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
