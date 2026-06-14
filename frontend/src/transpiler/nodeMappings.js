/**
 * nodeMappings.js
 * SUPPORTED_OPS 에 맞는 x1zzLang 변환 규칙만 정의합니다.
 *
 * SUPPORTED_OPS:
 *   load, select, filter, count, groupBy, sum, mean, min, max,
 *   orderBy, take, dropNull, fillNull, col, literals (true/false/numbers)
 */

// ─── 내부 헬퍼 ────────────────────────────────────────────────────────────────

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
 */
function buildSchemaFields(schema) {
  if (!schema || schema.length === 0) return '  _unknown: String';
  return schema
    .map(col => `  ${col.name}: ${mapTypeToX1zz(col.type || 'String')}`)
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
    const params    = node.data?.parameters || {};
    const filePath  = params.filePath || 'data.csv';
    const schema    = params.detectedSchema || [];
    const schemaName = `Schema_${varName}`;

    const typeBlock = `type ${schemaName} = {\n${buildSchemaFields(schema)}\n}`;
    const loadStmt  = `v ${varName} = load("${filePath}") :: ${schemaName}`;

    return { type: 'source', lines: [typeBlock, loadStmt], varName };
  },

  // ── filter ────────────────────────────────────────────────────────────────
  // |> filter(col("column") op literal)
  filter: (node) => {
    const params   = node.data?.parameters || {};
    const column   = params.column   || '_col';
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
      .map(c => (typeof c === 'string' ? c : (c.keep !== false ? c.name : null)))
      .filter(Boolean)
      .map(n => `"${n}"`)
      .join(', ');

    if (!colNames) {
      return { type: 'pipeline', lines: [`|> select([])  // no columns configured`] };
    }

    return { type: 'pipeline', lines: [`|> select([${colNames}])`] };
  },

  // ── groupBy ───────────────────────────────────────────────────────────────
  // |> groupBy("column")
  groupBy: (node) => {
    const params = node.data?.parameters || {};
    const column = params.column || '_col';

    return { type: 'pipeline', lines: [`|> groupBy("${column}")`] };
  },

  // ── count ─────────────────────────────────────────────────────────────────
  // |> count  OR  |> count("col")
  count: (node) => {
    const params = node.data?.parameters || {};
    const column = params.column;

    return {
      type: 'pipeline',
      lines: [column ? `|> count("${column}")` : `|> count`],
    };
  },

  // ── sum ───────────────────────────────────────────────────────────────────
  // |> sum("col")
  sum: (node) => {
    const params = node.data?.parameters || {};
    const column = params.column || '_col';
    return { type: 'pipeline', lines: [`|> sum("${column}")`] };
  },

  // ── mean ──────────────────────────────────────────────────────────────────
  // |> mean("col")
  mean: (node) => {
    const params = node.data?.parameters || {};
    const column = params.column || '_col';
    return { type: 'pipeline', lines: [`|> mean("${column}")`] };
  },

  // ── min ───────────────────────────────────────────────────────────────────
  // |> min("col")
  min: (node) => {
    const params = node.data?.parameters || {};
    const column = params.column || '_col';
    return { type: 'pipeline', lines: [`|> min("${column}")`] };
  },

  // ── max ───────────────────────────────────────────────────────────────────
  // |> max("col")
  max: (node) => {
    const params = node.data?.parameters || {};
    const column = params.column || '_col';
    return { type: 'pipeline', lines: [`|> max("${column}")`] };
  },

  // ── sort (→ orderBy) ──────────────────────────────────────────────────────
  // |> orderBy("column", desc: bool)
  sort: (node) => {
    const params = node.data?.parameters || {};
    const column = params.column     || '_col';
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
    const column = params.column || '_col';

    return { type: 'pipeline', lines: [`|> dropNull("${column}")`] };
  },

  // ── fillNull ──────────────────────────────────────────────────────────────
  // |> fillNull("col", value)  ← col 은 필수 (x1zzLang 명세)
  fillNull: (node) => {
    const params = node.data?.parameters || {};
    const column = params.column || '_col';
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
