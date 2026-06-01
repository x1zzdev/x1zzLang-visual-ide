/// x1zzLang - 재귀 하강 파서 (v0.15 완전 구현)
///
/// BNF:
///   program        = stmt* EOF
///   stmt           = type_decl | var_stmt
///   type_decl      = "type" IDENT "=" "{" field_list "}" ";"?
///   field_list     = (field ("," field)* ","?)?
///   field          = IDENT ":" type_name
///   type_name      = "Option" "<" IDENT ">" | IDENT
///   var_stmt       = "mut"? "v" IDENT "=" pipeline_expr ";"?
///   pipeline_expr  = (load_expr | var_ref_expr) ("|>" pipeline_op)*
///   load_expr      = "load" "(" STRING_LIT ")" "::" IDENT
///   var_ref_expr   = IDENT  (기존 변수 참조)
///   pipeline_op    = "filter" "(" expr ")"
///                  | "select" "(" "[" ident_list "]" ")"
///                  | "count"
///   expr           = primary (binop primary)?
///   primary        = IDENT | INT_LIT | FLOAT_LIT | STRING_LIT | "(" expr ")"
///   binop          = "==" | "!=" | "<" | ">" | "<=" | ">="

use crate::ast::{BinOpKind, Expr, PipelineOp, PipelineSource, Program, Stmt, StructField};
use crate::error::{CompileError, CompileResult, ErrorKind};
use crate::token::{Span, Token, TokenKind};

pub struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

impl Parser {
    pub fn new(tokens: Vec<Token>) -> Self {
        Parser { tokens, pos: 0 }
    }

    // ── 내부 헬퍼 ─────────────────────────────────────────────────────────────

    fn current_kind(&self) -> TokenKind {
        self.tokens
            .get(self.pos)
            .map(|t| t.kind.clone())
            .unwrap_or(TokenKind::Eof)
    }

    fn current_span(&self) -> Span {
        self.tokens
            .get(self.pos)
            .map(|t| t.span.clone())
            .unwrap_or(Span::new(0, 0))
    }

    fn advance(&mut self) {
        if self.pos + 1 < self.tokens.len() {
            self.pos += 1;
        }
    }

    fn expect(&mut self, expected: &TokenKind) -> CompileResult<Span> {
        let kind = self.current_kind();
        let span = self.current_span();
        if kind == *expected {
            self.advance();
            Ok(span)
        } else {
            Err(CompileError::new(
                ErrorKind::ExpectedToken(format!("{:?}", expected)),
                span.clone(),
                format!(
                    "예상 토큰 {:?} 없음, 실제: {:?}",
                    expected, kind
                ),
            ))
        }
    }

    fn eat(&mut self, kind: &TokenKind) -> bool {
        if self.current_kind() == *kind {
            self.advance();
            true
        } else {
            false
        }
    }

    fn is_eof(&self) -> bool {
        self.pos >= self.tokens.len().saturating_sub(1)
            || matches!(self.current_kind(), TokenKind::Eof)
    }

    // ── 최상위 ────────────────────────────────────────────────────────────────

    pub fn parse(&mut self) -> CompileResult<Program> {
        let mut program = Program::new();
        while !self.is_eof() {
            program.stmts.push(self.parse_stmt()?);
        }
        Ok(program)
    }

    // ── Stmt ──────────────────────────────────────────────────────────────────

    fn parse_stmt(&mut self) -> CompileResult<Stmt> {
        match self.current_kind() {
            TokenKind::Type       => self.parse_type_decl(),
            TokenKind::V
            | TokenKind::Mut     => self.parse_var_stmt(),
            other                => Err(CompileError::new(
                ErrorKind::UnexpectedToken(format!("{:?}", other)),
                self.current_span(),
                format!("구문 시작 불가 토큰: {:?}", other),
            )),
        }
    }

    // ── TypeDecl ──────────────────────────────────────────────────────────────
    // type_decl = "type" IDENT "=" "{" field_list "}" ";"?

    fn parse_type_decl(&mut self) -> CompileResult<Stmt> {
        self.expect(&TokenKind::Type)?;
        let name = self.expect_ident()?;
        self.expect(&TokenKind::Assign)?;
        self.expect(&TokenKind::LBrace)?;
        let fields = self.parse_field_list()?;
        self.expect(&TokenKind::RBrace)?;
        self.eat(&TokenKind::Semicolon);
        Ok(Stmt::TypeDecl { name, fields })
    }

