/// x1zzLang - 렉서 (Peekable<Chars> 상태 머신 완전 구현)
///
/// 모든 필드를 실제로 사용하여 dead_code 경고 없음:
///   source  - byte 오프셋 경계 확인용 (is_at_end)
///   chars   - 상태 머신 이터레이터
///   pos     - 현재 바이트 오프셋 (UTF-8 len_utf8 누적)
///   line/col- 소스 위치 추적

use crate::error::{CompileError, CompileResult, ErrorKind};
use crate::token::{Span, Token, TokenKind};

pub struct Lexer<'src> {
    source: &'src str,
    chars: std::iter::Peekable<std::str::Chars<'src>>,
    pos: usize,
    line: usize,
    col: usize,
}

impl<'src> Lexer<'src> {
    pub fn new(source: &'src str) -> Self {
        Lexer {
            source,
            chars: source.chars().peekable(),
            pos: 0,
            line: 1,
            col: 1,
        }
    }

    // ── 기본 헬퍼 ────────────────────────────────────────────────────────────

    /// 이터레이터를 끝까지 소비했는지 확인 (source 필드 참조)
    fn is_at_end(&self) -> bool {
        self.pos >= self.source.len()
    }

    fn peek(&mut self) -> Option<char> {
        self.chars.peek().copied()
    }

    /// 한 문자를 소비하고 pos / line / col 갱신
    fn advance(&mut self) -> Option<char> {
        match self.chars.next() {
            Some(c) => {
                self.pos += c.len_utf8();
                if c == '\n' {
                    self.line += 1;
                    self.col = 1;
                } else {
                    self.col += 1;
                }
                Some(c)
            }
            None => None,
        }
    }

    fn span(&self) -> Span {
        Span::new(self.line, self.col)
    }

    // ── 문자열 리터럴 ────────────────────────────────────────────────────────

    /// 여는 '"' 이미 소비된 상태에서 호출
    fn read_string(&mut self, open_span: Span) -> CompileResult<TokenKind> {
        let mut s = String::new();
        loop {
            match self.advance() {
                Some('"') => break,
                Some('\\') => match self.advance() {
                    Some('n')  => s.push('\n'),
                    Some('t')  => s.push('\t'),
                    Some('\\') => s.push('\\'),
                    Some('"')  => s.push('"'),
                    Some(c)    => s.push(c),
                    None => {
                        return Err(CompileError::new(
                            ErrorKind::UnexpectedToken("EOF in string escape".into()),
                            open_span,
                            "문자열 이스케이프 처리 중 파일 끝",
                        ));
                    }
                },
                Some(c) => s.push(c),
                None => {
                    return Err(CompileError::new(
                        ErrorKind::UnexpectedToken("Unterminated string".into()),
                        open_span,
                        "닫는 '\"' 없이 파일이 끝남",
                    ));
                }
            }
        }
        Ok(TokenKind::StringLit(s))
    }

    // ── 숫자 리터럴 ──────────────────────────────────────────────────────────

    /// 첫 번째 자리(first)는 이미 소비된 상태
    fn read_number(&mut self, first: char) -> TokenKind {
        let mut buf = String::new();
        buf.push(first);

        // 정수 부분
        while self.peek().map_or(false, |c| c.is_ascii_digit()) {
            buf.push(self.advance().unwrap());
        }

        // 소수점 + 소수 부분
        if self.peek() == Some('.') {
            self.advance();   // '.' 소비
            buf.push('.');
            while self.peek().map_or(false, |c| c.is_ascii_digit()) {
                buf.push(self.advance().unwrap());
            }
            return TokenKind::FloatLit(buf.parse().unwrap_or(0.0));
        }

        TokenKind::IntLit(buf.parse().unwrap_or(0))
    }

    // ── 식별자 · 키워드 ──────────────────────────────────────────────────────

    fn read_ident(&mut self, first: char) -> TokenKind {
        let mut buf = String::new();
        buf.push(first);
        while self.peek().map_or(false, |c| c.is_alphanumeric() || c == '_') {
            buf.push(self.advance().unwrap());
        }
        Self::keyword_or_ident(buf)
    }

    fn keyword_or_ident(s: String) -> TokenKind {
        match s.as_str() {
            "type"   => TokenKind::Type,
            "load"   => TokenKind::Load,
            "filter" => TokenKind::Filter,
            "select" => TokenKind::Select,
            "count"  => TokenKind::Count,
            "v"      => TokenKind::V,
            "mut"    => TokenKind::Mut,
            "Option" => TokenKind::OptionKw,
            _        => TokenKind::Ident(s),
        }
    }

