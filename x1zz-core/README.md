<div align="center">

```text
 ██╗  ██╗ ██╗ ███████╗███████╗██╗      █████╗ ███╗   ██╗ ██████╗ 
 ╚██╗██╔╝███║ ╚══███╔╝╚══███╔╝██║     ██╔══██╗████╗  ██║██╔════╝ 
  ╚███╔╝ ╚██║   ███╔╝   ███╔╝ ██║     ███████║██╔██╗ ██║██║  ███╗
  ██╔██╗  ██║  ███╔╝   ███╔╝  ██║     ██╔══██║██║╚██╗██║██║   ██║
 ██╔╝ ██╗ ██║ ███████╗███████╗███████╗██║  ██║██║ ╚████║╚██████╔╝
 ╚═╝  ╚═╝ ╚═╝ ╚══════╝╚══════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝ 
```

# x1zzLang

**Scripting on the surface. Compiled at its core. | The first language where AI is part of the compiler.**

> 💻 **"If Python/Pandas is the Microsoft Windows of data science, 🍏 x1zzLang is the Apple Mac."** 
>
> We tightly integrate the ultimate engine (Rust + Polars) with a custom compiler OS (Incremental Architecture) to eliminate environment friction and deliver predictable, raw performance.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Language: .xzz](https://img.shields.io/badge/Language-.xzz-orange.svg)]()
[![Backend: Rust + Polars](https://img.shields.io/badge/Backend-Rust%20%2B%20Polars-red.svg)]()
[![Status: In Development](https://img.shields.io/badge/Status-In%20Development%20(2026)-yellow.svg)]()

[한국어 README](README_kr.md)

</div>

```xzz
// This is all it takes. No imports. No main(). No boilerplate.
type WelfareSchema = {
  region:     string,
  population: int,
  income:     Option<float>,   // nullable — expected in public datasets
  support:    bool,
}

v data = load("welfare_2026.csv") :: WelfareSchema

v blind_spots = data
  |> filter(col("income") < 1_200_000)
  |> filter(col("support") == false)
  |> groupBy("region")
  |> count("population")
  |> orderBy("population", desc: true)
```

> *Execution flows from the top of the file. The language is the analysis.*

---

## Why x1zzLang

Every year, thousands of public datasets are released in South Korea —  
welfare gaps, air quality distributions, transportation blind spots.  
The data already exists.

**Then why do the problems persist?**

Not because the data is missing. Because **most people cannot analyze it.**

The real barriers to public data analysis today:

| Barrier | Problem |
|---------|---------|
| Library prerequisite | `pandas`, `numpy`, `matplotlib` — three libraries before you can start |
| Runtime type errors | Column name typos and type mismatches surface only at execution |
| Environment friction | `pip install`, version conflicts, virtual environment setup |
| Unpredictable output | No way to reason about results before running the code |

x1zzLang removes these barriers **at the language design level**.  
`filter`, `groupBy`, and `mean` are not library calls — they are **native syntax**.  
Welfare officers, environmental researchers, and policy analysts should be able to work with data directly.

---

## Core Pillars

### 1. Data-Native Syntax

> *"If analysis operations live in a library, the language doesn't understand analysis."*

In x1zzLang, `filter`, `groupBy`, `sum`, `mean`, `orderBy` are **language grammar**.  
Each pipeline step compiles to a Polars LazyFrame operation node, executed over Apache Arrow's zero-copy memory layout.

```xzz
// The pipeline is not syntactic sugar.
// Each |> step maps to a Polars LazyFrame node.
v result = data
  |> filter(col("price") > 100)      // .filter(col("price").gt(100))
  |> groupBy("region")               // .group_by(["region"])
  |> mean("price")                   // .agg([col("price").mean()])
  |> orderBy("price", desc: true)    // .sort("price", descending: true)
  |> take(10)                        // .limit(10)  ← collect() deferred to final step
```

`.xzz` source is transpiled to Rust and compiled to a native binary:

```
.xzz  →  Rust (transpile)  →  Native Binary (Polars LazyFrame)
```

---

### 2. AI-Augmented Compilation — Neural Query Planner (NQP)

> *"If GitHub Copilot completes code, x1zz-Copilot is part of the compiler that understands execution."*

The AI layer in x1zzLang is not a code generation assistant.  
It **predicts the state of data across pipeline steps before execution begins.**

The Neural Query Planner (NQP) analyzes pipeline structure and data distribution to reason about results ahead of time.

```
$ x1zz run welfare_analysis.xzz --predict

╔══════════════════════════════════════════════════════════════╗
║  x1zz Neural Query Planner — State Prediction               ║
╠══════════════════════════════════════════════════════════════╣
║  Pipeline: welfare_analysis.xzz                             ║
║  ─────────────────────────────────────────────────────────  ║
║  Step 1  filter(income < 1_200_000)                         ║
║          rows_before : 142,300                              ║
║          rows_after  : ~38,400  (est. 27.0% selectivity)    ║
║                                                             ║
║  Step 2  filter(support == false)                           ║
║          rows_after  : ~12,100  (est. 31.5% selectivity)    ║
║                                                             ║
║  Step 3  groupBy("region") |> count("population")           ║
║          groups      : ~17 regions                          ║
║          top_region  : "Gyeonggi North"  ~2,340 (est.)      ║
║                                                             ║
║  Confidence: 87.3%  |  Model: [internal-model]              ║
╚══════════════════════════════════════════════════════════════╝

  Proceed? [y/N]
```

These predictions are not execution results — they are pre-execution inferences derived from pipeline structure and data distribution.  
They allow users to validate pipeline logic before committing to a full run.

---

### 3. Safe by Default

> *"The moment data is loaded, it is already validated."*

The `::` Safe-Load operator and compile-time type inference eliminate an entire class of runtime errors.

```xzz
// Declare the schema first.
type SalesSchema = {
  date:     date,
  price:    float,
  region:   string,
  quantity: int,
  discount: Option<float>,   // nullable — some records have no discount
}

// :: verifies column presence and type compatibility at compile time.
v data = load("sales_2026.csv") :: SalesSchema
```

Column name typos and type mismatches are caught before execution:

```
[SchemaError] at analysis.xzz:3:33
─────────────────────────────────────────────
Cause   : Column referenced in filter() does not exist in schema.
Detail  : column 'pric' not found in SalesSchema
Available: date, price, region, quantity, discount
→ Did you mean: col("price")
```

---

## SDE — Synthetic Data Engine

> *"Garbage data produces garbage predictions."*

The NQP's prediction quality depends entirely on the quality of its training data.  
Public datasets are riddled with missing values, outliers, and inconsistent formatting.

x1zzLang adopts an **SDE-First** methodology: before the NQP can make reliable predictions, it must be trained on data that faithfully represents the statistical reality of public datasets — without exposing any real personal information.

The Synthetic Data Engine generates large-scale, high-fidelity training datasets that preserve the statistical properties of real data while introducing controlled noise, edge cases, and distribution shifts. This is how the NQP learns to reason about real-world pipelines.

Privacy protection is not a feature — it is a structural guarantee of this approach.

---

## Python vs. x1zzLang

**Scenario**: Identify welfare blind spots — regions where residents fall below the income threshold but receive no support.

### Python (pandas)

```python
import pandas as pd
import numpy as np

df = pd.read_csv("welfare_2026.csv")  # no type validation

df_filtered = df[df['income'] < 1200000]
df_no_support = df_filtered[df_filtered['support'] == False]

df_no_support = df_no_support.dropna(subset=['income'])  # manual null handling

result = df_no_support.groupby('region')['population'].count()
result = result.sort_values(ascending=False)

print(result.head(10))
```

*Three libraries, manual null handling, runtime type errors, no pre-execution insight.*

### x1zzLang

```xzz
type WelfareSchema = {
  region:     string,
  population: int,
  income:     Option<float>,
  support:    bool,
}

v data = load("welfare_2026.csv") :: WelfareSchema

v blind_spots = data
  |> dropNull("income")
  |> filter(col("income") < 1_200_000)
  |> filter(col("support") == false)
  |> groupBy("region")
  |> count("population")
  |> orderBy("population", desc: true)
  |> take(10)

blind_spots |> plot.bar(x: "region", y: "population")
```

| | Python (pandas) | x1zzLang |
|--|-----------------|----------|
| Lines of code | ~15 | ~9 (40% reduction) |
| Type validation | Runtime | Compile time |
| Null handling | Manual | Enforced via `Option<T>` |
| Pre-execution prediction | No | NQP inference |
| Library dependencies | pandas, numpy, matplotlib | None (built into the language) |
| Execution engine | Python GIL | Rust + Polars LazyFrame |

---

## Compiler Architecture

```
x1zz-compiler
│
├── Lexer          — tokenization of .xzz source
├── Token          — token type definitions
├── Parser         — recursive descent parser
├── AST            — abstract syntax tree nodes
├── Type Checker   — schema validation, type inference
├── Code Generator — Rust transpiler (LazyFrame emission)
└── Error          — structured compile-time diagnostics
```

**Pipeline:**

```
.xzz source
     │
     ▼
  Lexer  →  Token stream
     │
     ▼
  Parser  →  AST
     │
     ▼
  Type Checker (Schema + pipeline type inference)
     │
     ▼
  Code Generator  →  Rust source
     │
     ▼
  rustc + Polars LazyFrame  →  Native binary
```


---

## Roadmap

| Phase | Goal | Key Components | Status |
|-------|------|----------------|--------|
| **Phase 1** — Language Core | Complete language foundation | Lexer, Parser, AST, Type System, Pipeline Operator (`\|>`), Safe-Load (`::`) | Complete |
| **Phase 2** — Execution Layer | Full execution environment | Polars integration, incremental compilation, CLI (`x1zz run/check/fmt/emit`) | In Progress |
| **Phase 3** — Prediction Layer | AI inference layer | SDE, NQP model training, State Prediction | In Progress |
| **Phase 4** — Copilot OS | Natural language interface | Natural language → pipeline, MCP server, x1zz-Copilot integration | Vision |

---

## Current Status

| Component | Status |
|-----------|--------|
| Lexer / Parser | Implemented |
| AST / Token System | Implemented |
| Type System (Schema) | Implemented |
| Rust Transpiler (codegen) | Implemented |
| Pipeline Operator (`\|>`) | Implemented |
| Safe-Load (`::`) | Implemented |
| SDE (Synthetic Data Engine) | Implemented |
| NQP State Prediction (PoC) | Implemented (dryrun) |
| Polars LazyFrame integration | In Progress |
| MCP Server | Phase 4 |

---

## Installation

```bash
# Public release planned after Phase 2 completion.
# Build from source:
git clone https://github.com/ax1sofficially-alt/x1zzLang.git
cd x1zz-lang
cargo build --release
```

---

## CLI

```bash
x1zz check  src/pipeline/analysis.xzz            # type and schema validation
x1zz fmt    src/pipeline/analysis.xzz            # format source
x1zz run    src/pipeline/analysis.xzz            # execute pipeline
x1zz run    src/pipeline/analysis.xzz --predict  # NQP pre-execution prediction
x1zz emit   rust src/pipeline/analysis.xzz       # emit transpiled Rust source
```

---

## Contributing

x1zzLang is open source.  
Contributions are welcome across all areas: language design, Rust implementation, NQP model development, and public data pipeline examples.

Issues and pull requests on GitHub.

---

## License

Apache-2.0

---

<div align="center">

**x1zzLang — 2026**

</div>
