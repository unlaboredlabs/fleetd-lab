//! Tests that drive the language server with TOML 1.1 documents.

use futures::{
    channel::mpsc::{unbounded, UnboundedReceiver, UnboundedSender},
    SinkExt, StreamExt,
};
use lsp_async_stub::{
    rpc::{Message, Request},
    Server,
};
use lsp_types::{
    notification::{DidOpenTextDocument, Notification, PublishDiagnostics},
    request::{
        Completion, DocumentSymbolRequest, FoldingRangeRequest, HoverRequest, Initialize,
        SemanticTokensFullRequest,
    },
    CompletionParams, CompletionResponse, DidOpenTextDocumentParams, DocumentSymbolParams,
    DocumentSymbolResponse, FoldingRange, FoldingRangeParams, Hover, HoverContents, HoverParams,
    InitializeParams, NumberOrString, Position, PublishDiagnosticsParams, SemanticTokensParams,
    SemanticTokensResult, TextDocumentIdentifier, TextDocumentItem, TextDocumentPositionParams,
    Url,
};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::{json, Value};
use std::io;
use taplo_common::{
    environment::native::NativeEnvironment,
    schema::associations::{AssociationRule, SchemaAssociation},
};

use crate::{
    lsp_ext::request::{ConvertToJsonParams, ConvertToJsonRequest},
    world::{World, DEFAULT_WORKSPACE_URL},
};

const TOML_1_1_DOCUMENT: &str = r#"# Ünïcödé comment — 日本語 🎉
name = "esc\e[0m \x41\xe9"
lit = 'ñ — literal'
time = 07:32
local = 1979-05-27 07:32
offset = 1979-05-27T07:32Z
date = 1979-05-27
1 = "numeric key"

point = {
    x = 1, # the x coordinate
    # a comment line — ünïcödé
    y = 2,
    nested = { a = [1, 2,], b = {
        c = 07:32:01,
    } },
}

[table]
inline = { a = 1, b = "two", }
"#;

fn toml_1_1_json() -> Value {
    json!({
        "name": "esc\u{1b}[0m A\u{e9}",
        "lit": "ñ — literal",
        "time": "07:32:00",
        "local": "1979-05-27T07:32:00",
        "offset": "1979-05-27T07:32:00Z",
        "date": "1979-05-27",
        "1": "numeric key",
        "point": {
            "x": 1,
            "y": 2,
            "nested": { "a": [1, 2], "b": { "c": "07:32:01" } },
        },
        "table": { "inline": { "a": 1, "b": "two" } },
    })
}

fn toml_1_1_schema() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["name", "lit", "time", "local", "offset", "date", "1", "point", "table"],
        "properties": {
            "name": { "type": "string", "const": "esc\u{1b}[0m A\u{e9}" },
            "lit": { "type": "string" },
            "time": { "type": "string", "const": "07:32:00" },
            "local": { "type": "string", "const": "1979-05-27T07:32:00" },
            "offset": { "type": "string", "format": "date-time" },
            "date": { "type": "string", "format": "date" },
            "1": { "type": "string" },
            "point": {
                "type": "object",
                "additionalProperties": false,
                "required": ["x", "y", "nested"],
                "properties": {
                    "x": { "type": "integer", "description": "The x coordinate." },
                    "y": { "type": "integer", "description": "The y coordinate." },
                    "z": { "type": "integer", "description": "The z coordinate." },
                    "nested": {
                        "type": "object",
                        "properties": {
                            "a": { "type": "array", "items": { "type": "integer" } },
                            "b": {
                                "type": "object",
                                "properties": { "c": { "type": "string" } },
                            },
                        },
                    },
                },
            },
            "table": { "type": "object" },
        },
    })
}

struct TestServer {
    server: Server<World<NativeEnvironment>>,
    world: World<NativeEnvironment>,
    writer: UnboundedSender<Message>,
    messages: UnboundedReceiver<Message>,
    notifications: Vec<Message>,
    next_id: i32,
}

impl TestServer {
    async fn new() -> Self {
        let (writer, messages) = unbounded();
        let mut server = TestServer {
            server: crate::create_server(),
            world: crate::create_world(NativeEnvironment::new()),
            writer,
            messages,
            notifications: Vec::new(),
            next_id: 0,
        };

        server
            .request::<Initialize>(InitializeParams::default())
            .await;

        server
    }

    async fn send(&mut self, message: Message) {
        self.server
            .handle_message(
                self.world.clone(),
                message,
                self.writer
                    .clone()
                    .sink_map_err(|_| io::ErrorKind::Other.into()),
            )
            .await
            .unwrap();
    }

