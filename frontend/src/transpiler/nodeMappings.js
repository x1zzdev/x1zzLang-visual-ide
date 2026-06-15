/**
 * nodeMappings.js
 * SUPPORTED_OPS 에 맞는 x1zzLang 변환 규칙만 정의합니다.
 *
 * SUPPORTED_OPS:
 *   load, select, filter, count, groupBy, sum, mean, min, max,
 *   orderBy, take, dropNull, fillNull, col, literals (true/false/numbers)
 */

import { resolvePath, isAliasPath } from './pathResolver.js';

// ─── 경로 정규화 ───────────────────────────────────────────────────────────────

/**
 * UI 레이어에서 받은 원시 파일명을 DSL 표준 "@data/filename" 형식으로 정규화합니다.
 *
 * 규칙:
 *   - "@data/" 로 시작  → 그대로 유지 (이미 정규화된 형식)
 *   - 다른 "@alias"     → 그대로 유지 (resolvePath에서 처리)
 *   - 절대 경로 (C:\, /) → 그대로 유지 (OS 절대 경로)
 *   - 순수 파일명       → "@data/filename" 으로 변환
 *
 * @param {string} path - UI에서 전달된 원본 경로 (예: "seoul_air_2026.csv")
 * @returns {string} 정규화된 DSL 경로 (예: "@data/seoul_air_2026.csv")
 */
export function normalizeLoadPath(path) {
  if (!path || typeof path !== 'string') return '@data/data.csv';

  // 이미 @data/ 형식 → 그대로
  if (path.startsWith('@data/')) return path;

  // 다른 @alias 형식 → 그대로 (resolvePath가 처리)
  if (path.startsWith('@')) return path;

  // 절대 경로 (Windows: C:\... 또는 Unix: /...) → 그대로
  if (/^[A-Za-z]:[\\\/]/.test(path) || path.startsWith('/')) return path;

  // 순수 파일명 → @data/ 접두사 추가
  return `@data/${path}`;
}

// ─── 내부 헬퍼 ────────────────────────────────────────────────────────────────

/**
 * 컬럼 이름을 x1zzLang 식별자로 사용 가능한 internal name으로 변환
 * 식별자에 허용되지 않는 문자(괄호, 공백, 특수문자 등)를 _로 치환
 * 한글은 허용
 */
export function sanitizeFieldName(name) {
  return String(name).replace(/[^a-zA-Z0-9_\uAC00-\uD7AF]/g, '_');
}

/**
 * 노드의 columnMapping을 이용해 original name → internal name 변환
 * columnMapping이 없으면 sanitizeFieldName으로 폴백
 * @param {Object} node
 * @param {string} originalName
 * @returns {string}
 */
function resolveColumn(node, originalName) {
  const mapping = node.data?.parameters?.columnMapping || {};
  return mapping[originalName] ?? sanitizeFieldName(originalName);
}

/**
 * Python/Polars 타입 → x1zzLang 타입
 */
function mapTypeToX1zz(rawType) {
  const t = (rawType || 'String').toLowerCase().replace(/\s+/g, '');
  if (t.includes('int'))                             return 'Int';
  if (t.includes('float') || t.includes('double'))  return 'Float';
  if (t.includes('bool'))                            return 'Bool';
  if (t.includes('datetime') || t.includes('timestamp')) return 'DateTime';
  if (t.includes('date'))                            return 'Date';
  if (t.includes('time'))                            return 'Time';
  return 'String';
}

/**
 * detectedSchema 배열 → x1zzLang type 블록 필드 문자열
 * original name 대신 sanitize된 internal name 사용
 */
function buildSchemaFields(schema) {
  if (!schema || schema.length === 0) return '  _unknown: String';
  return schema
    .map(col => `  ${sanitizeFieldName(col.name)}: ${mapTypeToX1zz(col.type || 'String')}`)
    .join(',\n');
}

/**
 * 비교 연산자 → x1zzLang 연산자
 */
function mapOperator(op) {
  const MAP = { '==': '==', '!=': '!=', '>': '>', '>=': '>=', '<': '<', '<=': '<=' };
  return MAP[op] || '==';
}

/**
 * 값을 x1zzLang 리터럴로 변환
 * - 숫자(언더스코어 포함 가능) → 그대로
 * - true/false                 → 그대로
 * - 그 외                      → "..." 문자열 리터럴
 */
function toLiteral(raw) {
  if (raw === '' || raw === undefined || raw === null) return '""';
  const s = String(raw).trim();
  if (s === 'true' || s === 'false')       return s;
  if (/^-?[\d_]+(\.\d+)?$/.test(s))       return s;
  return `"${s}"`;
}

// ─── NODE_MAPPINGS ─────────────────────────────────────────────────────────────

