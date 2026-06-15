/**
 * stdoutParser.js
 *
 * PART 1 ~ 3 구현 — Execution Output System (Parsing Layer)
 *
 * stdout 라인 배열을 type-driven structured event 로 변환합니다.
 *
 * ── Output Contracts ─────────────────────────────────────────────────────────
 *   [x1zz:chart]           → 다음 줄: JSON payload → ChartEvent
 *   [x1zz:error]           → 다음 줄: ERROR[CODE]: message
 *                            선택적 다음 줄: AI_SUGGESTION: guidance → ErrorEvent
 *   (접두어 없음)           → TextEvent
 *
 * ── Event Types ──────────────────────────────────────────────────────────────
 * @typedef {{ type: 'chart', chartType: 'bar'|'line'|'pie'|'scatter', title: string, data: any[] }} ChartEvent
 * @typedef {{ type: 'error', code: string, message: string, suggestion: string|null }} ErrorEvent
 * @typedef {{ type: 'text',  text: string }} TextEvent
 * @typedef {ChartEvent | ErrorEvent | TextEvent} ExecutionEvent
 */

const PREFIX_CHART    = '[x1zz:chart]';
const PREFIX_ERROR    = '[x1zz:error]';
const PREFIX_IO_ERROR = '[x1zz IO ERROR]';

/**
 * "ERROR[CODE]: message" 형식 파싱.
 * @param {string} line
 * @returns {{ code: string, message: string }}
 */
function parseErrorLine(line) {
  const m = line.match(/^ERROR\[([^\]]*)\]:\s*(.*)$/);
  if (m) return { code: m[1] || 'E', message: m[2] || '' };
  // 형식이 맞지 않더라도 최대한 메시지를 추출
  return { code: 'E', message: line.replace(/^ERROR\s*:?\s*/i, '') || line };
}

/**
 * stdout 라인 배열을 ExecutionEvent[] 로 파싱합니다.
 *
 * RULE: stdout MUST NOT directly update UI.
 * 이 함수는 순수 파서 — 부작용 없음.
 *
 * @param {string[]} lines
 * @returns {ExecutionEvent[]}
 */
export function parseStdout(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return [];

  const events = [];
  let i = 0;

  while (i < lines.length) {
    const line  = lines[i] ?? '';
    const trimmed = line.trim();

    // ── [x1zz:chart] ─────────────────────────────────────────────────────────
    if (trimmed === PREFIX_CHART) {
      i++;
      if (i < lines.length) {
        try {
          const payload = JSON.parse(lines[i].trim());

          // chartType 범위 검증
          const validTypes = ['bar', 'line', 'pie', 'scatter'];
          const chartType = validTypes.includes(payload.chartType) ? payload.chartType : 'bar';

          // payload 컬럼명을 읽어 차트 렌더러가 기대하는 { label, value } / { x, y } 형식으로 변환
          const rawData  = Array.isArray(payload.data) ? payload.data : [];
          const xCol     = payload.x;
          const yCol     = payload.y;
          const labelCol = payload.label;
          const valueCol = payload.value;

          let transformedData = rawData;
          if ((chartType === 'bar' || chartType === 'line') && xCol && yCol) {
            transformedData = rawData.map(row => ({
              ...row,
              label: row[xCol],
              value: Number(row[yCol] ?? 0),
              x: row[xCol],
              y: Number(row[yCol] ?? 0),
            }));
          } else if (chartType === 'pie' && labelCol && valueCol) {
            transformedData = rawData.map(row => ({
              ...row,
              label: row[labelCol],
              value: Number(row[valueCol] ?? 0),
            }));
          } else if (chartType === 'scatter' && xCol && yCol) {
            transformedData = rawData.map(row => ({
              ...row,
              x: Number(row[xCol] ?? 0),
              y: Number(row[yCol] ?? 0),
            }));
          }

          events.push({
            type:      'chart',
            chartType,
            title:     (typeof payload.title === 'string' ? payload.title : 'Chart'),
            data:      transformedData,
          });
        } catch {
          // JSON 파싱 실패 → 해당 줄을 텍스트로 처리
          events.push({ type: 'text', text: lines[i] });
        }
      }
      i++;
      continue;
    }

    // ── [x1zz IO ERROR] ──────────────────────────────────────────────────────
    // load() 런타임 파일 IO 실패 시 출력되는 에러 형식
    // 예: [x1zz IO ERROR] DATA file not found: C:\...\data\seoul_air_2026.csv
    if (trimmed.startsWith(PREFIX_IO_ERROR)) {
      const message = trimmed.slice(PREFIX_IO_ERROR.length).trim();
      events.push({
        type:       'error',
        code:       'IO_ERROR',
        message,
        suggestion: 'Check that the file exists under the data/ directory, or verify the @data alias path.',
      });
      i++;
      continue;
    }

    // ── [x1zz:error] ─────────────────────────────────────────────────────────
    if (trimmed === PREFIX_ERROR) {
      i++;
      let errorLineRaw = '';
      let suggestion   = null;

      // 다음 줄: ERROR[CODE]: message
      if (i < lines.length) {
        errorLineRaw = lines[i].trim();
        i++;
      }

      // 선택적 다음 줄: AI_SUGGESTION: ...
      if (i < lines.length && lines[i].trim().startsWith('AI_SUGGESTION:')) {
        suggestion = lines[i].trim().replace(/^AI_SUGGESTION:\s*/, '');
        i++;
      }

      const { code, message } = parseErrorLine(errorLineRaw);
      events.push({ type: 'error', code, message, suggestion });
      continue;
    }

    // ── 일반 텍스트 ───────────────────────────────────────────────────────────
    if (trimmed !== '') {
      events.push({ type: 'text', text: line });
    }
    i++;
  }

  return events;
}

/**
 * ExecutionEvent[] 에서 ChartEvent 만 추출합니다.
 * @param {ExecutionEvent[]} events
 * @returns {ChartEvent[]}
 */
export function getChartEvents(events) {
  return events.filter(e => e.type === 'chart');
}

/**
 * ExecutionEvent[] 에서 ErrorEvent 만 추출합니다.
 * @param {ExecutionEvent[]} events
 * @returns {ErrorEvent[]}
 */
export function getErrorEvents(events) {
  return events.filter(e => e.type === 'error');
}

/**
 * ExecutionEvent[] 에서 TextEvent 만 추출합니다.
 * @param {ExecutionEvent[]} events
 * @returns {TextEvent[]}
 */
export function getTextEvents(events) {
  return events.filter(e => e.type === 'text');
}
