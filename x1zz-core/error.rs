/// x1zzLang - 컴파일러/런타임 에러 타입 정의 (v0.15)
/// Diagnostic Engine: Line/Col 정확 추적 + 친화적 메시지 포맷

use crate::token::Span;

/// 컴파일 에러 종류 (ErrorKind 고도화)
#[derive(Debug, Clone, PartialEq)]
pub enum ErrorKind {
    /// 렉서: 알 수 없는 문자
    UnexpectedChar(char),
    /// 파서: 예상치 못한 토큰
    UnexpectedToken(String),
    /// 파서: 예상 토큰 미등장
    ExpectedToken(String),
    /// 코드젠/런타임: 미선언 타입 참조
    UndeclaredType(String),
    /// 런타임: 미선언 변수 참조
    UndeclaredVariable(String),
    /// 런타임: 타입 불일치 (선언 타입, 실제 타입)
    TypeMismatch { expected: String, found: String, field: String },
    /// 런타임: 필수 필드에 null 발생
    NullViolation { field: String, schema: String },
    /// 런타임: 파일 입출력 오류
    IoError(String),
    /// 런타임: CSV 스키마 매핑 실패
    SchemaMappingFailed { schema: String, reason: String },
    /// 기타
    Other(String),
}

impl ErrorKind {
    /// 에러 종류의 카테고리 레이블 반환
    pub fn category(&self) -> &'static str {
        match self {
            ErrorKind::UnexpectedChar(_)             => "렉서 에러",
            ErrorKind::UnexpectedToken(_)            => "구문 에러",
            ErrorKind::ExpectedToken(_)              => "구문 에러",
            ErrorKind::UndeclaredType(_)             => "타입 에러",
            ErrorKind::UndeclaredVariable(_)         => "변수 에러",
            ErrorKind::TypeMismatch { .. }           => "타입 에러",
            ErrorKind::NullViolation { .. }          => "Null 위반",
            ErrorKind::IoError(_)                    => "IO 에러",
            ErrorKind::SchemaMappingFailed { .. }    => "스키마 에러",
            ErrorKind::Other(_)                      => "에러",
        }
    }
}

/// 컴파일 에러 구조체
#[derive(Debug, Clone, PartialEq)]
pub struct CompileError {
    pub kind: ErrorKind,
    pub span: Span,
    pub message: String,
}

impl CompileError {
    pub fn new(kind: ErrorKind, span: Span, message: impl Into<String>) -> Self {
        CompileError {
            kind,
            span,
            message: message.into(),
        }
    }

    /// span이 없는 에러 생성 (런타임 에러용)
    pub fn runtime(kind: ErrorKind, message: impl Into<String>) -> Self {
        CompileError {
            kind,
            span: Span::new(0, 0),
            message: message.into(),
        }
    }
}

impl std::fmt::Display for CompileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // 형식: "<카테고리> [Line X: Col Y]: <메시지>"
        // span이 0,0이면 위치 생략 (런타임 에러)
        if self.span.line == 0 {
            write!(
                f,
                "{}: {}",
                self.kind.category(),
                self.message
            )
        } else {
            write!(
                f,
                "{} [Line {}: Col {}]: {}",
                self.kind.category(),
                self.span.line,
                self.span.col,
                self.message
            )
        }
    }
}

impl std::error::Error for CompileError {}

/// 컴파일 결과 타입 별칭
pub type CompileResult<T> = Result<T, CompileError>;