    fn parse_field_list(&mut self) -> CompileResult<Vec<StructField>> {
        let mut fields = Vec::new();
        loop {
            if matches!(self.current_kind(), TokenKind::RBrace | TokenKind::Eof) {
                break;
            }
            fields.push(self.parse_field()?);
            if !self.eat(&TokenKind::Comma) {
                break;
            }
            if matches!(self.current_kind(), TokenKind::RBrace) {
                break;
            }
        }
        Ok(fields)
    }

    fn parse_field(&mut self) -> CompileResult<StructField> {
        let name = self.expect_ident()?;
        self.expect(&TokenKind::Colon)?;
        let field_type = self.parse_type_name()?;
        Ok(StructField { name, field_type })
    }

    fn parse_type_name(&mut self) -> CompileResult<String> {
        if matches!(self.current_kind(), TokenKind::OptionKw) {
            let span = self.current_span();
            self.advance();
            if !matches!(self.current_kind(), TokenKind::Lt) {
                return Err(CompileError::new(
                    ErrorKind::ExpectedToken("<".into()),
                    span,
                    "Option 뒤에는 '<' 가 와야 합니다. 예: Option<float>",
                ));
            }
            self.expect(&TokenKind::Lt)?;
            let inner = self.expect_ident()?;
            self.expect(&TokenKind::Gt)?;
            Ok(format!("Option<{}>", inner))
        } else {
            self.expect_ident()
        }
    }

    // ── var_stmt ──────────────────────────────────────────────────────────────
    // var_stmt = "mut"? "v" IDENT "=" pipeline_expr ";"?

    fn parse_var_stmt(&mut self) -> CompileResult<Stmt> {
        let is_mut = self.eat(&TokenKind::Mut);
        self.expect(&TokenKind::V)?;
        let var_name = self.expect_ident()?;
        self.expect(&TokenKind::Assign)?;
        let (source, ops) = self.parse_pipeline_expr()?;
        self.eat(&TokenKind::Semicolon);
        Ok(Stmt::VarDecl { var_name, is_mut, source, ops })
    }

    // ── 파이프라인 표현식 ──────────────────────────────────────────────────────
    // pipeline_expr = (load_expr | var_ref_expr) ("|>" pipeline_op)*

    fn parse_pipeline_expr(&mut self) -> CompileResult<(PipelineSource, Vec<PipelineOp>)> {
        // 소스 결정: load(...) 또는 변수 참조
        let source = match self.current_kind() {
            TokenKind::Load => self.parse_load_source()?,
            TokenKind::Ident(name) => {
                let var_name = name.clone();
                self.advance();
                PipelineSource::VarRef(var_name)
            }
            other => {
                return Err(CompileError::new(
                    ErrorKind::UnexpectedToken(format!("{:?}", other)),
                    self.current_span(),
                    format!(
                        "파이프라인은 load(...) 또는 변수 참조로 시작해야 합니다. 실제: {:?}",
                        other
                    ),
                ));
            }
        };

        // |> 연산자 체이닝
        let mut ops: Vec<PipelineOp> = Vec::new();
        while matches!(self.current_kind(), TokenKind::Pipeline) {
            self.advance(); // |> 소비
            ops.push(self.parse_pipeline_op()?);
        }

        Ok((source, ops))
    }

    // load_expr = "load" "(" STRING_LIT ")" "::" IDENT
    fn parse_load_source(&mut self) -> CompileResult<PipelineSource> {
        self.expect(&TokenKind::Load)?;
        self.expect(&TokenKind::LParen)?;

        let file_path = match self.current_kind() {
            TokenKind::StringLit(s) => {
                self.advance();
                s
            }
            other => {
                return Err(CompileError::new(
                    ErrorKind::ExpectedToken("StringLit".into()),
                    self.current_span(),
                    format!("load() 경로는 문자열 리터럴이어야 합니다. 실제: {:?}", other),
                ));
            }
        };

        self.expect(&TokenKind::RParen)?;

        // :: 뒤에 스키마 이름
        if !matches!(self.current_kind(), TokenKind::TypeAssign) {
            let span = self.current_span();
            return Err(CompileError::new(
                ErrorKind::ExpectedToken("::".into()),
                span,
                "'::' 뒤에는 스키마 이름이 와야 합니다. 예: load(\"data.csv\") :: AirQuality",
            ));
        }
        self.expect(&TokenKind::TypeAssign)?; // ::
        let schema_name = self.expect_ident()?;

        Ok(PipelineSource::Load { file_path, schema_name })
    }

    // ── PipelineOp ────────────────────────────────────────────────────────────