/**
 * 각 노드 타입별 변환 함수.
 * 반환 형식: { type: 'source' | 'pipeline' | 'terminal', lines: string[] }
 */
export const NODE_MAPPINGS = {

  // ── fileInput ─────────────────────────────────────────────────────────────
  // type Schema_<var> = { ... }
  // v <var> = load("path") :: Schema_<var>
  fileInput: (node, varName) => {
    const params     = node.data?.parameters || {};
    const rawPath    = params.filePath || 'data.csv';
    const schema     = params.detectedSchema || [];
    const schemaName = `Schema_${varName}`;

    // UI에서 받은 원시 파일명을 "@data/filename" DSL 표준 형식으로 정규화
    const normalizedPath = normalizeLoadPath(rawPath);

    // @alias 경로 resolve (@data/, @assets/ 등)
    let resolvedPath;
    let pathError = null;
    try {
      resolvedPath = resolvePath(normalizedPath);
    } catch (e) {
      resolvedPath = normalizedPath;
      pathError = e.message;
    }

    // original ↔ internal name 매핑 테이블 생성
    // original name과 internal name이 다른 컬럼만 포함
    const columnMapping = {};
    schema.forEach(col => {
      const internal = sanitizeFieldName(col.name);
      columnMapping[col.name] = internal;
    });

    // columnMapping을 node.data.parameters에 저장 (다운스트림 노드가 참조)
    if (node.data && node.data.parameters) {
      node.data.parameters.columnMapping = columnMapping;
    }

    const typeBlock = `type ${schemaName} = {\n${buildSchemaFields(schema)}\n}`;

    // @alias 경로인 경우 주석에 원본 alias 표기, 실제 코드에는 resolved 경로 사용
    const loadStmt = isAliasPath(normalizedPath)
      ? `v ${varName} = load("${resolvedPath}") :: ${schemaName}  // @alias: ${normalizedPath}`
      : `v ${varName} = load("${resolvedPath}") :: ${schemaName}`;

    // 변환이 필요한 컬럼 목록 주석 생성
    const mappingEntries = Object.entries(columnMapping)
      .filter(([orig, internal]) => orig !== internal);
    const mappingComment = mappingEntries.length > 0
      ? `// column mapping: ${mappingEntries.map(([o, i]) => `${o} → ${i}`).join(', ')}`
      : null;

    const resultLines = [];
    if (pathError) {
      resultLines.push(`// [x1zz PATH ERROR] ${pathError}`);
    }
    resultLines.push(typeBlock);
    resultLines.push(loadStmt);
    if (mappingComment) resultLines.push(mappingComment);

    return { type: 'source', lines: resultLines, varName, columnMapping };
  },

  // ── filter ────────────────────────────────────────────────────────────────
  // |> filter(col("column") op literal)
  filter: (node) => {
    const params   = node.data?.parameters || {};
    const column   = resolveColumn(node, params.column || '_col');
    const operator = mapOperator(params.operator || '==');
    const value    = toLiteral(params.value ?? '');

    return {
      type: 'pipeline',
      lines: [`|> filter(col("${column}") ${operator} ${value})`],
    };
  },

  // ── select ────────────────────────────────────────────────────────────────
  // |> select(["col1", "col2"])
  select: (node) => {
    const params  = node.data?.parameters || {};
    const columns = params.columns || [];

    // columns は文字列配列 または { name, keep? } 配列を受け入れる
    const colNames = columns
      .map(c => {
        const name = typeof c === 'string' ? c : (c.keep !== false ? c.name : null);
        if (!name) return null;
        return `"${resolveColumn(node, name)}"`;
      })
      .filter(Boolean)
      .join(', ');

    if (!colNames) {
      return { type: 'pipeline', lines: [`|> select([])  // no columns configured`] };
    }

    return { type: 'pipeline', lines: [`|> select([${colNames}])`] };
  },

  // ── groupBy ───────────────────────────────────────────────────────────────
  // |> groupBy("column") |> count
  // |> groupBy("column") |> sum("column")
  groupBy: (node) => {
    const params = node.data?.parameters || {};
    const column = resolveColumn(node, params.column || '_col');
    const agg = params.agg || 'count';

    if (agg === 'count') {
      return { type: 'pipeline', lines: [`|> groupBy("${column}") |> count`] };
    }
    return { type: 'pipeline', lines: [`|> groupBy("${column}") |> ${agg}("${column}")`] };
  },

  // ── count ─────────────────────────────────────────────────────────────────
  // |> count  OR  |> count("col")
  count: (node) => {
    const params = node.data?.parameters || {};
    const column = params.column ? resolveColumn(node, params.column) : null;

    return {
      type: 'pipeline',
      lines: [column ? `|> count("${column}")` : `|> count`],
    };
  },

  // ── sum ───────────────────────────────────────────────────────────────────
  // |> sum("col")
  sum: (node) => {
    const params = node.data?.parameters || {};
    const column = resolveColumn(node, params.column || '_col');
    return { type: 'pipeline', lines: [`|> sum("${column}")`] };
  },

  // ── mean ──────────────────────────────────────────────────────────────────
  // |> mean("col")
  mean: (node) => {
    const params = node.data?.parameters || {};
    const column = resolveColumn(node, params.column || '_col');
    return { type: 'pipeline', lines: [`|> mean("${column}")`] };
  },

  // ── min ───────────────────────────────────────────────────────────────────
  // |> min("col")
  min: (node) => {
    const params = node.data?.parameters || {};
    const column = resolveColumn(node, params.column || '_col');
    return { type: 'pipeline', lines: [`|> min("${column}")`] };
  },

  // ── max ───────────────────────────────────────────────────────────────────
  // |> max("col")
  max: (node) => {
    const params = node.data?.parameters || {};
    const column = resolveColumn(node, params.column || '_col');
    return { type: 'pipeline', lines: [`|> max("${column}")`] };
  },

  // ── sort (→ orderBy) ──────────────────────────────────────────────────────
  // |> orderBy("column", desc: bool)
  sort: (node) => {
    const params = node.data?.parameters || {};
    const column = resolveColumn(node, params.column || '_col');
    const desc   = params.descending === true ? 'true' : 'false';

    return { type: 'pipeline', lines: [`|> orderBy("${column}", desc: ${desc})`] };
  },

  // ── take ──────────────────────────────────────────────────────────────────
  // |> take(n)
  take: (node) => {
    const params = node.data?.parameters || {};
    const n      = parseInt(params.count ?? params.n ?? 100, 10);
    const safeN  = isNaN(n) || n < 1 ? 100 : n;

    return { type: 'pipeline', lines: [`|> take(${safeN})`] };
  },

  // ── dropNull ──────────────────────────────────────────────────────────────
  // |> dropNull("col")  ← col 은 필수 (x1zzLang 명세)
  dropNull: (node) => {
    const params = node.data?.parameters || {};
    const column = resolveColumn(node, params.column || '_col');

    return { type: 'pipeline', lines: [`|> dropNull("${column}")`] };
  },

  // ── fillNull ──────────────────────────────────────────────────────────────
  // |> fillNull("col", value)  ← col 은 필수 (x1zzLang 명세)
  fillNull: (node) => {
    const params = node.data?.parameters || {};
    const column = resolveColumn(node, params.column || '_col');
    const value  = toLiteral(params.value ?? 0);

    return { type: 'pipeline', lines: [`|> fillNull("${column}", ${value})`] };
  },

  // ── join ──────────────────────────────────────────────────────────────────
  // |> join left right on col
  join: (node) => {
    const params    = node.data?.parameters || {};
    const left      = params.left  || 'left';
    const right     = params.right || 'right';
    const on        = params.on    || '_col';
    const joinType  = params.joinType || 'inner';

    return {
      type: 'pipeline',
      lines: [`|> join ${joinType} ${left} ${right} on "${on}"`],
    };
  },

  // ── withColumn ────────────────────────────────────────────────────────────
  // |> withColumn col = expr
  withColumn: (node) => {
    const params = node.data?.parameters || {};
    const col    = params.col  || 'new_col';
    const expr   = params.expr || '"value"';

    return {
      type: 'pipeline',
      lines: [`|> withColumn ${col} = ${expr}`],
    };
  },

  // ── chart ─────────────────────────────────────────────────────────────────
  // |> chart { type: "bar", x: "col", y: "col", title: "title" }
  chart: (node) => {
    const params    = node.data?.parameters || {};
    const chartType = params.chartType || 'bar';
    const x         = params.x         || '_col';
    const y         = params.y         || '_col';
    const title     = params.title     || '';

    const titlePart = title ? `, title: "${title}"` : '';
    return {
      type: 'pipeline',
      lines: [`|> chart { type: "${chartType}", x: "${x}", y: "${y}"${titlePart} }`],
    };
  },
};


// ─── 폴백 ─────────────────────────────────────────────────────────────────────

/**
 * 지원하지 않는(또는 알 수 없는) 노드 타입의 폴백 매핑.
 * 주석으로만 표시되어 x1zzLang 코드에 영향을 주지 않습니다.
 */
export function getFallbackMapping(node) {
  const typeName = node.type || 'unknown';
  return {
    type: 'pipeline',
    lines: [`// [${typeName}] unsupported node type – skipped`],
  };
}
