# x1zzLang Visual IDE

> **x1zzLang를 위한 비주얼 파이프라인 빌더 — DAG 설계, .xzz 생성, 네이티브 실행.**

데이터 파이프라인을 시각적으로 설계하고 x1zzLang 코드를 생성·실행할 수 있는 그래픽 IDE입니다. 캔버스 위에서 노드를 연결하는 것만으로 복잡한 데이터 변환 워크플로우를 구성할 수 있습니다 — 코드를 직접 작성할 필요가 없습니다.

---

## 스크린샷


![x1zzLang Visual IDE](./docs/screenshot.png)


---

## 주요 기능

- **비주얼 파이프라인 빌더** — 드래그 앤 드롭으로 DAG 파이프라인 설계
- **실시간 x1zzLang 코드 생성** — 노드를 연결하는 즉시 `.xzz` 코드가 자동 생성
- **9가지 내장 파이프라인 연산자** — File Input, Filter, Select, Group By, Count, Sort, Take, Drop Null, Fill Null
- **원클릭 실행** — 생성된 코드를 백엔드로 전송하고 결과를 테이블로 확인
- **워크플로우 관리** — 탭 기반 멀티 워크플로우, Undo/Redo, 자동 저장
- **`.xzz` 내보내기** — 설계한 파이프라인을 `.xzz` 파일로 저장
- **컨테이너 그룹화** — 노드를 컨테이너로 묶고 최소화
- **이중 언어 UI** — 한국어 / English 지원

---

## 아키텍처

```
x1zz-lang-visual-ide/
├── frontend/              # React + Vite 프론트엔드
│   ├── src/
│   │   ├── components/    # Canvas, ToolPalette, ConfigWindow, ResultsWindow
│   │   ├── transpiler/    # DAG → x1zzLang 코드 변환 엔진
│   │   ├── locales/       # i18n 번역 파일 (ko, en)
│   │   └── App.jsx        # 메인 애플리케이션 진입점
│   └── ...
└── ...
```

---

## 빠른 시작

```bash
cd frontend
npm install
npm run dev
```

브라우저에서 `http://localhost:5173`을 여세요.

---

## 사용 방법

1. **빌드** — 툴 팔레트에서 노드를 캔버스로 드래그하고 엣지로 연결합니다
2. **설정** — ConfigWindow에서 각 노드의 파라미터를 설정합니다
3. **실행** — Run 버튼을 눌러 파이프라인을 백엔드로 전송하고 결과를 확인합니다

---

## 파이프라인 연산자

| 연산자 | 설명 |
|--------|------|
| **File Input** | CSV/Excel 파일 로드 및 스키마 자동 추론 |
| **Filter** | 조건에 따른 행 필터링 |
| **Select** | 특정 컬럼 선택 |
| **Group By** | 데이터 그룹화 및 집계 (count / sum / mean / min / max) |
| **Count** | 행 개수 집계 |
| **Sort** | 컬럼 기준 정렬 |
| **Take** | 상위 N개 행 선택 |
| **Drop Null** | Null 값이 있는 행 제거 |
| **Fill Null** | Null 값을 지정된 값으로 채우기 |

---

## 트랜스파일 흐름

```
비주얼 DAG (노드 + 엣지)
        ↓
x1zzTranspiler (dagWalker)
        ↓
  .xzz 소스 코드
        ↓
  Backend /execute  (x1zzLang API)
        ↓
결과 (테이블 + 로그)
```

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| **프론트엔드** | React 18, Vite, @xyflow/react, i18next, Lucide React |
| **백엔드** | x1zzLang 엔진 (Rust + Polars) — API 연동 |

---

## 관련 프로젝트

- [x1zzLang](https://github.com/ax1sofficially-alt/x1zzLang) — x1zzLang 컴파일러 & 런타임

---

## 라이선스

이 프로젝트는 [Apache-2.0 라이선스](./LICENSE)를 따릅니다.
