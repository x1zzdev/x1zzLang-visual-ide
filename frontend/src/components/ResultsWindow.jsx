import React, { useState, useMemo } from 'react';
import { Terminal, Database, Code2, Copy, Check, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * ResultsWindow
 *
 * Props:
 *   selectedNode   - 현재 선택된 노드
 *   originalNode   - handle click 시 원래 선택 노드
 *   executeResult  - { rows: [], schema: {}, logs: [] }  ← POST /execute 응답
 *   globalLogs     - string[]
 *   x1zzCode       - string
 *   style          - CSS 스타일 객체
 */
const ResultsWindow = ({
  selectedNode,
  originalNode,
  executeResult = null,
  globalLogs = [],
  x1zzCode = '',
  style = {}
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('x1zz'); // x1zz 탭을 기본으로
  const [copied, setCopied]       = useState(false);

  // executeResult가 들어오면 자동으로 Data Preview 탭으로 전환
  React.useEffect(() => {
    if (executeResult !== null && executeResult.rows && executeResult.rows.length > 0) {
      setActiveTab('data');
    }
  }, [executeResult]);

  const [dataCopied, setDataCopied] = useState(false);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [wrapText, setWrapText]   = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [scrollTop, setScrollTop] = useState(0);

  // ── executeResult 에서 데이터 추출 ──────────────────────────────────────────
  // schema: { colName: typeName } 객체 또는 [{ name, type }] 배열 둘 다 허용
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
      let av = a[sortConfig.key] ?? '';
      let bv = b[sortConfig.key] ?? '';
      if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1;
      if (av > bv) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [rawRows, sortConfig]);

  const hasResult   = executeResult !== null;
  const rowCount    = sortedRows.length;
  const colCount    = schemaColumns.length;

  // ── ユーティリティ ───────────────────────────────────────────────────────────
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

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="results-window" style={style}>

      {/* ── 헤더 탭 ──────────────────────────────────────────────────────────── */}
      <div className="results-header">
        <div className="results-tabs">
          <button
            className={`results-tab ${activeTab === 'data' ? 'active' : ''}`}
            onClick={() => setActiveTab('data')}
          >
            <Database size={14} />
            <span>{t('results.tabs.dataPreview')}</span>
          </button>
          <button
            className={`results-tab ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <Terminal size={14} />
            <span>{t('results.tabs.logs')}</span>
          </button>
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

      {/* ── 컨텐츠 ───────────────────────────────────────────────────────────── */}
      <div className="results-content">

        {/* ── Data Preview ─────────────────────────────────────────────────── */}
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
                {/* 툴바 */}
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
                    {dataCopied
                      ? t('results.data.copied')
                      : selectedRows.size > 0
                        ? t('results.data.copySelected')
                        : t('results.data.copyAll')}
                  </button>
                </div>

                {/* 가상화 테이블 */}
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
                          <th
                            key={col.name}
                            onClick={() => handleSort(col.name)}
                            style={{ minWidth: 80, resize: 'horizontal', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div>
                                {col.name}
                                <span className="col-header-type" style={{ marginLeft: 6 }}>
                                  {String(col.type || '').split('.').pop()}
                                </span>
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
                                    <td
                                      key={col.name}
                                      title={String(row[col.name] ?? '')}
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

        {/* ── Logs ─────────────────────────────────────────────────────────── */}
        {activeTab === 'logs' && (
          <div className="log-viewer">
            {globalLogs.length === 0 ? (
              <div style={{ color: 'var(--text-muted)' }}>
                {t('results.logs.empty')}
              </div>
            ) : (
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
            )}
          </div>
        )}

        {/* ── x1zz Code ────────────────────────────────────────────────────── */}
        {activeTab === 'x1zz' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#1e1e2e' }}>
            {/* 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: '#2a273f', borderBottom: '1px solid #383650', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Code2 size={13} color="#c084fc" />
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {t('results.code.title')}
                </span>
                <span style={{ fontSize: '0.65rem', color: '#6b7280', background: '#383650', padding: '1px 6px', borderRadius: 4 }}>
                  .xzz
                </span>
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

            {/* 코드 본문 (구문 강조) */}
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

export default ResultsWindow;
