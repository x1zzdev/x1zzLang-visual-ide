/**
 * pathResolver.js
 * x1zzLang @alias 경로 resolver 모듈
 *
 * 지원 alias:
 *   @data/   → DATA_ROOT  (프로젝트 기준 data 디렉토리)
 *
 * 향후 확장 예정:
 *   @assets/ → ASSETS_ROOT
 *   @raw/    → RAW_ROOT
 *   @cache/  → CACHE_ROOT
 *
 * 사용 예:
 *   resolvePath("@data/seoul_air_2026.csv")
 *   → "C:\\Users\\LG\\x1zz-lang-visual-ide\\data\\seoul_air_2026.csv"
 */

// ─── ROOT 경로 정의 ────────────────────────────────────────────────────────────

/**
 * 환경변수 VITE_DATA_ROOT가 설정되어 있으면 그 값을 우선 사용합니다.
 * 없으면 프로젝트 기본 data 디렉토리를 사용합니다.
 */
const DATA_ROOT =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DATA_ROOT) ||
  'C:\\Users\\LG\\x1zz-lang-visual-ide\\data\\';

// ─── alias registry ────────────────────────────────────────────────────────────

/**
 * alias 이름 → 절대 경로 루트 매핑 레지스트리
 * 향후 @assets, @raw, @cache 등을 여기에 추가합니다.
 *
 * @type {Record<string, string>}
 */
const ALIAS_REGISTRY = {
  '@data':   DATA_ROOT,
  // '@assets': 'C:\\Users\\LG\\x1zz-lang-visual-ide\\assets\\',
  // '@raw':    'C:\\Users\\LG\\x1zz-lang-visual-ide\\raw\\',
  // '@cache':  'C:\\Users\\LG\\x1zz-lang-visual-ide\\cache\\',
};

// ─── resolver ──────────────────────────────────────────────────────────────────

/**
 * @alias 경로를 실제 절대 경로로 변환합니다.
 *
 * 엄격 모드: "@data/filename" 형식의 경로만 허용합니다.
 * 원시 파일명이나 상대 경로는 반드시 normalizeLoadPath()를 통해
 * 정규화된 후 이 함수에 전달되어야 합니다.
 *
 * - "@data/filename.csv" → "C:\Users\LG\x1zz-lang-visual-ide\data\filename.csv"
 *
 * @param {string} path - "@data/..." 형식의 DSL 경로 문자열
 * @returns {string} resolve된 절대 경로
 *
 * @throws {Error} "@alias/" 형식이 아닌 경로가 전달된 경우
 * @throws {Error} 알 수 없는 @alias 접두사인 경우
 */
export function resolvePath(path) {
  if (!path || typeof path !== 'string') {
    throw new Error(
      `[x1zz PATH ERROR] Path must be a non-empty string, got: ${JSON.stringify(path)}`
    );
  }

  // 엄격 모드: @alias 형식이 아닌 경로는 허용하지 않습니다.
  // 원시 파일명은 반드시 normalizeLoadPath()로 먼저 정규화해야 합니다.
  if (!path.startsWith('@')) {
    throw new Error(
      `[x1zz PATH ERROR] Invalid path format: "${path}". ` +
      `Path must use an @alias prefix (e.g. "@data/filename.csv"). ` +
      `Raw filenames must be normalized via normalizeLoadPath() before resolution.`
    );
  }

  // alias 이름 추출 (예: "@data")
  const slashIdx = path.indexOf('/');
  const aliasName = slashIdx !== -1 ? path.slice(0, slashIdx) : path;

  const root = ALIAS_REGISTRY[aliasName];

  if (!root) {
    throw new Error(
      `[x1zz PATH ERROR] Unknown alias: "${aliasName}". ` +
      `Registered aliases: ${Object.keys(ALIAS_REGISTRY).join(', ')}`
    );
  }

  // alias 이후의 파일명 부분 추출
  const relativePart = slashIdx !== -1 ? path.slice(slashIdx + 1) : '';

  // 윈도우 경로 구분자로 결합
  const resolved = root.replace(/[\\/]$/, '') + '\\' + relativePart.replace(/\//g, '\\');

  return resolved;
}

/**
 * resolvePath의 런타임 버전.
 * 파일 존재 여부를 확인하고, 없으면 x1zz IO ERROR를 throw합니다.
 *
 * 브라우저 환경에서는 파일시스템 접근이 불가능하므로,
 * 경로 resolve만 수행하고 파일 존재 여부 검사는 skip합니다.
 * 실제 파일 읽기는 백엔드 API가 담당합니다.
 *
 * 백엔드(Python 런타임)에서 파일을 열지 못할 경우 stdout에
 * 다음 형식의 메시지를 출력해야 합니다:
 *   [x1zz IO ERROR] DATA file not found: <resolved_path>
 * → stdoutParser.js가 이 패턴을 ErrorEvent(code: 'IO_ERROR')로 파싱합니다.
 *
 * @param {string} path
 * @returns {string} resolved 경로
 */
export function resolvePathRuntime(path) {
  const resolved = resolvePath(path);
  return resolved;
}

/**
 * IO 에러 메시지 문자열을 생성합니다.
 * 백엔드 런타임 또는 테스트에서 올바른 에러 형식을 출력할 때 사용합니다.
 *
 * 출력 예: "[x1zz IO ERROR] DATA file not found: C:\Users\...\data\missing.csv"
 *
 * @param {string} resolvedPath - resolvePath()로 반환된 절대 경로
 * @returns {string} 표준 IO 에러 메시지 문자열
 */
export function makeIoErrorMessage(resolvedPath) {
  return `[x1zz IO ERROR] DATA file not found: ${resolvedPath}`;
}

/**
 * 경로가 @alias 형태인지 확인합니다.
 * @param {string} path
 * @returns {boolean}
 */
export function isAliasPath(path) {
  return typeof path === 'string' && path.startsWith('@');
}

/**
 * 현재 등록된 alias 목록을 반환합니다.
 * @returns {string[]}
 */
export function getRegisteredAliases() {
  return Object.keys(ALIAS_REGISTRY);
}

/**
 * 런타임에 새 alias를 동적으로 등록합니다. (향후 config 지원용)
 * @param {string} alias  - "@assets" 형태
 * @param {string} root   - 절대 경로 (끝에 \\ 포함)
 */
export function registerAlias(alias, root) {
  if (!alias.startsWith('@')) {
    throw new Error(`[x1zz PATH ERROR] Alias must start with "@": "${alias}"`);
  }
  ALIAS_REGISTRY[alias] = root;
}