    fn parse_pipeline_op(&mut self) -> CompileResult<PipelineOp> {
        match self.current_kind() {
            TokenKind::Filter => {
                self.advance();
                self.expect(&TokenKind::LParen)?;
                let expr = self.parse_expr()?;
                self.expect(&TokenKind::RParen)?;
                Ok(PipelineOp::Filter(expr))
            }
            TokenKind::Select => {
                self.advance();
                self.expect(&TokenKind::LParen)?;
                self.expect(&TokenKind::LBracket)?;

                let mut cols = Vec::new();
                loop {
                    if matches!(self.current_kind(), TokenKind::RBracket | TokenKind::Eof) {
                        break;
                    }
                    cols.push(self.expect_ident()?);
                    if !self.eat(&TokenKind::Comma) {
                        break;
                    }
                    if matches!(self.current_kind(), TokenKind::RBracket) {
                        break;
                    }
                }

                self.expect(&TokenKind::RBracket)?;
                self.expect(&TokenKind::RParen)?;
                Ok(PipelineOp::Select(cols))
            }
            TokenKind::Count => {
                self.advance();
                Ok(PipelineOp::Count)
            }
            other => Err(CompileError::new(
                ErrorKind::UnexpectedToken(format!("{:?}", other)),
                self.current_span(),
                format!("|> 뒤에는 filter, select, count 중 하나가 와야 합니다. 실제: {:?}", other),
            )),
        }
    }

    // ── 표현식 ────────────────────────────────────────────────────────────────
    // expr = primary (binop primary)?

    fn parse_expr(&mut self) -> CompileResult<Expr> {
        let lhs = self.parse_primary()?;
        if let Some(op) = self.current_binop() {
            self.advance();
            let rhs = self.parse_primary()?;
            Ok(Expr::BinOp { lhs: Box::new(lhs), op, rhs: Box::new(rhs) })
        } else {
            Ok(lhs)
        }
    }

    fn current_binop(&self) -> Option<BinOpKind> {
        match self.current_kind() {
            TokenKind::EqEq  => Some(BinOpKind::Eq),
            TokenKind::NotEq => Some(BinOpKind::NotEq),
            TokenKind::Lt    => Some(BinOpKind::Lt),
            TokenKind::Gt    => Some(BinOpKind::Gt),
            TokenKind::LtEq  => Some(BinOpKind::LtEq),
            TokenKind::GtEq  => Some(BinOpKind::GtEq),
            _                => None,
        }
    }

    fn parse_primary(&mut self) -> CompileResult<Expr> {
        match self.current_kind() {
            TokenKind::Ident(s) => {
                self.advance();
                Ok(Expr::Ident(s))
            }
            TokenKind::IntLit(n) => {
                self.advance();
                Ok(Expr::IntLit(n))
            }
            TokenKind::FloatLit(f) => {
                self.advance();
                Ok(Expr::FloatLit(f))
            }
            TokenKind::StringLit(s) => {
                self.advance();
                Ok(Expr::StringLit(s))
            }
            TokenKind::LParen => {
                self.advance();
                let e = self.parse_expr()?;
                self.expect(&TokenKind::RParen)?;
                Ok(e)
            }
            other => Err(CompileError::new(
                ErrorKind::UnexpectedToken(format!("{:?}", other)),
                self.current_span(),
                format!("표현식에 사용할 수 없는 토큰: {:?}", other),
            )),
        }
    }

    // ── 유틸리티 ──────────────────────────────────────────────────────────────

    fn expect_ident(&mut self) -> CompileResult<String> {
        match self.current_kind() {
            TokenKind::Ident(s) => {
                self.advance();
                Ok(s)
            }
            other => Err(CompileError::new(
                ErrorKind::ExpectedToken("Ident".into()),
                self.current_span(),
                format!("식별자(변수명/컬럼명)가 필요합니다. 실제: {:?}", other),
            )),
        }
    }
}