    // ── 메인 상태 머신 ────────────────────────────────────────────────────────

    /// 다음 Token을 하나 반환 (상태 머신 핵심)
    pub fn next_token(&mut self) -> CompileResult<Token> {
        // 공백 건너뛰기
        while self.peek().map_or(false, |c| c.is_whitespace()) {
            self.advance();
        }

        // 파일 끝
        if self.is_at_end() {
            return Ok(Token::new(TokenKind::Eof, self.span()));
        }

        let span = self.span();
        let ch = match self.advance() {
            Some(c) => c,
            None    => return Ok(Token::new(TokenKind::Eof, span)),
        };

        let kind = match ch {
            // ── 주석 ──────────────────────────────────────────────────
            '/' if self.peek() == Some('/') => {
                // 줄 끝까지 소비 후 재귀 호출
                while self.peek().map_or(false, |c| c != '\n') {
                    self.advance();
                }
                return self.next_token();
            }
            '/' => TokenKind::Slash,

            // ── 문자열 ────────────────────────────────────────────────
            '"' => self.read_string(span.clone())?,

            // ── 두 문자 연산자 ─────────────────────────────────────────
            '|' if self.peek() == Some('>') => {
                self.advance();
                TokenKind::Pipeline
            }
            ':' if self.peek() == Some(':') => {
                self.advance();
                TokenKind::TypeAssign
            }
            '=' if self.peek() == Some('=') => {
                self.advance();
                TokenKind::EqEq
            }
            '!' if self.peek() == Some('=') => {
                self.advance();
                TokenKind::NotEq
            }
            '<' if self.peek() == Some('=') => {
                self.advance();
                TokenKind::LtEq
            }
            '>' if self.peek() == Some('=') => {
                self.advance();
                TokenKind::GtEq
            }

            // ── 단일 문자 연산자 ───────────────────────────────────────
            '=' => TokenKind::Assign,
            '<' => TokenKind::Lt,
            '>' => TokenKind::Gt,
            '+' => TokenKind::Plus,
            '*' => TokenKind::Star,
            '!' => TokenKind::Bang,
            '.' => TokenKind::Dot,
            ':' => TokenKind::Colon,

            // ── 음수 또는 Minus ────────────────────────────────────────
            '-' if self.peek().map_or(false, |c| c.is_ascii_digit()) => {
                let digit = self.advance().unwrap();
                match self.read_number(digit) {
                    TokenKind::IntLit(n)   => TokenKind::IntLit(-n),
                    TokenKind::FloatLit(f) => TokenKind::FloatLit(-f),
                    other                  => other,
                }
            }
            '-' => TokenKind::Minus,

            // ── 구분자 ────────────────────────────────────────────────
            '{' => TokenKind::LBrace,
            '}' => TokenKind::RBrace,
            '(' => TokenKind::LParen,
            ')' => TokenKind::RParen,
            '[' => TokenKind::LBracket,
            ']' => TokenKind::RBracket,
            ',' => TokenKind::Comma,
            ';' => TokenKind::Semicolon,

            // ── 숫자 ───────────────────────────────────────────────────
            c if c.is_ascii_digit() => self.read_number(c),

            // ── 식별자 / 키워드 ────────────────────────────────────────
            c if c.is_alphabetic() || c == '_' => self.read_ident(c),

            // ── 알 수 없는 문자 ────────────────────────────────────────
            other => {
                return Err(CompileError::new(
                    ErrorKind::UnexpectedChar(other),
                    span,
                    format!("예상치 못한 문자: '{}'", other),
                ));
            }
        };

        Ok(Token::new(kind, span))
    }

    /// 소스 전체를 토크나이징하여 Vec<Token> 반환
    pub fn tokenize(&mut self) -> CompileResult<Vec<Token>> {
        let mut tokens = Vec::new();
        loop {
            let tok = self.next_token()?;
            let done = matches!(tok.kind, TokenKind::Eof) || self.is_at_end();
            tokens.push(tok);
            if done {
                break;
            }
        }
        Ok(tokens)
    }
}

