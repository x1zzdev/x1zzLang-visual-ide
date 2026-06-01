/// x1zzLang - 코드 생성기 (v0.15)
///
/// Program AST → Polars LazyFrame 흐름 문자열 생성.
///
/// 출력 예시:
///   // [Schema] AirQuality
///   //   station      : string
///   //   pm10         : Option<float>
///
///   // [VarDecl] result = load("examples/seoul_air_2026.csv") :: AirQuality
///   let result = LazyCsvReader::new("examples/seoul_air_2026.csv")
///       .finish()?
///       .filter(col("pm10").gt(lit(50i64)))
///       .collect()?;

use crate::ast::{BinOpKind, Expr, PipelineOp, PipelineSource, Program, Stmt};

/// 코드 생성기 — 유닛 구조체
pub struct Codegen;

impl Codegen {
    pub fn new() -> Self {
        Codegen
    }

    // ── 최상위 진입점 ─────────────────────────────────────────────────────────

    /// Program AST 전체를 Polars 흐름 문자열로 생성
    pub fn generate(program: &Program) -> String {
        let mut out = String::new();
        out.push_str("// ═══════════════════════════════════════════════════════\n");
        out.push_str("// x1zzLang → Polars LazyFrame 흐름 매핑\n");
        out.push_str("// ═══════════════════════════════════════════════════════\n\n");

        for (i, stmt) in program.stmts.iter().enumerate() {
            if i > 0 {
                out.push('\n');
            }
            out.push_str(&Self::emit_stmt(stmt));
        }
        out
    }

    // ── Stmt 변환 ─────────────────────────────────────────────────────────────

    fn emit_stmt(stmt: &Stmt) -> String {
        match stmt {
            Stmt::TypeDecl { name, fields } => {
                let mut s = format!("// [Schema] {}\n", name);
                for f in fields {
                    s.push_str(&format!("//   {:<12} : {}\n", f.name, f.field_type));
                }
                s
            }
            Stmt::VarDecl { var_name, is_mut, source, ops } => {
                Self::emit_var_decl(var_name, *is_mut, source, ops)
            }
        }
    }

    // ── VarDecl 변환 ──────────────────────────────────────────────────────────

    fn emit_var_decl(
        var_name: &str,
        is_mut: bool,
        source: &PipelineSource,
        ops: &[PipelineOp],
    ) -> String {
        let mut lines: Vec<String> = Vec::new();

        // 주석 헤더
        let source_comment = match source {
            PipelineSource::Load { file_path, schema_name } => {
                format!("load(\"{}\") :: {}", file_path, schema_name)
            }
            PipelineSource::VarRef(name) => {
                format!("{} (varref)", name)
            }
        };
        let mut_kw = if is_mut { "mut " } else { "" };
        lines.push(format!(
            "// [VarDecl] {}v {} = {}",
            mut_kw, var_name, source_comment
        ));

        // 소스 코드 생성
        match source {
            PipelineSource::Load { file_path, schema_name } => {
                lines.push(format!(
                    "let {} = LazyCsvReader::new(\"{}\")  // :: {}",
                    var_name, file_path, schema_name
                ));
                lines.push("  .with_has_header(true)".into());
                lines.push("  .finish()?".into());
            }
            PipelineSource::VarRef(src_var) => {
                lines.push(format!(
                    "let {} = {}.clone().lazy()",
                    var_name, src_var
                ));
            }
        }

        // 파이프라인 각 단계
        for op in ops {
            lines.push(Self::emit_op(op));
        }

        // collect — Lazy 실행 시점
        lines.push(format!("  .collect()?;  // ← {}: 모든 연산 일괄 실행", var_name));

        lines.join("\n")
    }

    // ── Op 변환 ───────────────────────────────────────────────────────────────

    fn emit_op(op: &PipelineOp) -> String {
        match op {
            PipelineOp::Filter(expr) => {
                format!(
                    "  .filter({})  // |> filter({})",
                    Self::expr_to_polars(expr),
                    Self::expr_to_xzz(expr)
                )
            }
            PipelineOp::Select(cols) => {
                let polars: Vec<String> = cols.iter()
                    .map(|c| format!("col(\"{}\")", c))
                    .collect();
                let xzz = cols.join(", ");
                format!(
                    "  .select([{}])  // |> select([{}])",
                    polars.join(", "),
                    xzz
                )
            }
            PipelineOp::Count => {
                "  // |> count  →  df.height() 로 행 수 확인".to_string()
            }
        }
    }

    // ── 표현식 → Polars Rust ──────────────────────────────────────────────────

    pub fn expr_to_polars(expr: &Expr) -> String {
        match expr {
            Expr::Ident(s)     => format!("col(\"{}\")", s),
            Expr::StringLit(s) => format!("lit(\"{}\")", s),
            Expr::IntLit(n)    => format!("lit({}i64)", n),
            Expr::FloatLit(f)  => format!("lit({}f64)", f),
            Expr::BinOp { lhs, op, rhs } => {
                let l = Self::expr_to_polars(lhs);
                let r = Self::expr_to_polars(rhs);
                match op {
                    BinOpKind::Eq    => format!("{}.eq({})",     l, r),
                    BinOpKind::NotEq => format!("{}.neq({})",    l, r),
                    BinOpKind::Lt    => format!("{}.lt({})",     l, r),
                    BinOpKind::Gt    => format!("{}.gt({})",     l, r),
                    BinOpKind::LtEq  => format!("{}.lt_eq({})", l, r),
                    BinOpKind::GtEq  => format!("{}.gt_eq({})", l, r),
                }
            }
        }
    }

    // ── 표현식 → x1zzLang 소스 표현 ──────────────────────────────────────────

    pub fn expr_to_xzz(expr: &Expr) -> String {
        match expr {
            Expr::Ident(s)     => s.clone(),
            Expr::StringLit(s) => format!("\"{}\"", s),
            Expr::IntLit(n)    => n.to_string(),
            Expr::FloatLit(f)  => f.to_string(),
            Expr::BinOp { lhs, op, rhs } => {
                let op_str = match op {
                    BinOpKind::Eq    => "==",
                    BinOpKind::NotEq => "!=",
                    BinOpKind::Lt    => "<",
                    BinOpKind::Gt    => ">",
                    BinOpKind::LtEq  => "<=",
                    BinOpKind::GtEq  => ">=",
                };
                format!(
                    "{} {} {}",
                    Self::expr_to_xzz(lhs),
                    op_str,
                    Self::expr_to_xzz(rhs)
                )
            }
        }
    }
}

impl Default for Codegen {
    fn default() -> Self {
        Codegen::new()
    }
}
