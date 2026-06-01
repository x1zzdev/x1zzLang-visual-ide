# x1zzLang Visual IDE (Powered by VibeETL Frontend) AI Agent Rules

When assisting with this project, you are NOT building or maintaining the original VibeETL Python backend. Your sole mission is to modify the VibeETL React frontend to act as the official Visual IDE and Transpiler for `x1zzLang` (a high-performance, Rust+Polars-based data scripting language).

Strictly adhere to the following design patterns and project constraints:

## 1. Platform Philosophy & Architecture
- **Frontend Only:** We are completely decoupled from the original Python/FastAPI backend engine. Do NOT attempt to fix, call, or modify any Python files (`*.py`).
- **Visual-to-Code Transpiler:** The core role of this UI canvas is to act as an AST visualizer and code generator. Every node connection (DAG) on the React Flow canvas must be translated into clean `x1zzLang` pipeline syntax (`|>`).

## 2. Core Frontend Features to Maintain
- **1-to-N Branching:** Output from any single node port can be routed to multiple downstream nodes simultaneously. Keep this React Flow logic intact.
- **Multi-Tabbed Workspaces:** The React frontend utilizes a tabbed interface, storing independent React Flow instances in an array. Features interacting with the canvas must operate exclusively on the currently `activeTab`.

## 3. x1zzLang Integration Rules (CRITICAL)
- **Intercept the 'Run' Action:** Locate the execution trigger (e.g., Run button, handleSubmit, onRun). Intercept the event so that it NO LONGER sends an API request to the Python server.
- **Transpile to x1zzLang:** When the execution is triggered, traverse the active canvas nodes, extract their properties (file paths, filter conditions, etc.), and transpile them into a single `x1zzLang` script string.
- **Progressive PoC Scope:** Start by prioritizing the mapping of `File Input` and `Filter` nodes to `x1zzLang` syntax:
  - `File Input` Node ➔ Generates `type DynamicSchema = { ... }` and `v data = load("path") :: DynamicSchema`
  - `Filter` Node ➔ Generates `|> filter(condition)` appended to the pipeline string.
- **Output:** For the initial PoC phase, output the generated `x1zzLang` script string to the browser development console using `console.log("--- Generated x1zz Code --- \n", x1zzScript)`.

## 4. UI/UX & Aesthetics Rules
- **Modern Glassmorphism:** Maintain the sleek, dark, high-density, glassmorphic UI layout. Do not degrade the visual fidelity.
- **Descriptive Tooltips:** Ensure all interactive elements have proper `title` attributes for native tooltip rendering.
- **Data Loss Protection:** Keep the `isDirty` autosave architecture intact so that user layout states are not lost accidentally on page refresh (save layout configuration metadata to local storage instead of streaming to the Python backend).