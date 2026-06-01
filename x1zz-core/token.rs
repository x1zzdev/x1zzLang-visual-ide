/// x1zzLang - Token definitions
/// Span: 소스 위치 정보 (Serde 없음)

#[derive(Debug, Clone, PartialEq)]
pub struct Span {
    pub line: usize,
    pub col: usize,
}

impl Span {
    pub fn new(line: usize, col: usize) -> Self {
        Span { line, col }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum TokenKind {
    // ── 연산자 ──────────────────────────────────────
    /// |>
    Pipeline,
    /// ::
    TypeAssign,
    /// =
    Assign,
    /// ==
    EqEq,
    /// !=
    NotEq,
    /// <
    Lt,
    /// >
    Gt,
    /// <=
    LtEq,
    /// >=
    GtEq,
    /// +
    Plus,
    /// -
    Minus,
    /// *
    Star,
    /// /
    Slash,
    /// !
    Bang,
    /// .
    Dot,

    // ── 구분자 ──────────────────────────────────────
    /// {
    LBrace,
    /// }
    RBrace,
    /// (
    LParen,
    /// )
    RParen,
    /// [
    LBracket,
    /// ]
    RBracket,
    /// ,
    Comma,
    /// ;
    Semicolon,
    /// :  (단일 콜론 — 필드 타입 구분자)
    Colon,

    // ── 키워드 ──────────────────────────────────────
    /// type
    Type,
    /// load
    Load,
    /// filter
    Filter,
    /// select
    Select,
    /// count
    Count,
    /// v  (불변 변수 선언)
    V,
    /// mut
    Mut,
    /// Option  (Option<T> 타입 키워드)
    OptionKw,

    // ── 리터럴 / 식별자 ─────────────────────────────
    /// 일반 식별자
    Ident(String),
    /// 문자열 리터럴
    StringLit(String),
    /// 정수 리터럴
    IntLit(i64),
    /// 부동소수 리터럴
    FloatLit(f64),

    // ── 파일 끝 ─────────────────────────────────────
    Eof,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Token {
    pub kind: TokenKind,
    pub span: Span,
}

impl Token {
    pub fn new(kind: TokenKind, span: Span) -> Self {
        Token { kind, span }
    }
}
