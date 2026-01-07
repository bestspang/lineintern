/**
 * LIFF Debug Overlay - Shows LIFF state visually for troubleshooting
 * Only visible when ?debug=liff is in URL
 */

import { useLiffOptional } from '@/contexts/LiffContext';
import { useEffect, useState } from 'react';

interface DebugInfo {
  userAgent: string;
  currentUrl: string;
  referrer: string;
  liffParams: string[];
  linePatternMatch: boolean;
  isMobileLineApp: boolean;
}

function checkEnvironment(): DebugInfo {
  const ua = navigator.userAgent.toLowerCase();
  const urlParams = new URLSearchParams(window.location.search);
  
  const linePatterns = ['line/', 'liff/', 'lineboot', 'line ', ' line', 'linecorp'];
  const linePatternMatch = linePatterns.some(p => ua.includes(p));
  const isMobileLineApp = ua.includes('line') && 
    (ua.includes('android') || ua.includes('iphone') || ua.includes('ipad'));
  
  const liffParams: string[] = [];
  if (urlParams.has('liff.state')) liffParams.push('liff.state');
  if (urlParams.has('liff.referrer')) liffParams.push('liff.referrer');
  
  return {
    userAgent: navigator.userAgent,
    currentUrl: window.location.href,
    referrer: document.referrer,
    liffParams,
    linePatternMatch,
    isMobileLineApp,
  };
}

export function LiffDebugOverlay() {
  const liffContext = useLiffOptional();
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('debug') === 'liff') {
      setVisible(true);
      setDebugInfo(checkEnvironment());
    }
  }, []);

  if (!visible) return null;

  const StatusBadge = ({ ok, label }: { ok: boolean; label: string }) => (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
      ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
    }`}>
      {ok ? '✓' : '✗'} {label}
    </span>
  );

  return (
    <div className="fixed bottom-4 right-4 z-[9999] max-w-sm w-full bg-black/90 text-white p-4 rounded-lg shadow-2xl text-xs font-mono overflow-auto max-h-[80vh]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm text-yellow-400">🔍 LIFF Debug</h3>
        <button 
          onClick={() => setVisible(false)}
          className="text-gray-400 hover:text-white"
        >
          ✕
        </button>
      </div>

      {/* LIFF Context State */}
      <div className="mb-3 p-2 bg-gray-800 rounded">
        <div className="text-gray-400 mb-1">LIFF Context:</div>
        <div className="flex flex-wrap gap-1">
          <StatusBadge ok={!!liffContext?.isReady} label="isReady" />
          <StatusBadge ok={!!liffContext?.isInClient} label="isInClient" />
          <StatusBadge ok={!!liffContext?.isLoggedIn} label="isLoggedIn" />
          <StatusBadge ok={!liffContext?.error} label="noError" />
        </div>
        {liffContext?.error && (
          <div className="mt-1 text-red-400 text-xs">Error: {liffContext.error}</div>
        )}
        {liffContext?.liffId && (
          <div className="mt-1 text-gray-400">LIFF ID: {liffContext.liffId}</div>
        )}
        {liffContext?.profile && (
          <div className="mt-1 text-green-400">
            User: {liffContext.profile.displayName} ({liffContext.profile.userId.slice(0, 8)}...)
          </div>
        )}
      </div>

      {/* Environment Detection */}
      <div className="mb-3 p-2 bg-gray-800 rounded">
        <div className="text-gray-400 mb-1">Environment Detection:</div>
        <div className="flex flex-wrap gap-1">
          <StatusBadge ok={!!debugInfo?.linePatternMatch} label="UA Pattern" />
          <StatusBadge ok={!!debugInfo?.isMobileLineApp} label="Mobile LINE" />
          <StatusBadge ok={(debugInfo?.liffParams.length || 0) > 0} label="LIFF Params" />
          <StatusBadge ok={debugInfo?.referrer.includes('line.me') || false} label="LINE Referrer" />
        </div>
      </div>

      {/* Raw Data */}
      <details className="mb-2">
        <summary className="text-gray-400 cursor-pointer hover:text-white">User Agent</summary>
        <div className="mt-1 p-1 bg-gray-900 rounded break-all text-[10px]">
          {debugInfo?.userAgent}
        </div>
      </details>

      <details className="mb-2">
        <summary className="text-gray-400 cursor-pointer hover:text-white">URLs</summary>
        <div className="mt-1 p-1 bg-gray-900 rounded break-all text-[10px]">
          <div><span className="text-gray-500">Current:</span> {debugInfo?.currentUrl}</div>
          <div><span className="text-gray-500">Referrer:</span> {debugInfo?.referrer || '(none)'}</div>
        </div>
      </details>

      {debugInfo?.liffParams.length ? (
        <div className="text-green-400 text-[10px]">
          LIFF Params: {debugInfo.liffParams.join(', ')}
        </div>
      ) : null}

      <div className="mt-3 pt-2 border-t border-gray-700 text-gray-500 text-[10px]">
        Add ?debug=liff to URL to show this overlay
      </div>
    </div>
  );
}
