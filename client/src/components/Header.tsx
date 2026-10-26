import React from 'react';
import { CatalogResponse, HealthResponse } from '../types';
import { Bug, ShieldCheck, Zap } from 'lucide-react';

interface HeaderProps {
  health?: HealthResponse;
  catalog?: CatalogResponse;
  loading: boolean;
}

export const Header: React.FC<HeaderProps> = ({ health, catalog, loading }) => {
  const isMock = health?.mode === 'mock';
  const network = health?.network || catalog?.network || 'eip155:84532';
  const paidEndpoint = catalog?.endpoints.find((e) => e.path === '/api/debug/report');
  const priceDisplay = paidEndpoint?.price ? `${parseInt(paidEndpoint.price, 10) / 1_000_000} USDC` : '0.10 USDC';

  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="brand-section">
          <div className="brand-icon">
            <Bug size={18} />
          </div>
          <div>
            <div className="brand-title">
              BugLens
              <span className="protocol-badge">x402 Protocol v2</span>
            </div>
            <div className="brand-subtitle">
              Developer pay-per-request debugging engine & micropayments
            </div>
          </div>
        </div>

        <div className="status-bar">
          {loading ? (
            <div className="status-pill">
              <span className="loading-spinner" style={{ width: 10, height: 10 }} />
              Connecting to server...
            </div>
          ) : (
            <>
              <div className={`status-pill ${isMock ? 'mock' : 'live'}`} title={isMock ? 'Running isolated local mock facilitator' : 'Connected to live testnet facilitator'}>
                <span className="status-indicator-dot" />
                {isMock ? 'Mock Simulator (Local)' : 'Live Facilitator'}
              </div>

              <div className="status-pill" title="Blockchain Network identifier">
                <ShieldCheck size={12} style={{ color: '#60a5fa' }} />
                <span>{network}</span>
              </div>

              <div className="status-pill" title="Price retrieved from server catalog">
                <Zap size={12} style={{ color: '#fbbf24' }} />
                <span>Report Price: {priceDisplay}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
