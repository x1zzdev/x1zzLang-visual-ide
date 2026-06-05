import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import * as Icons from 'lucide-react';

/**
 * CustomNode
 * 
 * SUPPORTED_OPS 전용으로 단순화된 노드 렌더러.
 *
 * - fileInput: 입력 핸들 없음 (소스), 출력 핸들 있음
 * - 그 외 모든 지원 노드: 입력 핸들 + 출력 핸들
 * - status: idle | running | success | error
 */
const CustomNode = ({ id, data, selected, type }) => {
  const IconComponent = data.icon ? (Icons[data.icon] || Icons.Square) : Icons.Square;
  const category = data?.category || 'inout';
  const status   = data?.status   || 'idle';

  // ── 노드 서브 라벨 ────────────────────────────────────────────────────────
  let description = '';
  if (data?.parameters?.filePath) {
    description = data.parameters.filePath;
  } else if (data?.parameters?.column) {
    const op  = data.parameters.operator   || '';
    const val = data.parameters.value      ?? '';
    const dir = data.parameters.descending !== undefined
      ? (data.parameters.descending ? '↓ DESC' : '↑ ASC') : '';
    const agg = data.parameters.agg        || '';
    description = [
      data.parameters.column,
      op,
      val !== '' ? String(val) : '',
      dir,
      agg ? `(${agg})` : ''
    ].filter(Boolean).join(' ');
  } else if (data?.parameters?.columns && Array.isArray(data.parameters.columns)) {
    const kept = data.parameters.columns.filter(c => c && c.keep !== false).length;
    description = `${kept} col${kept !== 1 ? 's' : ''}`;
  } else if (data?.parameters?.n !== undefined) {
    description = `n = ${data.parameters.n}`;
  } else if (data?.parameters?.value !== undefined && data.parameters.value !== '') {
    description = `→ ${data.parameters.value}`;
  }

  // 실행 성공 시 행 수 표시
  if (status === 'success' && data?.resultSummary?.row_count !== undefined) {
    const rows = data.resultSummary.row_count;
    description = description
      ? `${description}\n➔ ${rows} rows`
      : `${rows} rows`;
  }

  const handleAnchorClick = (e, handleType, handleId) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('vibe-handle-click', {
      detail: { nodeId: id, handleType, handleId }
    }));
  };

  const buildTooltip = () => {
    let t = `${data?.label || type}`;
    if (status !== 'idle') t += ` [${status}]`;
    if (data?.parameters && Object.keys(data.parameters).length > 0) {
      const keys = Object.keys(data.parameters).filter(k => k !== 'detectedSchema');
      if (keys.length > 0) t += `\n${keys.map(k => `${k}: ${data.parameters[k]}`).join(', ')}`;
    }
    return t;
  };

  // fileInput은 소스 노드 — 입력 핸들 없음
  const hasInputHandle  = type !== 'fileInput';
  // 모든 지원 노드는 출력 핸들 있음
  const hasOutputHandle = true;

  return (
    <div
      className={`custom-node ${category} ${selected ? 'selected' : ''}`}
      title={buildTooltip()}
    >
      {/* 입력 핸들 (좌측) */}
      {hasInputHandle && (
        <Handle
          type="target"
          position={Position.Left}
          id="input"
          className="node-handle left-handle"
          onClick={e => handleAnchorClick(e, 'target', 'input')}
        />
      )}

      {/* 노드 ID 라벨 (상단 floating) */}
      <div style={{
        position: 'absolute', top: '-14px', width: '100px', textAlign: 'center',
        opacity: 0.4, fontSize: '0.55em', fontWeight: 'normal', color: 'var(--text-muted)',
        pointerEvents: 'none', left: '50%', transform: 'translateX(-50%)'
      }}>
        [{id}]
      </div>

      {/* 노드 아이콘 박스 */}
      <div className={`node-icon-box ${category} ${status} ${selected ? 'selected' : ''}`}>
        <IconComponent size={12} className="node-icon" />

        {/* 상태 표시 점 (success / error) */}
        {(status === 'success' || status === 'error') && (
          <div className={`node-status-dot ${status}`} title={`Status: ${status}`} />
        )}

        {/* 실행 중 스피너 */}
        {status === 'running' && (
          <div className="node-status-running" title="Processing...">
            <Icons.Loader2 size={12} className="animate-spin" style={{ color: '#3b82f6' }} />
          </div>
        )}
      </div>

      {/* 노드 라벨 */}
      <div className="node-labels-container">
        <div className="node-label-main" style={{ textAlign: 'center' }}>
          {data?.label || 'Node'}
        </div>
        {description && (
          <div className="node-label-sub" title={description}>
            {description}
          </div>
        )}
      </div>

      {/* 출력 핸들 (우측) */}
      {hasOutputHandle && (
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          className="node-handle right-handle"
          onClick={e => handleAnchorClick(e, 'source', 'output')}
        />
      )}
    </div>
  );
};

export default memo(CustomNode);
