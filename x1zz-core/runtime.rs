/// x1zz-compiler/src/runtime.rs — 런타임 실행 엔진 (v0.15)
///
/// .xzz 소스 파일을 받아 전체 컴파일 파이프라인을 실행하는 라이브러리 모듈.
///
/// 실행 흐름:
///   1. fs::read_to_string       — .xzz 소스 파일 로드
///   2. Lexer::tokenize()        — 문자 스트림 → Token 배열
///   3. Parser::parse()          — Token 배열 → Program AST
///   4. Codegen::generate()      — AST → Polars 흐름 매핑 문자열 (출력용)
///   5. Runtime 엔진             — SymbolTable + TypeRegistry 기반 다중 파이프라인 실행
///      5-A) TypeRegistry 구축   — TypeDecl 수집 (스키마 정의)
///      5-B) VarDecl 순차 실행   — 소스 결정 → Dynamic Bridge → 타입 검증 → Op 적용
///      5-C) SymbolTable 저장    — var_name → DataFrame

use std::collections::HashMap;
use std::fs;

use crate::ast::{PipelineOp, PipelineSource, Stmt};
use crate::{BinOpKind, Codegen, Expr, Lexer, Parser, StructField};

// ─────────────────────────────────────────────────────────────────────────────
// ── 최상위 공개 진입점 ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/// .xzz 소스 파일 경로를 받아 전체 컴파일+런타임 파이프라인을 실행한다.
///
/// 에러 발생 시 패닉 없이 `Box<dyn std::error::Error>`를 반환한다.
/// 호출자는 에러 메시지를 `eprintln!`으로 출력하고 `std::process::exit(1)`을
/// 호출하는 것을 권장한다.
pub fn run_pipeline(source_path: &str) -> Result<(), Box<dyn std::error::Error>> {
    // ── STEP 1: 소스 파일 읽기 ───────────────────────────────────────────────
    let source = fs::read_to_string(source_path)
        .map_err(|e| format!("IO 에러: 파일 읽기 실패 '{}' — {}", source_path, e))?;

    println!("╔═══════════════════════════════════════════════════════════════╗");
    println!("║  x1zzLang Compiler + Runtime  ·  v0.15                       ║");
    println!("║                                                               ║");
    println!("╚═══════════════════════════════════════════════════════════════╝");
    println!();
    println!("▶ 입력 파일 : {}", source_path);
    println!("▶ 소스 크기 : {} bytes", source.len());
    println!();

    // 소스 코드 출력
    println!("┌─ 소스 코드 ────────────────────────────────────────────────────");
    for (i, line) in source.lines().enumerate() {
        println!("│ {:3} │ {}", i + 1, line);
    }
    println!("└────────────────────────────────────────────────────────────────");
    println!();

    // ── STEP 2: Lexer — 토크나이징 ──────────────────────────────────────────
    let mut lexer = Lexer::new(&source);
    let tokens = lexer
        .tokenize()
        .map_err(|e| format!("[x1zz LEXER ERROR] {}", e))?;

    println!(
        "┌─ Lexer 출력 ({} 토큰) ─────────────────────────────────",
        tokens.len()
    );
    for tok in &tokens {
        println!(
            "│  [{:>4}:{:<3}]  {:?}",
            tok.span.line, tok.span.col, tok.kind
        );
    }
    println!("└────────────────────────────────────────────────────────────────");
    println!();

    // ── STEP 3: Parser — AST 구축 ───────────────────────────────────────────
    let mut parser = Parser::new(tokens);
    let program = parser
        .parse()
        .map_err(|e| format!("[x1zz PARSER ERROR] {}", e))?;

    println!("┌─ AST (Program) ────────────────────────────────────────────────");
    println!("{:#?}", program);
    println!("└────────────────────────────────────────────────────────────────");
    println!();

    // ── STEP 4: Codegen — Polars 흐름 매핑 문자열 생성 ──────────────────────
    let codegen_output = Codegen::generate(&program);

    println!("┌─ Polars LazyFrame 흐름 매핑 ───────────────────────────────────");
    for line in codegen_output.lines() {
        println!("│ {}", line);
    }
    println!("└────────────────────────────────────────────────────────────────");
    println!();

    // ── STEP 5: 런타임 엔진 ─────────────────────────────────────────────────
    println!("┌─ Polars 런타임 실행 ───────────────────────────────────────────");

    // 5-A: TypeRegistry 구축 — TypeDecl 수집
    let mut type_registry: HashMap<String, Vec<StructField>> = HashMap::new();
    for stmt in &program.stmts {
        if let Stmt::TypeDecl { name, fields } = stmt {
            println!(
                "│  [TypeRegistry] 스키마 등록: '{}'  ({} 개 필드)",
                name,
                fields.len()
            );
            for f in fields {
                println!("│     {:<12} : {}", f.name, f.field_type);
            }
            type_registry.insert(name.clone(), fields.clone());
        }
    }
    if !type_registry.is_empty() {
        println!("│");
    }

    // 5-B: VarDecl 순차 실행 + SymbolTable 관리
    let mut symbol_table: HashMap<String, polars::frame::DataFrame> = HashMap::new();
    let mut pipeline_count = 0usize;

    for stmt in &program.stmts {
        if let Stmt::VarDecl {
            var_name,
            is_mut,
            source,
            ops,
        } = stmt
        {
            pipeline_count += 1;
            let mut_label = if *is_mut { "mut " } else { "" };
            println!("│");
            println!(
                "│  ═══ [Pipeline #{}] {}v {} ═══",
                pipeline_count, mut_label, var_name
            );

            match execute_var_decl(var_name, source, ops, &symbol_table, &type_registry) {
                Ok(df) => {
                    println!("│");
                    println!(
                        "│  ── 결과 DataFrame '{}' ({} 행 × {} 열) ──",
                        var_name,
                        df.height(),
                        df.width()
                    );
                    let df_str = format!("{}", df);
                    for line in df_str.lines() {
                        println!("│    {}", line);
                    }

                    // SymbolTable에 저장 (다음 파이프라인에서 VarRef로 참조 가능)
                    symbol_table.insert(var_name.clone(), df);
                    println!("│  → 변수 '{}' → SymbolTable 저장 완료", var_name);
                }
                Err(e) => {
                    eprintln!(
                        "│  [x1zz RUNTIME ERROR] Pipeline #{} ('{}') 실패:\n│  {}",
                        pipeline_count, var_name, e
                    );
                }
            }
            println!("│");
        }
    }

    if pipeline_count == 0 {
        println!("│  (실행 가능한 VarDecl 없음)");
    }

    println!("└────────────────────────────────────────────────────────────────");
    println!();

    // ── SymbolTable 최종 요약 ────────────────────────────────────────────────
    println!("┌─ SymbolTable 최종 상태 ───────────────────────────────────────");
    if symbol_table.is_empty() {
        println!("│  (비어 있음)");
    } else {
        for (name, df) in &symbol_table {
            println!(
                "│  '{}' = DataFrame({} 행 × {} 열)",
                name,
                df.height(),
                df.width()
            );
        }
    }
    println!("└────────────────────────────────────────────────────────────────");
    println!();
    println!(
        "완료 — AST 노드 {} 개 / 등록된 스키마 {} 개 / 실행된 파이프라인 {} 개",
        program.stmts.len(),
        type_registry.len(),
        pipeline_count
    );

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// ── 내부 헬퍼 함수들 ────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// ── AST Expr → Polars Expr 변환 ──────────────────────────────────────────────
fn to_polars_expr(expr: &Expr) -> polars::prelude::Expr {
    use polars::prelude::{col, lit};
    match expr {
        Expr::Ident(s)     => col(s.as_str()),
        Expr::IntLit(n)    => lit(*n),
        Expr::FloatLit(f)  => lit(*f),
        Expr::StringLit(s) => lit(s.clone()),
        Expr::BinOp { lhs, op, rhs } => {
            let l = to_polars_expr(lhs);
            let r = to_polars_expr(rhs);
            match op {
                BinOpKind::Eq    => l.eq(r),
                BinOpKind::NotEq => l.neq(r),
                BinOpKind::Lt    => l.lt(r),
                BinOpKind::Gt    => l.gt(r),
                BinOpKind::LtEq  => l.lt_eq(r),
                BinOpKind::GtEq  => l.gt_eq(r),
            }
        }
    }
}

// ── Dynamic Schema Bridge ─────────────────────────────────────────────────────
// CSV 실제 헤더와 스키마 필드를 위치(인덱스) 기반으로 동적 매핑한다.
// 필드 수보다 CSV 컬럼이 많으면 초과 컬럼은 그대로 유지.
// 필드 수보다 CSV 컬럼이 적으면 매핑 가능한 범위까지만 처리한다.
fn apply_dynamic_bridge(
    lf: polars::prelude::LazyFrame,
    csv_headers: &[String],
    schema_fields: &[StructField],
) -> polars::prelude::LazyFrame {
    let map_count = csv_headers.len().min(schema_fields.len());

    let old_names: Vec<&str> = csv_headers[..map_count]
        .iter()
        .map(String::as_str)
        .collect();
    let new_names: Vec<&str> = schema_fields[..map_count]
        .iter()
        .map(|f| f.name.as_str())
        .collect();

    // 같은 이름이면 rename 불필요 → 필터링
    let (rename_old, rename_new): (Vec<&str>, Vec<&str>) = old_names
        .iter()
        .zip(new_names.iter())
        .filter(|(o, n)| o != n)
        .map(|(o, n)| (*o, *n))
        .unzip();

    if rename_old.is_empty() {
        println!("  ▶ Schema Bridge: 이미 일치하는 헤더, rename 생략");
        lf
    } else {
        println!(
            "  ▶ Schema Bridge: {} 개 컬럼 동적 매핑",
            rename_old.len()
        );
        for (o, n) in rename_old.iter().zip(rename_new.iter()) {
            println!("     '{}' → '{}'", o, n);
        }
        lf.rename(rename_old, rename_new, false)
    }
}

// ── 타입 검증 / Null 처리 ─────────────────────────────────────────────────────
// 스키마 필드의 타입 선언과 실제 DataFrame 컬럼 상태를 비교.
// Option<T>이 아닌 필수 필드에 null이 있으면 경고 메시지를 출력하고
// 실행을 멈추지 않는다 (Warn & Continue 정책).
fn validate_schema_types(
    df: &polars::frame::DataFrame,
    schema_name: &str,
    schema_fields: &[StructField],
) {
    println!("  ▶ 타입 검증: schema '{}'", schema_name);
    for field in schema_fields {
        let is_optional = field.field_type.starts_with("Option<");
        match df.column(&field.name) {
            Ok(series) => {
                let null_count = series.null_count();
                let dtype = series.dtype();
                if null_count > 0 && !is_optional {
                    eprintln!(
                        "  [WARN] Null 위반 [{}]: 필수 필드 '{}' ({}) 에 null {} 개 발견 — 경고(계속 진행)",
                        schema_name, field.name, dtype, null_count
                    );
                } else if null_count > 0 {
                    println!(
                        "     [OK] '{}' ({}) — null {} 개 (Option<T> 허용)",
                        field.name, dtype, null_count
                    );
                } else {
                    println!("     [OK] '{}' ({}) — null 없음", field.name, dtype);
                }
            }
            Err(_) => {
                eprintln!(
                    "  [WARN] 스키마 필드 '{}' 를 DataFrame에서 찾을 수 없음 (컬럼 부재)",
                    field.name
                );
            }
        }
    }
}

// ── CSV 로더 (인코딩 자동 처리) ───────────────────────────────────────────────
// UTF-8 직접 시도 → 실패 시 EUC-KR(CP949) 디코딩 (한국 공공데이터 대응)
fn load_csv_as_df(
    file_path: &str,
) -> Result<polars::frame::DataFrame, Box<dyn std::error::Error>> {
    use polars::prelude::{CsvParseOptions, CsvReadOptions, NullValues, SerReader};
    use std::io::Cursor;

    println!("  ▶ CSV 로드: '{}'", file_path);

    let raw_bytes = std::fs::read(file_path).map_err(|e| {
        format!("IO 에러: CSV 파일 읽기 실패 '{}' — {}", file_path, e)
    })?;

    // UTF-8 직접 시도 → 실패 시 EUC-KR(CP949) 디코딩
    let utf8_string = match String::from_utf8(raw_bytes.clone()) {
        Ok(s) => {
            println!("  ▶ 인코딩: UTF-8 직접 사용");
            s
        }
        Err(_) => {
            use encoding_rs::EUC_KR;
            let (cow, encoding_used, had_errors) = EUC_KR.decode(&raw_bytes);
            println!(
                "  ▶ 인코딩: {} → UTF-8 변환 (손실 여부: {})",
                encoding_used.name(),
                had_errors
            );
            cow.into_owned()
        }
    };

    let cursor = Cursor::new(utf8_string.into_bytes());
    let df = CsvReadOptions::default()
        .with_infer_schema_length(Some(200))
        .with_parse_options(
            CsvParseOptions::default()
                .with_null_values(Some(NullValues::AllColumnsSingle("-".into()))),
        )
        .into_reader_with_file_handle(cursor)
        .finish()?;

    println!(
        "  ▶ CSV 로드 완료: {} 행 × {} 열",
        df.height(),
        df.width()
    );
    Ok(df)
}

// ── 단일 파이프라인 실행 ──────────────────────────────────────────────────────
fn execute_var_decl(
    var_name: &str,
    source: &PipelineSource,
    ops: &[PipelineOp],
    symbol_table: &HashMap<String, polars::frame::DataFrame>,
    type_registry: &HashMap<String, Vec<StructField>>,
) -> Result<polars::frame::DataFrame, Box<dyn std::error::Error>> {
    use polars::prelude::{col, IntoLazy};

    // ── 소스: LazyFrame 획득 + Dynamic Bridge ────────────────────────────────
    let (mut lf, schema_fields_opt): (polars::prelude::LazyFrame, Option<Vec<StructField>>) =
        match source {
            PipelineSource::Load {
                file_path,
                schema_name,
            } => {
                println!(
                    "  ▶ 런타임: '{}' → 스키마 '{}'",
                    file_path, schema_name
                );

                let df_raw = load_csv_as_df(file_path)?;
                let csv_headers: Vec<String> = df_raw
                    .get_column_names()
                    .iter()
                    .map(|s| s.to_string())
                    .collect();

                println!(
                    "  ▶ CSV 원본 헤더: {:?}",
                    &csv_headers[..csv_headers.len().min(8)]
                );

                // 스키마 조회
                let schema_fields = type_registry.get(schema_name.as_str()).cloned();
                let lf_raw = df_raw.lazy();

                // Dynamic Schema Bridge 적용
                let lf_bridged = if let Some(ref fields) = schema_fields {
                    apply_dynamic_bridge(lf_raw, &csv_headers, fields)
                } else {
                    println!(
                        "  [WARN] 스키마 '{}' 미선언 — Bridge 생략 (헤더 그대로 사용)",
                        schema_name
                    );
                    lf_raw
                };

                (lf_bridged, schema_fields)
            }

            PipelineSource::VarRef(src_var) => {
                println!("  ▶ 변수 참조: '{}' → '{}'", src_var, var_name);
                match symbol_table.get(src_var.as_str()) {
                    Some(df) => (df.clone().lazy(), None),
                    None => {
                        return Err(format!(
                            "변수 에러: 미선언 변수 '{}' 참조. 이전 파이프라인에서 먼저 선언하세요.",
                            src_var
                        )
                        .into());
                    }
                }
            }
        };

    // ── 파이프라인 연산 적용 ─────────────────────────────────────────────────
    let mut has_count = false;
    for op in ops {
        match op {
            PipelineOp::Filter(expr) => {
                println!("  ▶ filter({}) 적용", Codegen::expr_to_xzz(expr));
                lf = lf.filter(to_polars_expr(expr));
            }
            PipelineOp::Select(cols) => {
                println!("  ▶ select([{}]) 적용", cols.join(", "));
                let exprs: Vec<polars::prelude::Expr> =
                    cols.iter().map(|c| col(c.as_str())).collect();
                lf = lf.select(exprs);
            }
            PipelineOp::Count => {
                println!("  ▶ count 플래그 설정 (collect 후 행 수 출력)");
                has_count = true;
            }
        }
    }

    // ── LazyFrame → DataFrame (Eager Collect) ───────────────────────────────
    let df = lf.collect()?;

    // ── 타입 검증 (Load 소스인 경우) ─────────────────────────────────────────
    if let Some(ref fields) = schema_fields_opt {
        let schema_name = match source {
            PipelineSource::Load { schema_name, .. } => schema_name.as_str(),
            _ => "unknown",
        };
        validate_schema_types(&df, schema_name, fields);
    }

    if has_count {
        println!("\n  count 결과: {} 행", df.height());
    }

    Ok(df)
}