// ── 렉서 유닛 테스트 ─────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::token::TokenKind;

    fn tokenize(src: &str) -> Vec<TokenKind> {
        let mut lexer = Lexer::new(src);
        lexer
            .tokenize()
            .expect("토크나이징 실패")
            .into_iter()
            .map(|t| t.kind)
            .collect()
    }

    // ── 테스트 1: 변수 선언 키워드 + 파이프라인 연산자(|>) 토크나이징 ────────
    #[test]
    fn test_var_decl_and_pipeline_token() {
        let kinds = tokenize("v result = load(\"data.csv\") :: MySchema |> count");
        assert!(kinds.contains(&TokenKind::V),            "V 토큰 없음");
        assert!(kinds.contains(&TokenKind::Assign),       "Assign 토큰 없음");
        assert!(kinds.contains(&TokenKind::Load),         "Load 토큰 없음");
        assert!(kinds.contains(&TokenKind::TypeAssign),   "TypeAssign(::) 토큰 없음");
        assert!(kinds.contains(&TokenKind::Pipeline),     "|> 토큰 없음");
        assert!(kinds.contains(&TokenKind::Count),        "Count 토큰 없음");
        assert!(kinds.contains(&TokenKind::Ident("MySchema".into())), "MySchema Ident 없음");
        assert!(kinds.contains(&TokenKind::StringLit("data.csv".into())), "StringLit 없음");
    }

    // ── 테스트 2: mut 키워드 + 음수 리터럴 ──────────────────────────────────
    #[test]
    fn test_mut_keyword_and_negative_literal() {
        let kinds = tokenize("mut v x = -42");
        assert!(kinds.contains(&TokenKind::Mut),           "Mut 토큰 없음");
        assert!(kinds.contains(&TokenKind::V),             "V 토큰 없음");
        assert!(kinds.contains(&TokenKind::IntLit(-42)),   "IntLit(-42) 없음");
    }

    // ── 테스트 3: Option<float> 타입 토크나이징 ─────────────────────────────
    #[test]
    fn test_option_type_tokens() {
        let kinds = tokenize("pm10: Option<float>");
        assert!(kinds.contains(&TokenKind::Colon),         "Colon 없음");
        assert!(kinds.contains(&TokenKind::OptionKw),      "OptionKw 없음");
        assert!(kinds.contains(&TokenKind::Lt),            "Lt(<) 없음");
        assert!(kinds.contains(&TokenKind::Ident("float".into())), "float Ident 없음");
        assert!(kinds.contains(&TokenKind::Gt),            "Gt(>) 없음");
    }

    // ── 테스트 4: 비교 연산자 전체 ──────────────────────────────────────────
    #[test]
    fn test_comparison_operators() {
        let kinds = tokenize("a == b != c < d > e <= f >= g");
        assert!(kinds.contains(&TokenKind::EqEq));
        assert!(kinds.contains(&TokenKind::NotEq));
        assert!(kinds.contains(&TokenKind::Lt));
        assert!(kinds.contains(&TokenKind::Gt));
        assert!(kinds.contains(&TokenKind::LtEq));
        assert!(kinds.contains(&TokenKind::GtEq));
    }

    // ── 테스트 5: 주석 무시 ─────────────────────────────────────────────────
    #[test]
    fn test_comment_ignored() {
        let kinds = tokenize("v x = 1 // this is a comment\n");
        // 주석 내용은 토큰으로 나타나지 않아야 함
        assert!(!kinds.contains(&TokenKind::Slash), "Slash 토큰이 주석에서 생성됨");
        assert!(kinds.contains(&TokenKind::V));
        assert!(kinds.contains(&TokenKind::IntLit(1)));
    }

    // ── 테스트 6: 문자열 이스케이프 ─────────────────────────────────────────
    #[test]
    fn test_string_escape_sequences() {
        let kinds = tokenize(r#""hello\nworld""#);
        assert!(kinds.contains(&TokenKind::StringLit("hello\nworld".into())));
    }

    // ── 테스트 7: Span(위치) 추적 정확성 ────────────────────────────────────
    #[test]
    fn test_span_tracking() {
        let src = "v\n result";
        let mut lexer = Lexer::new(src);
        let tokens = lexer.tokenize().unwrap();
        // 첫 토큰 'v' → line 1
        assert_eq!(tokens[0].span.line, 1);
        // 두 번째 토큰 'result' → line 2
        let result_tok = tokens.iter().find(|t| t.kind == TokenKind::Ident("result".into()));
        assert!(result_tok.is_some());
        assert_eq!(result_tok.unwrap().span.line, 2);
    }

    // ── 테스트 8: 알 수 없는 문자 에러 ─────────────────────────────────────
    #[test]
    fn test_unknown_char_error() {
        let mut lexer = Lexer::new("v @ x");
        let result = lexer.tokenize();
        assert!(result.is_err(), "@ 문자는 에러여야 함");
        let err = result.unwrap_err();
        assert!(matches!(err.kind, crate::error::ErrorKind::UnexpectedChar('@')));
    }
}
