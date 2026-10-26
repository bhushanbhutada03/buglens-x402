import React, { useEffect, useState } from 'react';
import {
  BasicAnalysis,
  CatalogResponse,
  HealthResponse,
  InspectorState,
  PaymentRequiredResponse,
  Report,
} from './types';
import { fetchCatalog, fetchHealth, requestPaidReport, runBasicAnalysis } from './api';
import { Header } from './components/Header';
import { InputPane } from './components/InputPane';
import { BasicAnalysisView } from './components/BasicAnalysisView';
import { State402View } from './components/State402View';
import { ReportView } from './components/ReportView';
import { ProtocolInspector } from './components/ProtocolInspector';
import { AlertCircle, Bug, CheckCircle2, Eye, FileText, Lock } from 'lucide-react';

export const App: React.FC = () => {
  // Input state
  const [language, setLanguage] = useState('javascript');
  const [errorText, setErrorText] = useState(
    `TypeError: Cannot read properties of undefined (reading 'avatar')\n    at renderUserProfile (components/UserProfile.tsx:42:26)\n    at renderWithHooks (node_modules/react-dom/cjs/react-dom.development.js:14985:18)`
  );
  const [code, setCode] = useState(
    `export function UserProfile({ user }) {\n  return <img src={user.avatar.url} alt="Avatar" />;\n}`
  );
  const [context, setContext] = useState('Occurs on user profile view');

  // Server metadata state
  const [health, setHealth] = useState<HealthResponse | undefined>();
  const [catalog, setCatalog] = useState<CatalogResponse | undefined>();
  const [isServerLoading, setIsServerLoading] = useState(true);

  // Results state
  const [basicAnalysis, setBasicAnalysis] = useState<BasicAnalysis | null>(null);
  const [paymentRequired, setPaymentRequired] = useState<PaymentRequiredResponse | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [inspector, setInspector] = useState<InspectorState | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<'basic' | 'state402' | 'report' | 'inspector'>('basic');

  // Loading & error states
  const [isBasicLoading, setIsBasicLoading] = useState(false);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Initial server metadata fetch
  useEffect(() => {
    async function init() {
      setIsServerLoading(true);
      const [hRes, cRes] = await Promise.all([fetchHealth(), fetchCatalog()]);
      if (hRes.data) setHealth(hRes.data);
      if (cRes.data) setCatalog(cRes.data);
      setIsServerLoading(false);
    }
    init();
  }, []);

  // Compute dynamic price display from catalog
  const paidEndpoint = catalog?.endpoints.find((e) => e.path === '/api/debug/report');
  const priceDisplay = paidEndpoint?.price
    ? `$${(parseInt(paidEndpoint.price, 10) / 1_000_000).toFixed(2)} USDC`
    : '$0.10 USDC';

  const validateInput = (): boolean => {
    if (!errorText.trim()) {
      setValidationError('Please enter or paste an error message or stack trace.');
      return false;
    }
    if (errorText.length > 6000) {
      setValidationError('Error text exceeds maximum allowed length of 6,000 characters.');
      return false;
    }
    if (code.length > 8000) {
      setValidationError('Code snippet exceeds maximum allowed length of 8,000 characters.');
      return false;
    }
    setValidationError(null);
    return true;
  };

  // Run free deterministic basic analysis
  const handleRunBasic = async () => {
    if (!validateInput()) return;
    setIsBasicLoading(true);
    setServerError(null);

    const result = await runBasicAnalysis(
      { language, errorText, code, context },
      (inspection) => setInspector(inspection)
    );

    setIsBasicLoading(false);
    if (result.error) {
      setServerError(result.error);
    } else if (result.data) {
      setBasicAnalysis(result.data);
      setActiveTab('basic');
    }
  };

  // Request paid report (triggers HTTP 402)
  const handleRequestReport = async () => {
    if (!validateInput()) return;
    setIsReportLoading(true);
    setServerError(null);

    const result = await requestPaidReport(
      { language, errorText, code, context },
      undefined,
      (inspection) => setInspector(inspection)
    );

    setIsReportLoading(false);

    if (result.statusCode === 402 && result.paymentRequired) {
      setPaymentRequired(result.paymentRequired);
      setActiveTab('state402');
    } else if (result.error) {
      setServerError(result.error);
    }
  };

  // Simulate mock payment and retry report
  const handleMockPay = async () => {
    if (!paymentRequired) return;
    setIsPaying(true);
    setServerError(null);

    const requirement = paymentRequired.requirements?.accepts?.[0];
    const mockSignaturePayload = {
      x402Version: 2,
      scheme: requirement?.scheme || 'exact',
      network: requirement?.network || health?.network || 'eip155:84532',
      payload: {
        from: '0x1111111111111111111111111111111111111111',
        nonce: '0x' + Date.now().toString(16),
        signature: '0xsimulated_signature_mock_settled',
        amount: requirement?.maxAmountRequired || '100000',
        payTo: requirement?.payTo,
        asset: requirement?.asset,
      },
    };

    const mockHeader = btoa(JSON.stringify(mockSignaturePayload));

    const result = await requestPaidReport(
      { language, errorText, code, context },
      mockHeader,
      (inspection) => setInspector(inspection)
    );

    setIsPaying(false);

    if (result.statusCode === 200 && result.report) {
      setReport(result.report);
      setActiveTab('report');
    } else if (result.error) {
      setServerError(result.error);
    }
  };

  return (
    <div className="app-container">
      <Header health={health} catalog={catalog} loading={isServerLoading} />

      <main className="main-content">
        {/* Left Column: Input Panel */}
        <InputPane
          language={language}
          setLanguage={setLanguage}
          errorText={errorText}
          setErrorText={setErrorText}
          code={code}
          setCode={setCode}
          context={context}
          setContext={setContext}
          onRunBasic={handleRunBasic}
          onRequestReport={handleRequestReport}
          isBasicLoading={isBasicLoading}
          isReportLoading={isReportLoading}
          reportPriceDisplay={priceDisplay}
          validationError={validationError}
        />

        {/* Right Column: Diagnostic & Protocol Workspace */}
        <div className="panel">
          {/* Tabs Navigation */}
          <nav className="tabs-nav" aria-label="Diagnostic workspace tabs">
            <button
              type="button"
              className={`tab-btn ${activeTab === 'basic' ? 'active' : ''}`}
              onClick={() => setActiveTab('basic')}
            >
              <FileText size={14} />
              Free Analysis
              {basicAnalysis && <span className="tab-badge">Active</span>}
            </button>

            <button
              type="button"
              className={`tab-btn ${activeTab === 'state402' ? 'active' : ''}`}
              onClick={() => setActiveTab('state402')}
            >
              <Lock size={14} style={{ color: paymentRequired ? '#38bdf8' : undefined }} />
              402 Requirements
              {paymentRequired && (
                <span className="tab-badge" style={{ backgroundColor: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8' }}>
                  402
                </span>
              )}
            </button>

            <button
              type="button"
              className={`tab-btn ${activeTab === 'report' ? 'active' : ''}`}
              onClick={() => setActiveTab('report')}
            >
              <CheckCircle2 size={14} style={{ color: report ? '#34d399' : undefined }} />
              Debugging Report
              {report && (
                <span className="tab-badge" style={{ backgroundColor: 'rgba(52, 211, 153, 0.2)', color: '#34d399' }}>
                  Unlocked
                </span>
              )}
            </button>

            <button
              type="button"
              className={`tab-btn ${activeTab === 'inspector' ? 'active' : ''}`}
              onClick={() => setActiveTab('inspector')}
            >
              <Eye size={14} />
              HTTP Inspector
              {inspector && (
                <span className="tab-badge">
                  {inspector.status}
                </span>
              )}
            </button>
          </nav>

          {/* Panel Body */}
          <div className="panel-body" style={{ flex: 1 }}>
            {/* Global Server Error Banner */}
            {serverError && (
              <div className="secrets-warning" style={{ backgroundColor: 'var(--status-error-bg)', borderColor: 'rgba(220, 38, 38, 0.3)', color: '#fca5a5' }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <p>
                  <strong>Request Error:</strong> {serverError}
                </p>
              </div>
            )}

            {/* Tab 1: Free Basic Analysis */}
            {activeTab === 'basic' && (
              basicAnalysis ? (
                <BasicAnalysisView analysis={basicAnalysis} />
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <Bug size={20} />
                  </div>
                  <h3>No Analysis Generated Yet</h3>
                  <p>
                    Select an error sample on the left or paste your own stack trace, then click{' '}
                    <strong>Free Basic Analysis</strong> for instant deterministic parsing, or{' '}
                    <strong>Get Debug Report</strong> to view x402 payment requirements.
                  </p>
                </div>
              )
            )}

            {/* Tab 2: 402 Payment Requirements */}
            {activeTab === 'state402' && (
              paymentRequired ? (
                <State402View
                  paymentRequired={paymentRequired}
                  isMockMode={health?.mode === 'mock'}
                  onMockPay={handleMockPay}
                  isPaying={isPaying}
                />
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <Lock size={20} />
                  </div>
                  <h3>No 402 Challenge Active</h3>
                  <p>
                    Click <strong>Get Debug Report ({priceDisplay})</strong> on the left to trigger the live
                    HTTP 402 Payment Required handshake from the server.
                  </p>
                </div>
              )
            )}

            {/* Tab 3: Unlocked Debugging Report */}
            {activeTab === 'report' && (
              report ? (
                <ReportView report={report} />
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <CheckCircle2 size={20} />
                  </div>
                  <h3>Report Not Yet Unlocked</h3>
                  <p>
                    The comprehensive AI debugging report requires x402 settlement.
                    Click <strong>Get Debug Report</strong> and complete the payment authorization.
                  </p>
                </div>
              )
            )}

            {/* Tab 4: HTTP Request/Response Inspector */}
            {activeTab === 'inspector' && (
              <ProtocolInspector inspector={inspector} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