// ── 유닛 테스트 ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lexer::Lexer;
    use crate::ast::{Expr, BinOpKind, PipelineOp, PipelineSource, Stmt, StructField};

    fn parse_src(src: &str) -> CompileResult<Program> {
        let mut lexer = Lexer::new(src);
        let tokens = lexer.tokenize()?;
        let mut parser = Parser::new(tokens);
        parser.parse()
    }

    // ── 테스트 1: 변수 선언 파싱 및 VarDecl AST 빌드 ────────────────────────
    #[test]
    fn test_var_decl_and_pipeline_op() {
        let src = r#"v result = load("data.csv") :: AirQuality |> count;"#;
        let program = parse_src(src).expect("파싱 실패");
        assert_eq!(program.stmts.len(), 1);

        match &program.stmts[0] {
            Stmt::VarDecl { var_name, is_mut, source, ops } => {
                assert_eq!(var_name, "result");
                assert!(!is_mut);
                assert_eq!(
                    source,
                    &PipelineSource::Load {
                        file_path: "data.csv".into(),
                        schema_name: "AirQuality".into(),
                    }
                );
                assert_eq!(ops.len(), 1);
                assert_eq!(ops[0], PipelineOp::Count);
            }
            other => panic!("VarDecl 예상, 실제: {:?}", other),
        }
    }

    // ── 테스트 2: load :: filter 파싱 및 AST BinOp 검증 ─────────────────────
    #[test]
    fn test_load_filter_select_ast() {
        let src =
            r#"v air = load("seoul.csv") :: AirQuality |> filter(pm10 > 50) |> select([station, date]);"#;
        let program = parse_src(src).expect("파싱 실패");
        assert_eq!(program.stmts.len(), 1);

        match &program.stmts[0] {
            Stmt::VarDecl { var_name, source, ops, .. } => {
                assert_eq!(var_name, "air");
                assert_eq!(
                    source,
                    &PipelineSource::Load {
                        file_path: "seoul.csv".into(),
                        schema_name: "AirQuality".into(),
                    }
                );
                assert_eq!(ops.len(), 2);

                // filter(pm10 > 50)
                match &ops[0] {
                    PipelineOp::Filter(expr) => match expr {
                        Expr::BinOp { lhs, op, rhs } => {
                            assert_eq!(**lhs, Expr::Ident("pm10".into()));
                            assert_eq!(*op, BinOpKind::Gt);
                            assert_eq!(**rhs, Expr::IntLit(50));
                        }
                        _ => panic!("BinOp 예상"),
                    },
                    _ => panic!("Filter 예상"),
                }

                // select([station, date])
                match &ops[1] {
                    PipelineOp::Select(cols) => {
                        assert_eq!(cols, &vec!["station".to_string(), "date".to_string()]);
                    }
                    _ => panic!("Select 예상"),
                }
            }
            other => panic!("VarDecl 예상, 실제: {:?}", other),
        }
    }

    // ── 테스트 3: TypeDecl 파싱 검증 ────────────────────────────────────────
    #[test]
    fn test_type_decl_parsing() {
        let src = r#"
type AirQuality = {
  station: string,
  pm10: Option<float>,
};
"#;
        let program = parse_src(src).expect("파싱 실패");
        assert_eq!(program.stmts.len(), 1);
        match &program.stmts[0] {
            Stmt::TypeDecl { name, fields } => {
                assert_eq!(name, "AirQuality");
                assert_eq!(fields.len(), 2);
                assert_eq!(fields[0], StructField { name: "station".into(), field_type: "string".into() });
                assert_eq!(fields[1], StructField { name: "pm10".into(), field_type: "Option<float>".into() });
            }
            other => panic!("TypeDecl 예상, 실제: {:?}", other),
        }
    }

    // ── 테스트 4: VarRef (변수 참조) 파싱 ────────────────────────────────────
    #[test]
    fn test_var_ref_pipeline() {
        let src = r#"v filtered = air |> filter(pm25 > 10);"#;
        let program = parse_src(src).expect("파싱 실패");
        assert_eq!(program.stmts.len(), 1);
        match &program.stmts[0] {
            Stmt::VarDecl { var_name, source, ops, .. } => {
                assert_eq!(var_name, "filtered");
                assert_eq!(source, &PipelineSource::VarRef("air".into()));
                assert_eq!(ops.len(), 1);
            }
            other => panic!("VarDecl 예상, 실제: {:?}", other),
        }
    }

    // ── 테스트 5: :: 없이 load 시 에러 ───────────────────────────────────────
    #[test]
    fn test_missing_schema_error() {
        let src = r#"v x = load("data.csv") |> count;"#;
        let result = parse_src(src);
        assert!(
            result.is_err(),
            "스키마 없이 load 하면 에러여야 함"
        );
        let err = result.unwrap_err();
        // 에러 메시지에 '::' 언급 포함 확인
        assert!(
            err.message.contains("::") || format!("{}", err).contains("::"),
            "에러 메시지에 '::' 포함돼야 함: {}",
            err
        );
    }

    // ── 테스트 6: mut 변수 선언 ───────────────────────────────────────────────
    #[test]
    fn test_mut_var_decl() {
        let src = r#"mut v data = load("file.csv") :: Schema;"#;
        let program = parse_src(src).expect("파싱 실패");
        match &program.stmts[0] {
            Stmt::VarDecl { is_mut, .. } => assert!(*is_mut),
            other => panic!("VarDecl 예상: {:?}", other),
        }
    }
}
