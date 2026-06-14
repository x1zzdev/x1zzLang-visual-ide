import React, { useState, useEffect, useRef } from 'react';
import { Settings, Plus, X, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// ─── 안전한 입력 컴포넌트 (Delete/Backspace 키 전파 방지) ────────────────────
const SafeInput = React.forwardRef(({ value, onChange, onBlur, type = 'text', checked, ...props }, ref) => {
  const isCheck = type === 'checkbox';
  const [local, setLocal] = React.useState(isCheck ? (checked ?? false) : (value ?? ''));

  React.useEffect(() => {
    setLocal(isCheck ? (checked ?? false) : (value ?? ''));
  }, [value, checked, isCheck]);

  const commit = () => {
    if (onChange && local !== (isCheck ? checked : value)) {
      onChange({ target: { value: local, checked: local } });
    }
  };

  const onKeyDown = (e) => {
    if (['Delete', 'Backspace', 'Escape'].includes(e.key)) e.stopPropagation();
    if (e.key === 'Enter') commit();
  };

  return (
    <input
      ref={ref}
      type={type}
      value={isCheck ? undefined : local}
      checked={isCheck ? local : undefined}
      onChange={e => {
        const v = isCheck ? e.target.checked : e.target.value;
        setLocal(v);
        if (isCheck && onChange) onChange({ target: { value: v, checked: v } });
      }}
      onBlur={() => { commit(); if (onBlur) onBlur(); }}
      onKeyDown={onKeyDown}
      {...props}
    />
  );
});
SafeInput.displayName = 'SafeInput';

const SafeSelect = ({ onKeyDown, ...props }) => (
  <select onKeyDown={e => { if (['Delete', 'Backspace', 'Escape'].includes(e.key)) e.stopPropagation(); if (onKeyDown) onKeyDown(e); }} {...props} />
);

// ─── 공통 필드 래퍼 ──────────────────────────────────────────────────────────
const Field = ({ label, children, hint }) => (
  <div className="config-field" style={{ marginBottom: 14 }}>
    <label className="config-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>{label}</label>
    {children}
    {hint && <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>{hint}</p>}
  </div>
);

// ─── CSV 파싱 유틸: 첫 번째 행으로 컬럼 이름/타입 감지 ───────────────────────
function inferTypeFromValues(values) {
  const nonEmpty = values.filter(v => v !== '' && v !== null && v !== undefined);
  if (nonEmpty.length === 0) return 'String';
  const allInt    = nonEmpty.every(v => /^-?\d+$/.test(v.trim()));
  if (allInt) return 'Int';
  const allFloat  = nonEmpty.every(v => /^-?\d+(\.\d+)?$/.test(v.trim()));
  if (allFloat) return 'Float';
  const boolVals  = ['true', 'false', '1', '0', 'yes', 'no'];
  const allBool   = nonEmpty.every(v => boolVals.includes(v.trim().toLowerCase()));
  if (allBool) return 'Bool';
  const dateRe    = /^\d{4}[-/]\d{2}[-/]\d{2}(T\d{2}:\d{2})?/;
  const allDate   = nonEmpty.every(v => dateRe.test(v.trim()));
  if (allDate) return nonEmpty.some(v => v.includes('T')) ? 'DateTime' : 'Date';
  return 'String';
}

function parseCSVSchema(text) {
  // 맨 앞 BOM 제거
  const cleaned = text.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return [];

  // 헤더 행 파싱 (따옴표 처리)
  const parseRow = (line) => {
    const result = [];
    let inQuotes = false;
    let current  = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result.map(v => v.trim());
  };

  const headers = parseRow(lines[0]);

  // 샘플 데이터(최대 20행)로 타입 추론
  const sampleRows = lines.slice(1, 21).map(l => parseRow(l));
  const schema = headers.map((name, colIdx) => {
    const colValues = sampleRows.map(r => r[colIdx] || '');
    return { name: name || `col_${colIdx}`, type: inferTypeFromValues(colValues) };
  });

  return schema;
}

// ─── 연산자 목록 (x1zzLang 지원 연산자만) ────────────────────────────────────
const FILTER_OPERATORS = [
  { value: '==',  label: 'Equals (==)' },
  { value: '!=',  label: 'Not Equals (!=)' },
  { value: '>',   label: 'Greater Than (>)' },
  { value: '>=',  label: 'Greater Than or Equal (>=)' },
  { value: '<',   label: 'Less Than (<)' },
  { value: '<=',  label: 'Less Than or Equal (<=)' },
];

// ─── AGG 목록 (x1zzLang groupBy 지원 집계 함수) ──────────────────────────────
const AGG_OPTIONS = [
  { value: 'count', label: 'count' },
  { value: 'sum',   label: 'sum' },
  { value: 'mean',  label: 'mean' },
  { value: 'min',   label: 'min' },
  { value: 'max',   label: 'max' },
];

// ─── CONFIG_WINDOW ────────────────────────────────────────────────────────────
const ConfigWindow = ({
  selectedNode,
  upstreamSchema = [],
  onUpdateParams,
  availableTools = [],
  nodes = [],
  edges = [],
  setNodes,
  style = {},
}) => {
  const { t } = useTranslation();
  const localFileRef = useRef(null);

  const isValidNode = selectedNode && typeof selectedNode === 'object' && selectedNode.id;
  const id         = isValidNode ? selectedNode.id   : null;
  const type       = isValidNode ? selectedNode.type : null;
  const data       = isValidNode ? selectedNode.data : null;
  const parameters = data?.parameters || {};

  // select ノード用: upstreamSchema が変わったら columns を同期
  useEffect(() => {
    if (!isValidNode || type !== 'select') return;
    if (!Array.isArray(upstreamSchema) || upstreamSchema.length === 0) return;

    const current = Array.isArray(parameters.columns) ? parameters.columns.filter(Boolean) : [];
    const currentNames = current.map(c => c.name);
    const upstreamNames = upstreamSchema.map(c => c.name);

    const needsSync =
      current.length === 0 ||
      current.length !== upstreamSchema.length ||
      upstreamNames.some(n => !currentNames.includes(n));

    if (needsSync) {
      const synced = upstreamSchema.map(col => {
        const ex = current.find(c => c.name === col.name);
        return { name: col.name, keep: ex ? ex.keep : true };
      });
      if (JSON.stringify(current) !== JSON.stringify(synced)) {
        onUpdateParams(id, { ...parameters, columns: synced });
      }
    }
  }, [isValidNode, type, id, upstreamSchema, parameters.columns, onUpdateParams]); // eslint-disable-line

  const update = (patch) => onUpdateParams(id, { ...parameters, ...patch });

  // 컬럼 선택 드롭다운 (upstream schema 컬럼 목록)
  const ColSelect = ({ value, onChange, name }) => (
    <SafeSelect
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      className="config-input"
      style={{ width: '100%' }}
      name={name}
    >
      <option value="">— select column —</option>
      {upstreamSchema.map(col => (
        <option key={col.name} value={col.name}>{col.name} ({col.type || ''})</option>
      ))}
    </SafeSelect>
  );

  // ── 노드 타입별 렌더러 ────────────────────────────────────────────────────
  const renderTitle = () => {
    const typeKey = `config.nodeTypes.${type}`;
    const translated = t(typeKey);
    if (translated !== typeKey) return translated;

    const labels = {
      fileInput: 'File Input', filter: 'Filter', select: 'Select',
      groupBy:   'Group By',   count:  'Count',  sort:   'Sort (orderBy)',
      take:      'Take',       dropNull: 'Drop Null', fillNull: 'Fill Null',
      comment:   'Comment',   container: 'Container',
    };
    return labels[type] || (availableTools.find(t2 => t2.id === type)?.name) || type || 'Node';
  };

  // ── 로컬 파일 선택 핸들러 ─────────────────────────────────────────────────
  const handleLocalFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const arrayBuffer = ev.target.result;

      // 인코딩 자동 감지: UTF-8 (strict) → EUC-KR → UTF-8 (fallback)
      let text = '';
      try {
        const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
        text = utf8Decoder.decode(arrayBuffer);
      } catch {
        try {
          const euckrDecoder = new TextDecoder('euc-kr');
          text = euckrDecoder.decode(arrayBuffer);
        } catch {
          const fallbackDecoder = new TextDecoder('utf-8');
          text = fallbackDecoder.decode(arrayBuffer);
        }
      }

      const detectedSchema = parseCSVSchema(text);
      update({ filePath: file.name, detectedSchema });
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // fileInput ──────────────────────────────────────────────────────────────────
  const renderFileInput = () => {
    const schema = parameters.detectedSchema || [];

    const updateSchemaRow = (idx, patch) => {
      const next = schema.map((row, i) => i === idx ? { ...row, ...patch } : row);
      update({ detectedSchema: next });
    };
    const addSchemaRow    = () => update({ detectedSchema: [...schema, { name: '', type: 'String' }] });
    const removeSchemaRow = (idx) => update({ detectedSchema: schema.filter((_, i) => i !== idx) });

    return (
      <>
        {/* 로컬 파일 불러오기 */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            {t('config.fileInput.localFile')}
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              ref={localFileRef}
              type="file"
              accept=".csv,.tsv,.txt"
              style={{ display: 'none' }}
              onChange={handleLocalFileSelect}
            />
            <button
              onClick={() => localFileRef.current?.click()}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 6,
                border: '1px solid var(--color-accent, #6366f1)',
                background: 'var(--color-accent-light, #eef2ff)',
                color: 'var(--color-accent, #6366f1)',
                fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <Upload size={13} />
              {t('config.fileInput.localFileBtn')}
            </button>
            {parameters.filePath && (
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                {parameters.filePath}
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {t('config.fileInput.localFileHint')}
          </p>
        </div>

        <Field label={t('config.fileInput.filePath')}>
          <SafeInput
            className="config-input"
            style={{ width: '100%' }}
            value={parameters.filePath || ''}
            onChange={e => update({ filePath: e.target.value })}
            placeholder={t('config.fileInput.filePathPlaceholder')}
          />
        </Field>

        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {t('config.fileInput.schema')}
            </label>
            <button
              onClick={addSchemaRow}
              style={{ fontSize: '0.7rem', background: 'none', border: '1px solid var(--border-color)', borderRadius: 4, cursor: 'pointer', padding: '2px 8px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Plus size={10} />{t('config.fileInput.addColumn')}
            </button>
          </div>
          {schema.length === 0 && (
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {t('config.fileInput.noColumns')}
            </p>
          )}
          {schema.map((col, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <SafeInput
                className="config-input"
                style={{ flex: 2, minWidth: 0 }}
                value={col.name || ''}
                onChange={e => updateSchemaRow(idx, { name: e.target.value })}
                placeholder={t('config.fileInput.columnNamePlaceholder')}
              />
              <SafeSelect
                className="config-input"
                style={{ flex: 1, minWidth: 0 }}
                value={col.type || 'String'}
                onChange={e => updateSchemaRow(idx, { type: e.target.value })}
              >
                {['String', 'Int', 'Float', 'Bool', 'Date', 'DateTime', 'Time'].map(tp => (
                  <option key={tp} value={tp}>{tp}</option>
                ))}
              </SafeSelect>
              <button
                onClick={() => removeSchemaRow(idx)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', flexShrink: 0 }}
                title="Remove row"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      </>
    );
  };

  // filter ─────────────────────────────────────────────────────────────────────
  const renderFilter = () => (
    <>
      <Field label={t('config.filter.column')}>
        <ColSelect
          value={parameters.column}
          onChange={v => update({ column: v })}
          name="filter-column"
        />
        {!upstreamSchema.length && (
          <SafeInput className="config-input" style={{ width: '100%', marginTop: 4 }} value={parameters.column || ''} onChange={e => update({ column: e.target.value })} placeholder="column name" />
        )}
      </Field>
      <Field label={t('config.filter.operator')}>
        <SafeSelect className="config-input" style={{ width: '100%' }} value={parameters.operator || '=='} onChange={e => update({ operator: e.target.value })}>
          {FILTER_OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
        </SafeSelect>
      </Field>
      <Field label={t('config.filter.value')} hint={t('config.filter.valueHint')}>
        <SafeInput className="config-input" style={{ width: '100%' }} value={parameters.value ?? ''} onChange={e => update({ value: e.target.value })} placeholder={t('config.filter.valuePlaceholder')} />
      </Field>
    </>
  );

  // select ─────────────────────────────────────────────────────────────────────
  const renderSelect = () => {
    const columns = Array.isArray(parameters.columns) ? parameters.columns.filter(Boolean) : [];
    const toggleAll = (keep) => update({ columns: columns.map(c => ({ ...c, keep })) });

    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {t('config.select.columnsToKeep')}
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => toggleAll(true)}  style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border-color)', cursor: 'pointer' }}>{t('config.select.all')}</button>
            <button onClick={() => toggleAll(false)} style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border-color)', cursor: 'pointer' }}>{t('config.select.none')}</button>
          </div>
        </div>
        {columns.length === 0 && (
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {t('config.select.noColumns')}
          </p>
        )}
        {columns.map((col, idx) => (
          <div key={col.name + idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 4, background: col.keep ? 'var(--bg-secondary)' : 'transparent', marginBottom: 3 }}>
            <input
              type="checkbox"
              checked={col.keep !== false}
              onChange={e => update({ columns: columns.map((c, i) => i === idx ? { ...c, keep: e.target.checked } : c) })}
              style={{ accentColor: 'var(--color-accent)', flexShrink: 0 }}
            />
            <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: col.keep !== false ? 'var(--text-primary)' : 'var(--text-muted)', flex: 1 }}>{col.name}</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{(upstreamSchema.find(s => s.name === col.name) || {}).type || ''}</span>
          </div>
        ))}
      </>
    );
  };

  // groupBy ────────────────────────────────────────────────────────────────────
  const renderGroupBy = () => (
    <>
      <Field label={t('config.groupBy.column')}>
        <ColSelect value={parameters.column} onChange={v => update({ column: v })} name="groupBy-column" />
        {!upstreamSchema.length && (
          <SafeInput className="config-input" style={{ width: '100%', marginTop: 4 }} value={parameters.column || ''} onChange={e => update({ column: e.target.value })} placeholder="column name" />
        )}
      </Field>
      <Field label={t('config.groupBy.agg')}>
        <SafeSelect className="config-input" style={{ width: '100%' }} value={parameters.agg || 'count'} onChange={e => update({ agg: e.target.value })}>
          {AGG_OPTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </SafeSelect>
      </Field>
    </>
  );

  // count ──────────────────────────────────────────────────────────────────────
  const renderCount = () => (
    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '8px 0' }}>
      {t('config.count.description')}
    </p>
  );

  // sort ───────────────────────────────────────────────────────────────────────
  const renderSort = () => (
    <>
      <Field label={t('config.sort.column')}>
        <ColSelect value={parameters.column} onChange={v => update({ column: v })} name="sort-column" />
        {!upstreamSchema.length && (
          <SafeInput className="config-input" style={{ width: '100%', marginTop: 4 }} value={parameters.column || ''} onChange={e => update({ column: e.target.value })} placeholder="column name" />
        )}
      </Field>
      <Field label={t('config.sort.order')}>
        <SafeSelect className="config-input" style={{ width: '100%' }} value={parameters.descending ? 'desc' : 'asc'} onChange={e => update({ descending: e.target.value === 'desc' })}>
          <option value="asc">{t('config.sort.asc')}</option>
          <option value="desc">{t('config.sort.desc')}</option>
        </SafeSelect>
      </Field>
    </>
  );

  // take ───────────────────────────────────────────────────────────────────────
  const renderTake = () => (
    <Field label={t('config.take.n')} hint={t('config.take.nHint')}>
      <SafeInput
        className="config-input"
        style={{ width: '100%' }}
        type="number"
        min={1}
        value={parameters.n ?? 100}
        onChange={e => update({ n: parseInt(e.target.value, 10) || 100 })}
      />
    </Field>
  );

  // dropNull ───────────────────────────────────────────────────────────────────
  const renderDropNull = () => {
    const cols = parameters.columns || [];
    const addCol = (name) => { if (name && !cols.includes(name)) update({ columns: [...cols, name] }); };
    const removeCol = (name) => update({ columns: cols.filter(c => c !== name) });

    return (
      <>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 10 }}>
          {t('config.dropNull.description')}
        </p>
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <SafeSelect
              className="config-input"
              style={{ flex: 1 }}
              value=""
              onChange={e => { addCol(e.target.value); e.target.value = ''; }}
            >
              <option value="">{t('config.dropNull.addColumnFilter')}</option>
              {upstreamSchema.filter(c => !cols.includes(c.name)).map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </SafeSelect>
          </div>
          {cols.map(col => (
            <div key={col} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: 'var(--bg-secondary)', borderRadius: 4, marginBottom: 3 }}>
              <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{col}</span>
              <button onClick={() => removeCol(col)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><X size={12} /></button>
            </div>
          ))}
        </div>
      </>
    );
  };

  // fillNull ───────────────────────────────────────────────────────────────────
  const renderFillNull = () => (
    <>
      <Field label={t('config.fillNull.column')} hint={t('config.fillNull.columnHint')}>
        <ColSelect value={parameters.column} onChange={v => update({ column: v })} name="fillNull-column" />
        {!upstreamSchema.length && (
          <SafeInput className="config-input" style={{ width: '100%', marginTop: 4 }} value={parameters.column || ''} onChange={e => update({ column: e.target.value })} placeholder="leave empty for all columns" />
        )}
        {parameters.column && (
          <button onClick={() => update({ column: '' })} style={{ fontSize: '0.7rem', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', marginTop: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
            <X size={10} />{t('config.fillNull.clearColumn')}
          </button>
        )}
      </Field>
      <Field label={t('config.fillNull.value')} hint={t('config.fillNull.valueHint')}>
        <SafeInput
          className="config-input"
          style={{ width: '100%' }}
          value={parameters.value ?? ''}
          onChange={e => update({ value: e.target.value })}
          placeholder={t('config.fillNull.valuePlaceholder')}
        />
      </Field>
    </>
  );

  // join ───────────────────────────────────────────────────────────────────────
  const renderJoin = () => (
    <>
      <Field label={t('config.join.joinType')}>
        <SafeSelect className="config-input" style={{ width: '100%' }} value={parameters.joinType || 'inner'} onChange={e => update({ joinType: e.target.value })}>
          <option value="inner">inner</option>
          <option value="left">left</option>
          <option value="right">right</option>
          <option value="outer">outer</option>
        </SafeSelect>
      </Field>
      <Field label={t('config.join.left')} hint={t('config.join.leftHint')}>
        <SafeInput className="config-input" style={{ width: '100%' }} value={parameters.left || ''} onChange={e => update({ left: e.target.value })} placeholder="e.g. ds1" />
      </Field>
      <Field label={t('config.join.right')} hint={t('config.join.rightHint')}>
        <SafeInput className="config-input" style={{ width: '100%' }} value={parameters.right || ''} onChange={e => update({ right: e.target.value })} placeholder="e.g. ds2" />
      </Field>
      <Field label={t('config.join.on')}>
        <ColSelect value={parameters.on} onChange={v => update({ on: v })} name="join-on" />
        {!upstreamSchema.length && (
          <SafeInput className="config-input" style={{ width: '100%', marginTop: 4 }} value={parameters.on || ''} onChange={e => update({ on: e.target.value })} placeholder="key column name" />
        )}
      </Field>
    </>
  );

  // withColumn ─────────────────────────────────────────────────────────────────
  const renderWithColumn = () => (
    <>
      <Field label={t('config.withColumn.col')}>
        <SafeInput className="config-input" style={{ width: '100%' }} value={parameters.col || ''} onChange={e => update({ col: e.target.value })} placeholder='e.g. new_col' />
      </Field>
      <Field label={t('config.withColumn.expr')} hint={t('config.withColumn.exprHint')}>
        <SafeInput className="config-input" style={{ width: '100%' }} value={parameters.expr || ''} onChange={e => update({ expr: e.target.value })} placeholder='e.g. col("Age") * 2' />
      </Field>
    </>
  );

  // chart ──────────────────────────────────────────────────────────────────────
  const renderChart = () => (
    <>
      <Field label={t('config.chart.chartType')}>
        <SafeSelect className="config-input" style={{ width: '100%' }} value={parameters.chartType || 'bar'} onChange={e => update({ chartType: e.target.value })}>
          <option value="bar">bar</option>
          <option value="line">line</option>
          <option value="scatter">scatter</option>
          <option value="pie">pie</option>
          <option value="area">area</option>
        </SafeSelect>
      </Field>
      <Field label={t('config.chart.x')}>
        <ColSelect value={parameters.x} onChange={v => update({ x: v })} name="chart-x" />
        {!upstreamSchema.length && (
          <SafeInput className="config-input" style={{ width: '100%', marginTop: 4 }} value={parameters.x || ''} onChange={e => update({ x: e.target.value })} placeholder="x-axis column" />
        )}
      </Field>
      <Field label={t('config.chart.y')}>
        <ColSelect value={parameters.y} onChange={v => update({ y: v })} name="chart-y" />
        {!upstreamSchema.length && (
          <SafeInput className="config-input" style={{ width: '100%', marginTop: 4 }} value={parameters.y || ''} onChange={e => update({ y: e.target.value })} placeholder="y-axis column" />
        )}
      </Field>
      <Field label={t('config.chart.title')}>
        <SafeInput className="config-input" style={{ width: '100%' }} value={parameters.title || ''} onChange={e => update({ title: e.target.value })} placeholder='e.g. Sales by Department' />
      </Field>
    </>
  );

  // comment / container ────────────────────────────────────────────────────────
  const renderComment = () => (

    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
      {t('config.comment.description')}
    </p>
  );

  const renderContainer = () => (
    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
      {t('config.container.description')}
    </p>
  );

  // ── 렌더 라우터 ──────────────────────────────────────────────────────────────
  const renderBody = () => {
    if (!isValidNode) {
      const multiSelected = nodes.filter(n => n.selected);
      if (multiSelected.length > 1) {
        return (
          <div style={{ padding: 16 }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
              {t('config.nodesSelected', { count: multiSelected.length })}
            </p>
            {multiSelected.map(n => (
              <div key={n.id} style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6, marginBottom: 6, fontSize: '0.8rem' }}>
                {n.data?.label || n.type} <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>({n.id})</span>
              </div>
            ))}
          </div>
        );
      }
      return (
        <div className="no-node-selected" style={{ padding: 24 }}>
          <Settings size={28} style={{ opacity: 0.3, marginBottom: 12 }} />
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
            {t('config.selectNode')}
          </p>
        </div>
      );
    }

    switch (type) {
      case 'fileInput':  return renderFileInput();
      case 'filter':     return renderFilter();
      case 'select':     return renderSelect();
      case 'groupBy':    return renderGroupBy();
      case 'count':      return renderCount();
      case 'sort':       return renderSort();
      case 'take':       return renderTake();
      case 'dropNull':   return renderDropNull();
      case 'fillNull':    return renderFillNull();
      case 'join':        return renderJoin();
      case 'withColumn':  return renderWithColumn();
      case 'chart':       return renderChart();
      case 'comment':     return renderComment();
      case 'container':   return renderContainer();

      default:
        return (
          <div style={{ padding: 16 }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {t('config.unsupportedNode', { type })}
            </p>
          </div>
        );
    }
  };

  return (
    <div className="config-sidebar" style={style}>
      <div className="sidebar-header">
        <span className="sidebar-title">
          <Settings size={16} />
          {isValidNode ? renderTitle() : t('config.title')}
        </span>
        {isValidNode && (
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{id}</span>
        )}
      </div>
      <div className="sidebar-content" style={{ padding: isValidNode ? 16 : 0, overflowY: 'auto', flex: 1 }}>
        {renderBody()}
      </div>
    </div>
  );
};

export default ConfigWindow;