    async fn request<R: lsp_types::request::Request>(&mut self, params: R::Params) -> R::Result
    where
        R::Params: Serialize + DeserializeOwned,
        R::Result: DeserializeOwned,
    {
        self.next_id += 1;
        let id = NumberOrString::Number(self.next_id);

        self.send(
            Request::new()
                .with_method(R::METHOD)
                .with_id(Some(id.clone()))
                .with_params(Some(params))
                .into_message(),
        )
        .await;

        loop {
            let message = self.messages.next().await.unwrap();

            if message.is_response() && message.id.as_ref() == Some(&id) {
                assert!(
                    message.error.is_none(),
                    "{} failed: {:?}",
                    R::METHOD,
                    message.error
                );
                return serde_json::from_value(message.result.unwrap_or_default()).unwrap();
            }

            self.notifications.push(message);
        }
    }

    async fn notify<N: Notification>(&mut self, params: N::Params)
    where
        N::Params: Serialize + DeserializeOwned,
    {
        self.send(
            Request::new()
                .with_method(N::METHOD)
                .with_params(Some(params))
                .into_message(),
        )
        .await;

        while let Ok(Some(message)) = self.messages.try_next() {
            self.notifications.push(message);
        }
    }

    async fn associate_schema(&mut self, schema: Value) {
        let url: Url = "taplo-test://schema.json".parse().unwrap();
        let workspaces = self.world.workspaces.read().await;
        let ws = workspaces.get(&*DEFAULT_WORKSPACE_URL).unwrap();
        ws.schemas.add_schema(&url, schema.into()).await;
        ws.schemas.associations().add(
            AssociationRule::regex(".*").unwrap(),
            SchemaAssociation {
                meta: json!({}),
                url,
                priority: 1,
            },
        );
    }

    async fn open(&mut self, uri: &Url, text: &str) {
        self.notify::<DidOpenTextDocument>(DidOpenTextDocumentParams {
            text_document: TextDocumentItem {
                uri: uri.clone(),
                language_id: "toml".into(),
                version: 0,
                text: text.into(),
            },
        })
        .await;
    }

    /// The last published diagnostics for the document.
    fn diagnostics(&self, uri: &Url) -> Vec<lsp_types::Diagnostic> {
        self.notifications
            .iter()
            .filter(|m| m.method.as_deref() == Some(PublishDiagnostics::METHOD))
            .map(|m| {
                serde_json::from_value::<PublishDiagnosticsParams>(m.params.clone().unwrap())
                    .unwrap()
            })
            .filter(|p| p.uri == *uri)
            .last()
            .expect("no diagnostics were published")
            .diagnostics
    }
}

fn position_params(uri: &Url, position: Position) -> TextDocumentPositionParams {
    TextDocumentPositionParams {
        text_document: TextDocumentIdentifier { uri: uri.clone() },
        position,
    }
}

/// All LSP positions of the text (UTF-16), including the ends of lines.
fn all_positions(text: &str) -> Vec<Position> {
    text.split('\n')
        .enumerate()
        .flat_map(|(line, s)| {
            (0..=s.encode_utf16().count()).map(move |character| Position {
                line: line as u32,
                character: character as u32,
            })
        })
        .collect()
}

/// The position right before the first occurrence of `pattern`.
fn position_of(text: &str, pattern: &str) -> Position {
    let offset = text.find(pattern).unwrap();
    let before = &text[..offset];
    let line_start = before.rfind('\n').map_or(0, |i| i + 1);
    Position {
        line: before.matches('\n').count() as u32,
        character: before[line_start..].encode_utf16().count() as u32,
    }
}

fn hover_text(hover: Option<Hover>) -> String {
    match hover.map(|h| h.contents) {
        Some(HoverContents::Markup(m)) => m.value,
        other => panic!("unexpected hover: {other:?}"),
    }
}

fn completion_labels(completion: Option<CompletionResponse>) -> Vec<String> {
    match completion {
        Some(CompletionResponse::Array(items)) => items.into_iter().map(|i| i.label).collect(),
        other => panic!("unexpected completion: {other:?}"),
    }
}

fn run(test: impl std::future::Future<Output = ()>) {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(tokio::task::LocalSet::new().run_until(test));
}

