import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Terminal, Database, Code2, Copy, Check, FileText, BarChart2, AlertTriangle, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * ResultsWindow
 *
 * Props:
 *   selectedNode      - 현재 선택된 노드
 *   originalNode      - handle click 시 원래 선택 노드
 *   executeResult     - { rows: [], schema: {}, logs: [] }  ← POST /execute 응답
 *   executionEvents   - ExecutionEvent[] (ChartEvent | ErrorEvent | TextEvent)
 *   globalLogs        - string[]
 *   x1zzCode          - string
 *   style             - CSS 스타일 객체
 */
const ResultsWindow = ({
  selectedNode,
  originalNode,
  executeResult    = null,
  executionEvents  = [],
  globalLogs       = [],
  x1zzCode         = '',
  style            = {}
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('x1zz');
  const [copied, setCopied]       = useState(false);
  const [dataCopied, setDataCopied] = useState(false);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [wrapText, setWrapText]   = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [scrollTop, setScrollTop] = useState(0);

  // 실행 결과 도착 시 자동 탭 전환
  useEffect(() => {
    if (!executeResult) return;
    const hasChart = executionEvents.some(e => e.type === 'chart');
    if (hasChart) {
      setActiveTab('charts');
    } else if (executeResult.rows && executeResult.rows.length > 0) {
      setActiveTab('data');
    }
  }, [executeResult, executionEvents]);

  // ── executeResult 정규화 ─────────────────────────────────────────────────
  const schemaColumns = useMemo(() => {
    if (!executeResult?.schema) return [];
    if (Array.isArray(executeResult.schema)) return executeResult.schema;
    return Object.entries(executeResult.schema).map(([name, type]) => ({ name, type: String(type) }));
  }, [executeResult]);

  const rawRows = executeResult?.rows || [];

  const sortedRows = useMemo(() => {
    if (!sortConfig.key) return rawRows;
    const sorted = [...rawRows];
    sorted.sort((a, b) => {
      const av = a[sortConfig.key] ?? '';
      const bv = b[sortConfig.key] ?? '';
      if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1;
      if (av > bv) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [rawRows, sortConfig]);

  const hasResult = executeResult !== null;
  const rowCount  = sortedRows.length;
  const colCount  = schemaColumns.length;

  // executionEvents 분류
  const chartEvents = useMemo(() => executionEvents.filter(e => e.type === 'chart'), [executionEvents]);
  const errorEvents = useMemo(() => executionEvents.filter(e => e.type === 'error'), [executionEvents]);
  const textEvents  = useMemo(() => executionEvents.filter(e => e.type === 'text'),  [executionEvents]);

  // ── 유틸리티 ─────────────────────────────────────────────────────────────
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const toggleRowSelection = (idx) => {
    setSelectedRows(prev => {
      const n = new Set(prev);
      n.has(idx) ? n.delete(idx) : n.add(idx);
      return n;
    });
  };

  const handleCopyData = () => {
    const indices = selectedRows.size === 0
      ? Array.from({ length: sortedRows.length }, (_, i) => i)
      : Array.from(selectedRows).sort((a, b) => a - b);
    if (indices.length === 0) return;
    const header = schemaColumns.map(c => c.name).join('\t');
    const body   = indices.map(i => schemaColumns.map(c => String(sortedRows[i]?.[c.name] ?? '')).join('\t')).join('\n');
    navigator.clipboard.writeText(header + '\n' + body).then(() => {
      setDataCopied(true);
      setTimeout(() => setDataCopied(false), 2000);
    });
  };

  const handleCopyLogs = () => {
    const text = globalLogs.map(l => `[${new Date().toLocaleTimeString()}] ${l}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="results-window" style={style}>

      {/* ── 헤더 탭 ──────────────────────────────────────────────────────── */}
      <div className="results-header">
        <div className="results-tabs">
          {/* Data Preview */}
          <button
            className={`results-tab ${activeTab === 'data' ? 'active' : ''}`}
            onClick={() => setActiveTab('data')}
          >
            <Database size={14} />
            <span>{t('results.tabs.dataPreview')}</span>
          </button>

          {/* Charts — chart 이벤트가 있을 때 배지 표시 */}
          <button
            className={`results-tab ${activeTab === 'charts' ? 'active' : ''}`}
            onClick={() => setActiveTab('charts')}
            style={{ color: activeTab === 'charts' ? '#f59e0b' : undefined }}
            title="Execution Charts"
          >
            <BarChart2 size={14} />
            <span>Charts</span>
            {chartEvents.length > 0 && (
              <span style={{ marginLeft: 4, background: '#f59e0b', color: '#1e1e2e', borderRadius: 8, fontSize: '0.65rem', fontWeight: 700, padding: '0 5px', lineHeight: '16px' }}>
                {chartEvents.length}
              </span>
            )}
          </button>

          {/* Output — TextEvents */}
          <button
            className={`results-tab ${activeTab === 'output' ? 'active' : ''}`}
            onClick={() => setActiveTab('output')}
            style={{ color: activeTab === 'output' ? '#34d399' : undefined }}
            title="Execution Text Output"
          >
            <Monitor size={14} />
            <span>Output</span>
          </button>

          {/* Logs */}
          <button
            className={`results-tab ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <Terminal size={14} />
            <span>{t('results.tabs.logs')}</span>
            {errorEvents.length > 0 && (
              <span style={{ marginLeft: 4, background: '#ef4444', color: '#fff', borderRadius: 8, fontSize: '0.65rem', fontWeight: 700, padding: '0 5px', lineHeight: '16px' }}>
                {errorEvents.length}
              </span>
            )}
          </button>

          {/* x1zz Code */}
          <button
            className={`results-tab ${activeTab === 'x1zz' ? 'active' : ''}`}
            onClick={() => setActiveTab('x1zz')}
            style={{ color: activeTab === 'x1zz' ? '#7c3aed' : undefined }}
            title={t('results.tabs.x1zzCodeTitle')}
          >
            <Code2 size={14} />
            <span>{t('results.tabs.x1zzCode')}</span>
          </button>
        </div>

        {/* 요약 정보 */}
        <div className="results-summary">
          {hasResult ? (
            <span>
              {t('results.summary.executionResult', {
                rowCount,
                colCount,
                rowPlural: rowCount !== 1 ? 's' : '',
                colPlural: colCount !== 1 ? 's' : ''
              }).split(/<\/?strong>/).map((part, i) =>
                i % 2 === 1 ? <strong key={i}>{part}</strong> : part
              )}
            </span>
          ) : selectedNode ? (
            <span>{t('results.summary.notExecuted', { label: selectedNode.data?.label || selectedNode.id })}</span>
          ) : (
            <span>{t('results.summary.noNodeSelected')}</span>
          )}
        </div>
      </div>

      {/* ── 컨텐츠 ──────────────────────────────────────────────────────── */}
      <div className="results-content">

        {/* ── Data Preview ──────────────────────────────────────────────── */}
        {activeTab === 'data' && (
          <div style={{ height: '100%' }}>
            {!hasResult ? (
              <div className="no-node-selected" style={{ padding: 20 }}>
                <Database />
                <p>{t('results.data.runToPeek')}</p>
              </div>
            ) : rowCount === 0 ? (
              <div className="no-node-selected" style={{ padding: 20 }}>
                <Database />
                <p>{t('results.data.zeroRows')}</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ padding: '8px 12px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {selectedRows.size > 0 && (
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {t('results.data.rowsSelected', { count: selectedRows.size, plural: selectedRows.size > 1 ? 's' : '' })}
                      </span>
                    )}
                    <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                      <input type="checkbox" checked={wrapText} onChange={e => setWrapText(e.target.checked)} style={{ margin: 0 }} />
                      {t('results.data.wrapText')}
                    </label>
                  </div>
                  <button className="copy-logs-btn" onClick={handleCopyData}>
                    {dataCopied ? <Check size={12} color="var(--color-inout)" /> : <Copy size={12} />}
                    {dataCopied ? t('results.data.copied') : selectedRows.size > 0 ? t('results.data.copySelected') : t('results.data.copyAll')}
                  </button>
                </div>

                <div
                  className="spreadsheet-container"
                  style={{ flex: 1, overflow: 'auto' }}
                  onScroll={e => setScrollTop(e.target.scrollTop)}
                >
                  <table className="spreadsheet" style={{ tableLayout: 'auto' }}>
                    <thead>
                      <tr>
                        <th style={{ width: 40, minWidth: 40, textAlign: 'center', background: 'var(--bg-secondary)' }}>#</th>
                        {schemaColumns.map(col => (
                          <th key={col.name} onClick={() => handleSort(col.name)} style={{ minWidth: 80, resize: 'horizontal', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div>
                                {col.name}
                                <span className="col-header-type" style={{ marginLeft: 6 }}>{String(col.type || '').split('.').pop()}</span>
                              </div>
                              {sortConfig.key === col.name && (
                                <span style={{ fontSize: '0.7rem', color: 'var(--color-accent)' }}>
                                  {sortConfig.direction === 'asc' ? '▲' : '▼'}
                                </span>
                              )}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const ROW_HEIGHT = 32;
                        const buffer = 10;
                        const viewportRows = Math.ceil(800 / ROW_HEIGHT);
                        const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - buffer);
                        const endIdx   = Math.min(sortedRows.length, startIdx + viewportRows + buffer * 2);
                        const visible  = sortedRows.slice(startIdx, endIdx);
                        const topSpace = startIdx * ROW_HEIGHT;
                        const botSpace = Math.max(0, (sortedRows.length - endIdx) * ROW_HEIGHT);
                        return (
                          <>
                            {topSpace > 0 && <tr style={{ height: topSpace }}><td colSpan={schemaColumns.length + 1} style={{ padding: 0, border: 'none' }} /></tr>}
                            {visible.map((row, relIdx) => {
                              const rowIdx = startIdx + relIdx;
                              return (
                                <tr key={rowIdx} onClick={() => toggleRowSelection(rowIdx)} style={{ cursor: 'pointer', backgroundColor: selectedRows.has(rowIdx) ? 'rgba(59,130,246,0.1)' : undefined, height: ROW_HEIGHT }}>
                                  <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, background: 'var(--bg-secondary)', padding: '0 8px' }}>{rowIdx + 1}</td>
                                  {schemaColumns.map(col => (
                                    <td key={col.name} title={String(row[col.name] ?? '')}
                                      style={wrapText
                                        ? { whiteSpace: 'pre-wrap', wordBreak: 'break-word', minWidth: 200, lineHeight: 1.4, verticalAlign: 'top', padding: '0 8px' }
                                        : { height: ROW_HEIGHT, padding: '0 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 300 }}
                                    >
                                      {row[col.name] !== null && row[col.name] !== undefined
                                        ? String(row[col.name])
                                        : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>null</span>}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                            {botSpace > 0 && <tr style={{ height: botSpace }}><td colSpan={schemaColumns.length + 1} style={{ padding: 0, border: 'none' }} /></tr>}
                          </>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Charts ────────────────────────────────────────────────────── */}
        {activeTab === 'charts' && (
          <div style={{ height: '100%', overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {chartEvents.length === 0 ? (
              <div className="no-node-selected">
                <BarChart2 size={32} style={{ opacity: 0.3 }} />
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 8 }}>
                  No chart output yet. Run a pipeline that emits <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3 }}>[x1zz:chart]</code> events.
                </p>
              </div>
            ) : (
              chartEvents.map((ev, idx) => (
                <ChartCard key={idx} event={ev} />
              ))
            )}
          </div>
        )}

        {/* ── Output (TextEvents) ────────────────────────────────────────── */}
        {activeTab === 'output' && (
          <div style={{ height: '100%', overflowY: 'auto', padding: '12px' }}>
            {textEvents.length === 0 ? (
              <div className="no-node-selected">
                <Monitor size={32} style={{ opacity: 0.3 }} />
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 8 }}>
                  No text output. Run the pipeline to see stdout here.
                </p>
              </div>
            ) : (
              <pre style={{ margin: 0, fontFamily: "'JetBrains Mono','Fira Code','Consolas',monospace", fontSize: '0.8rem', lineHeight: 1.7, color: '#d1fae5', background: '#0d1117', padding: '12px', borderRadius: 6 }}>
                {textEvents.map((ev, idx) => (
                  <div key={idx}>{ev.text}</div>
                ))}
              </pre>
            )}
          </div>
        )}

        {/* ── Logs ──────────────────────────────────────────────────────── */}
        {activeTab === 'logs' && (
          <div className="log-viewer">
            {/* ErrorEvents 렌더러 — 스펙 PART 4 */}
            {errorEvents.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {errorEvents.map((ev, idx) => (
                  <ErrorEventCard key={idx} event={ev} />
                ))}
              </div>
            )}

            {globalLogs.length === 0 && errorEvents.length === 0 ? (
              <div style={{ color: 'var(--text-muted)' }}>
                {t('results.logs.empty')}
              </div>
            ) : globalLogs.length > 0 ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: 4, marginBottom: 8 }}>
                  <div style={{ color: 'var(--color-accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FileText size={12} /> {t('results.logs.executionLogs')}
                  </div>
                  <button className="copy-logs-btn" onClick={handleCopyLogs}>
                    {copied ? <Check size={12} color="var(--color-inout)" /> : <Copy size={12} />}
                    {copied ? t('results.logs.copied') : t('results.logs.copyLogs')}
                  </button>
                </div>
                {globalLogs.map((log, idx) => (
                  <div
                    key={idx}
                    className={`log-entry ${typeof log === 'string' && (log.includes('failed') || log.includes('Error') || log.includes('❌')) ? 'error' : ''}`}
                  >
                    [{new Date().toLocaleTimeString()}] {log}
                  </div>
                ))}
              </>
            ) : null}
          </div>
        )}

        {/* ── x1zz Code ─────────────────────────────────────────────────── */}
        {activeTab === 'x1zz' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#1e1e2e' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: '#2a273f', borderBottom: '1px solid #383650', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Code2 size={13} color="#c084fc" />
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {t('results.code.title')}
                </span>
                <span style={{ fontSize: '0.65rem', color: '#6b7280', background: '#383650', padding: '1px 6px', borderRadius: 4 }}>.xzz</span>
              </div>
              <button
                className="copy-logs-btn"
                style={{ background: '#2a273f', color: '#a5b4fc', border: '1px solid #383650' }}
                onClick={() => {
                  navigator.clipboard.writeText(x1zzCode).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
              >
                {copied ? <Check size={12} color="#86efac" /> : <Copy size={12} />}
                {copied ? t('results.code.copied') : t('results.code.copyCode')}
              </button>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
              {x1zzCode ? (
                <pre style={{ margin: 0, fontFamily: "'JetBrains Mono','Fira Code','Consolas',monospace", fontSize: '0.8rem', lineHeight: 1.7, color: '#e2e8f0', whiteSpace: 'pre', tabSize: 2 }}>
                  {x1zzCode.split('\n').map((line, idx) => {
                    let styledLine;
                    if (line.trim().startsWith('//')) {
                      styledLine = <span key={idx} style={{ color: '#6b7280' }}>{line}</span>;
                    } else if (line.trim().startsWith('type ')) {
                      styledLine = <span key={idx} style={{ color: '#c084fc' }}>{line}</span>;
                    } else if (/^\s*v\s+/.test(line)) {
                      const m = line.match(/^(v\s+)(\w+)(\s*=\s*)(.*)$/);
                      styledLine = m ? (
                        <span key={idx}>
                          <span style={{ color: '#a78bfa' }}>v </span>
                          <span style={{ color: '#7dd3fc' }}>{m[2]}</span>
                          <span style={{ color: '#94a3b8' }}>{m[3]}</span>
                          <span style={{ color: '#e2e8f0' }}>{m[4]}</span>
                        </span>
                      ) : <span key={idx} style={{ color: '#e2e8f0' }}>{line}</span>;
                    } else if (line.trim().startsWith('|>')) {
                      const m = line.match(/^(\s*\|>\s*)(\w+)(.*)$/);
                      styledLine = m ? (
                        <span key={idx}>
                          <span style={{ color: '#f97316' }}>{m[1]}</span>
                          <span style={{ color: '#34d399' }}>{m[2]}</span>
                          <span style={{ color: '#e2e8f0' }}>{m[3]}</span>
                        </span>
                      ) : <span key={idx} style={{ color: '#f97316' }}>{line}</span>;
                    } else {
                      styledLine = <span key={idx} style={{ color: '#e2e8f0' }}>{line}</span>;
                    }
                    return (
                      <div key={idx} style={{ display: 'flex', minHeight: '1.4em' }}>
                        <span style={{ width: '2.5rem', color: '#4b5563', textAlign: 'right', marginRight: '1rem', flexShrink: 0, userSelect: 'none', fontSize: '0.72rem' }}>
                          {idx + 1}
                        </span>
                        {styledLine}
                      </div>
                    );
                  })}
                </pre>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' }}>
                  <Code2 size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
                  <p style={{ fontSize: '0.85rem', margin: 0 }}>{t('results.code.noNodes')}</p>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — ErrorEvent Renderer
// UI rules: ERROR line = red highlight, AI_SUGGESTION = separate highlighted box
// ═══════════════════════════════════════════════════════════════════════════════

const ErrorEventCard = ({ event }) => (
  <div style={{
    background: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    borderRadius: 6,
    marginBottom: 8,
    overflow: 'hidden',
  }}>
    {/* ERROR line — red highlight */}
    <div style={{
      background: 'rgba(239, 68, 68, 0.18)',
      padding: '6px 12px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
    }}>
      <AlertTriangle size={14} color="#ef4444" style={{ marginTop: 2, flexShrink: 0 }} />
      <div>
        <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'monospace' }}>
          ERROR[{event.code}]
        </span>
        <span style={{ color: '#fca5a5', fontSize: '0.82rem', marginLeft: 8 }}>
          {event.message}
        </span>
      </div>
    </div>

    {/* AI_SUGGESTION box — separate highlighted box */}
    {event.suggestion && (
      <div style={{
        padding: '8px 12px',
        background: 'rgba(251, 191, 36, 0.08)',
        borderTop: '1px solid rgba(239, 68, 68, 0.2)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
      }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fbbf24', flexShrink: 0, lineHeight: '18px' }}>
          AI_SUGGESTION
        </span>
        <span style={{ color: '#fde68a', fontSize: '0.8rem', lineHeight: 1.5 }}>
          {event.suggestion}
        </span>
      </div>
    )}
  </div>
);


// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Chart Renderer (SVG-based)
// Supports: bar | line | pie | scatter
// UI requirements: chart title, chart type badge, hover tooltip, axis inferred from schema
// ═══════════════════════════════════════════════════════════════════════════════

const CHART_COLORS = [
  '#7c3aed', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#06b6d4', '#f97316',
  '#ec4899', '#84cc16', '#14b8a6', '#a855f7',
];

const ChartCard = ({ event }) => {
  const [tooltip, setTooltip] = useState(null);
  const svgRef = useRef(null);

  const W = 460, H = 200;
  const PAD = { top: 24, right: 16, bottom: 40, left: 50 };

  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top  - PAD.bottom;

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-color)',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)' }}>
        <BarChart2 size={13} color="#f59e0b" />
        <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)' }}>{event.title}</span>
        <span style={{
          marginLeft: 'auto',
          fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
          color: '#1e1e2e', background: '#f59e0b', borderRadius: 4, padding: '1px 7px',
        }}>
          {event.chartType}
        </span>
      </div>

      {/* chart body */}
      <div style={{ padding: '12px 16px', position: 'relative' }}>
        {event.chartType === 'bar'     && <BarChart     data={event.data} W={W} H={H} PAD={PAD} chartW={chartW} chartH={chartH} tooltip={tooltip} setTooltip={setTooltip} svgRef={svgRef} />}
        {event.chartType === 'line'    && <LineChart    data={event.data} W={W} H={H} PAD={PAD} chartW={chartW} chartH={chartH} tooltip={tooltip} setTooltip={setTooltip} svgRef={svgRef} />}
        {event.chartType === 'pie'     && <PieChart     data={event.data} tooltip={tooltip} setTooltip={setTooltip} />}
        {event.chartType === 'scatter' && <ScatterChart data={event.data} W={W} H={H} PAD={PAD} chartW={chartW} chartH={chartH} tooltip={tooltip} setTooltip={setTooltip} svgRef={svgRef} />}

        {/* Tooltip */}
        {tooltip && (
          <div style={{
            position: 'absolute', pointerEvents: 'none',
            top: tooltip.y + 12, left: tooltip.x + 12,
            background: 'rgba(15,15,25,0.95)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 6, padding: '5px 10px',
            fontSize: '0.75rem', color: '#f1f5f9', whiteSpace: 'nowrap', zIndex: 100,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}>
            {tooltip.label && <div style={{ fontWeight: 700, color: '#f59e0b', marginBottom: 2 }}>{tooltip.label}</div>}
            <div>{tooltip.text}</div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Bar Chart ────────────────────────────────────────────────────────────────
const BarChart = ({ data, W, H, PAD, chartW, chartH, tooltip, setTooltip, svgRef }) => {
  if (!data || data.length === 0) return <EmptyChart />;

  const maxVal = Math.max(...data.map(d => d.value ?? 0), 0);
  const barGap  = 4;
  const barW    = Math.max(8, (chartW - barGap * (data.length - 1)) / data.length);

  // Y-axis tick count
  const ticks = 4;

  return (
    <svg ref={svgRef} width={W} height={H} style={{ maxWidth: '100%', overflow: 'visible' }}>
      {/* Y-axis ticks */}
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const val = (maxVal * i) / ticks;
        const y   = PAD.top + chartH - (chartH * i / ticks);
        return (
          <g key={i}>
            <line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#6b7280">
              {Math.round(val)}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {data.map((d, i) => {
        const barH  = maxVal === 0 ? 0 : ((d.value ?? 0) / maxVal) * chartH;
        const x     = PAD.left + i * (barW + barGap);
        const y     = PAD.top + chartH - barH;
        const color = CHART_COLORS[i % CHART_COLORS.length];
        return (
          <g key={i}>
            <rect
              x={x} y={y} width={barW} height={barH}
              fill={color} opacity={0.85} rx={2}
              style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
              onMouseEnter={(ev) => {
                const rect = ev.currentTarget.closest('svg').parentElement.getBoundingClientRect();
                setTooltip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, label: String(d.label ?? i), text: `value: ${d.value}` });
              }}
              onMouseLeave={() => setTooltip(null)}
              onMouseMove={(ev) => {
                const rect = ev.currentTarget.closest('svg').parentElement.getBoundingClientRect();
                setTooltip(t => t ? { ...t, x: ev.clientX - rect.left, y: ev.clientY - rect.top } : null);
              }}
            />
            {/* X label */}
            <text
              x={x + barW / 2} y={PAD.top + chartH + 14}
              textAnchor="middle" fontSize={9} fill="#9ca3af"
              style={{ userSelect: 'none' }}
            >
              {String(d.label ?? i).slice(0, 10)}
            </text>
          </g>
        );
      })}

      {/* Axes */}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + chartH} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
      <line x1={PAD.left} y1={PAD.top + chartH} x2={PAD.left + chartW} y2={PAD.top + chartH} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
    </svg>
  );
};

// ── Line Chart ───────────────────────────────────────────────────────────────
const LineChart = ({ data, W, H, PAD, chartW, chartH, tooltip, setTooltip, svgRef }) => {
  if (!data || data.length === 0) return <EmptyChart />;

  const xs   = data.map(d => d.x ?? 0);
  const ys   = data.map(d => d.y ?? 0);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const toSvgX = x => PAD.left  + ((x - minX) / rangeX) * chartW;
  const toSvgY = y => PAD.top   + chartH - ((y - minY) / rangeY) * chartH;

  const points = data.map(d => `${toSvgX(d.x ?? 0)},${toSvgY(d.y ?? 0)}`).join(' ');
  const fillPts = [
    `${toSvgX(xs[0])},${PAD.top + chartH}`,
    ...data.map(d => `${toSvgX(d.x ?? 0)},${toSvgY(d.y ?? 0)}`),
    `${toSvgX(xs[xs.length - 1])},${PAD.top + chartH}`,
  ].join(' ');

  const ticks = 4;

  return (
    <svg ref={svgRef} width={W} height={H} style={{ maxWidth: '100%', overflow: 'visible' }}>
      {/* Y-axis grid + labels */}
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const val = minY + (rangeY * i) / ticks;
        const y   = toSvgY(val);
        return (
          <g key={i}>
            <line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#6b7280">{Math.round(val)}</text>
          </g>
        );
      })}

      {/* Fill area */}
      <polygon points={fillPts} fill="#7c3aed" opacity={0.12} />

      {/* Line */}
      <polyline points={points} fill="none" stroke="#7c3aed" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      {/* Dots */}
      {data.map((d, i) => (
        <circle
          key={i}
          cx={toSvgX(d.x ?? 0)} cy={toSvgY(d.y ?? 0)} r={4}
          fill="#7c3aed" stroke="#1e1e2e" strokeWidth={1.5}
          style={{ cursor: 'pointer' }}
          onMouseEnter={(ev) => {
            const rect = ev.currentTarget.closest('svg').parentElement.getBoundingClientRect();
            setTooltip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, label: null, text: `x: ${d.x}  y: ${d.y}` });
          }}
          onMouseLeave={() => setTooltip(null)}
        />
      ))}

      {/* X-axis labels */}
      {data.map((d, i) => (
        <text key={i} x={toSvgX(d.x ?? 0)} y={PAD.top + chartH + 14} textAnchor="middle" fontSize={9} fill="#9ca3af">
          {d.x}
        </text>
      ))}

      {/* Axes */}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + chartH} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
      <line x1={PAD.left} y1={PAD.top + chartH} x2={PAD.left + chartW} y2={PAD.top + chartH} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
    </svg>
  );
};

// ── Pie Chart ────────────────────────────────────────────────────────────────
const PieChart = ({ data, tooltip, setTooltip }) => {
  if (!data || data.length === 0) return <EmptyChart />;

  const R  = 75;
  const CX = 95, CY = 95;
  const total = data.reduce((s, d) => s + (d.value ?? 0), 0) || 1;

  let startAngle = -Math.PI / 2;

  const slices = data.map((d, i) => {
    const angle = (2 * Math.PI * (d.value ?? 0)) / total;
    const endAngle = startAngle + angle;
    const x1 = CX + R * Math.cos(startAngle);
    const y1 = CY + R * Math.sin(startAngle);
    const x2 = CX + R * Math.cos(endAngle);
    const y2 = CY + R * Math.sin(endAngle);
    const large = angle > Math.PI ? 1 : 0;
    const path  = `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
    const labelAngle = startAngle + angle / 2;
    const labelR = R * 0.66;
    const lx = CX + labelR * Math.cos(labelAngle);
    const ly = CY + labelR * Math.sin(labelAngle);
    const slice = { path, color: CHART_COLORS[i % CHART_COLORS.length], label: d.label ?? i, value: d.value, pct: ((d.value / total) * 100).toFixed(1), lx, ly };
    startAngle = endAngle;
    return slice;
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <svg width={190} height={190} style={{ flexShrink: 0 }}>
        {slices.map((s, i) => (
          <path
            key={i} d={s.path} fill={s.color} stroke="#1e1e2e" strokeWidth={1.5}
            style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
            onMouseEnter={(ev) => {
              const rect = ev.currentTarget.closest('svg').parentElement.getBoundingClientRect();
              setTooltip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, label: String(s.label), text: `${s.value}  (${s.pct}%)` });
            }}
            onMouseLeave={() => setTooltip(null)}
          />
        ))}
        {/* percentage labels inside slices */}
        {slices.filter(s => parseFloat(s.pct) > 6).map((s, i) => (
          <text key={i} x={s.lx} y={s.ly + 4} textAnchor="middle" fontSize={9} fill="#fff" fontWeight={700} style={{ pointerEvents: 'none' }}>
            {s.pct}%
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
            <span style={{ color: 'var(--text-muted)', marginLeft: 'auto', paddingLeft: 8 }}>{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Scatter Chart ────────────────────────────────────────────────────────────
const ScatterChart = ({ data, W, H, PAD, chartW, chartH, tooltip, setTooltip, svgRef }) => {
  if (!data || data.length === 0) return <EmptyChart />;

  const xs   = data.map(d => d.x ?? 0);
  const ys   = data.map(d => d.y ?? 0);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const toSvgX = x => PAD.left  + ((x - minX) / rangeX) * chartW;
  const toSvgY = y => PAD.top   + chartH - ((y - minY) / rangeY) * chartH;

  const ticks = 4;

  return (
    <svg ref={svgRef} width={W} height={H} style={{ maxWidth: '100%', overflow: 'visible' }}>
      {/* Grid */}
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const val = minY + (rangeY * i) / ticks;
        const y   = toSvgY(val);
        return (
          <g key={i}>
            <line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#6b7280">{Math.round(val)}</text>
          </g>
        );
      })}

      {/* Points */}
      {data.map((d, i) => (
        <circle
          key={i}
          cx={toSvgX(d.x ?? 0)} cy={toSvgY(d.y ?? 0)} r={5}
          fill={CHART_COLORS[i % CHART_COLORS.length]}
          opacity={0.8} stroke="rgba(0,0,0,0.3)" strokeWidth={0.5}
          style={{ cursor: 'pointer' }}
          onMouseEnter={(ev) => {
            const rect = ev.currentTarget.closest('svg').parentElement.getBoundingClientRect();
            setTooltip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, label: null, text: `x: ${d.x}  y: ${d.y}` });
          }}
          onMouseLeave={() => setTooltip(null)}
        />
      ))}

      {/* Axes */}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + chartH} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
      <line x1={PAD.left} y1={PAD.top + chartH} x2={PAD.left + chartW} y2={PAD.top + chartH} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />

      {/* X-axis labels */}
      {Array.from({ length: Math.min(5, data.length) }, (_, i) => {
        const idx = Math.round(i * (data.length - 1) / Math.max(1, Math.min(4, data.length - 1)));
        const d   = data[idx];
        return (
          <text key={i} x={toSvgX(d.x ?? 0)} y={PAD.top + chartH + 14} textAnchor="middle" fontSize={9} fill="#9ca3af">
            {d.x}
          </text>
        );
      })}
    </svg>
  );
};

// ── Fallback empty ───────────────────────────────────────────────────────────
const EmptyChart = () => (
  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '20px 0', textAlign: 'center' }}>
    No data in chart payload.
  </div>
);

export default ResultsWindow;