#[test]
fn toml_1_1_document_without_schema() {
    run(async {
        let uri: Url = "untitled:toml-1-1.toml".parse().unwrap();
        let mut server = TestServer::new().await;
        server.open(&uri, TOML_1_1_DOCUMENT).await;

        assert_eq!(server.diagnostics(&uri), Vec::new());

        let json = server
            .request::<ConvertToJsonRequest>(ConvertToJsonParams {
                text: TOML_1_1_DOCUMENT.into(),
            })
            .await;
        assert_eq!(json.error, None);
        assert_eq!(
            serde_json::from_str::<Value>(&json.text.unwrap()).unwrap(),
            toml_1_1_json()
        );

        let symbols = server
            .request::<DocumentSymbolRequest>(DocumentSymbolParams {
                text_document: TextDocumentIdentifier { uri: uri.clone() },
                work_done_progress_params: Default::default(),
                partial_result_params: Default::default(),
            })
            .await;
        let Some(DocumentSymbolResponse::Nested(symbols)) = symbols else {
            panic!("unexpected symbols: {symbols:?}");
        };
        let point = symbols.iter().find(|s| s.name == "point").unwrap();
        assert_eq!(
            point.range.start,
            position_of(TOML_1_1_DOCUMENT, "{\n    x")
        );
        assert_eq!(
            point.range.end.line,
            position_of(TOML_1_1_DOCUMENT, "}\n\n").line
        );
        assert_eq!(
            point
                .children
                .iter()
                .flatten()
                .map(|s| s.name.as_str())
                .collect::<Vec<_>>(),
            ["x", "y", "nested"]
        );

        let tokens = server
            .request::<SemanticTokensFullRequest>(SemanticTokensParams {
                work_done_progress_params: Default::default(),
                partial_result_params: Default::default(),
                text_document: TextDocumentIdentifier { uri: uri.clone() },
            })
            .await;
        let Some(SemanticTokensResult::Tokens(tokens)) = tokens else {
            panic!("unexpected semantic tokens: {tokens:?}");
        };
        // `point`, `nested`, `a`, `b` and `inline`.
        assert_eq!(tokens.data.len(), 5);

        let folding_ranges = server
            .request::<FoldingRangeRequest>(FoldingRangeParams {
                text_document: TextDocumentIdentifier { uri: uri.clone() },
                work_done_progress_params: Default::default(),
                partial_result_params: Default::default(),
            })
            .await
            .unwrap();
        // The multi-line inline tables can be folded.
        let folds = |line| {
            folding_ranges
                .iter()
                .any(|r: &FoldingRange| r.start_line == line)
        };
        assert!(folds(position_of(TOML_1_1_DOCUMENT, "{\n    x").line));
        assert!(folds(position_of(TOML_1_1_DOCUMENT, "{\n        c").line));

        for position in all_positions(TOML_1_1_DOCUMENT) {
            server
                .request::<HoverRequest>(HoverParams {
                    text_document_position_params: position_params(&uri, position),
                    work_done_progress_params: Default::default(),
                })
                .await;
        }
    });
}

#[test]
fn toml_1_1_document_with_schema() {
    run(async {
        let uri: Url = "untitled:toml-1-1.toml".parse().unwrap();
        let mut server = TestServer::new().await;
        server.associate_schema(toml_1_1_schema()).await;
        server.open(&uri, TOML_1_1_DOCUMENT).await;

        assert_eq!(server.diagnostics(&uri), Vec::new());

        let hover = server
            .request::<HoverRequest>(HoverParams {
                text_document_position_params: position_params(
                    &uri,
                    position_of(TOML_1_1_DOCUMENT, "y = 2"),
                ),
                work_done_progress_params: Default::default(),
            })
            .await;
        assert!(hover_text(hover).contains("The y coordinate."));

        // Completion on an empty line in a multi-line inline table
        // offers the keys of that table.
        let text = TOML_1_1_DOCUMENT.replace("    y = 2,\n", "    y = 2,\n    \n");
        let uri_completion: Url = "untitled:toml-1-1-completion.toml".parse().unwrap();
        server.open(&uri_completion, &text).await;
        let mut position = position_of(&text, "    y = 2,");
        position.line += 1;
        position.character = 4;
        let completion = server
            .request::<Completion>(CompletionParams {
                text_document_position: position_params(&uri_completion, position),
                work_done_progress_params: Default::default(),
                partial_result_params: Default::default(),
                context: None,
            })
            .await;
        assert_eq!(completion_labels(completion), ["z"]);

        for position in all_positions(TOML_1_1_DOCUMENT) {
            server
                .request::<HoverRequest>(HoverParams {
                    text_document_position_params: position_params(&uri, position),
                    work_done_progress_params: Default::default(),
                })
                .await;
            server
                .request::<Completion>(CompletionParams {
                    text_document_position: position_params(&uri, position),
                    work_done_progress_params: Default::default(),
                    partial_result_params: Default::default(),
                    context: None,
                })
                .await;
        }
    });
}

#[test]
fn toml_1_1_schema_errors_in_multi_line_inline_table() {
    run(async {
        let uri: Url = "untitled:toml-1-1-invalid.toml".parse().unwrap();
        let text = TOML_1_1_DOCUMENT.replace("y = 2,", "y = \"two\", # not an integer");
        let mut server = TestServer::new().await;
        server.associate_schema(toml_1_1_schema()).await;
        server.open(&uri, &text).await;

        let diagnostics = server.diagnostics(&uri);
        assert_eq!(diagnostics.len(), 1, "{diagnostics:#?}");
        assert_eq!(diagnostics[0].range.start, position_of(&text, "\"two\""));
    });
}
