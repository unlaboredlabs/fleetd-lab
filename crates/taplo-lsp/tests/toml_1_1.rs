//! Language server requests on TOML 1.1 documents.

use futures::{channel::mpsc, SinkExt};
use lsp_async_stub::{rpc::Message, Server};
use lsp_types::{
    notification::{DidOpenTextDocument, Notification, PublishDiagnostics},
    request::{
        Completion, DocumentSymbolRequest, FoldingRangeRequest, HoverRequest, Initialize, Rename,
        Request, SemanticTokensFullRequest,
    },
    CompletionParams, CompletionResponse, DidOpenTextDocumentParams, DocumentSymbol,
    DocumentSymbolParams, DocumentSymbolResponse, FoldingRange, FoldingRangeParams, Hover,
    HoverContents, HoverParams, InitializeParams, NumberOrString, Position,
    PublishDiagnosticsParams, RenameParams, SemanticTokensParams, SemanticTokensResult,
    TextDocumentIdentifier, TextDocumentItem, TextDocumentPositionParams, Url,
};
use serde_json::{json, Value};
use taplo_common::environment::native::NativeEnvironment;
use taplo_lsp::{
    lsp_ext::request::{
        ConvertToJsonParams, ConvertToJsonRequest, ConvertToTomlParams, ConvertToTomlRequest,
    },
    world::World,
};

const FEATURES: &str = include_str!("../../../test-data/toml-1.1/features.toml");

/// Sends messages to the server directly and collects everything it writes back.
struct Client {
    server: Server<World<NativeEnvironment>>,
    world: World<NativeEnvironment>,
    tx: mpsc::UnboundedSender<Message>,
    rx: mpsc::UnboundedReceiver<Message>,
    next_id: i32,
}

impl Client {
    async fn new() -> Self {
        let (tx, rx) = mpsc::unbounded();
        let mut client = Self {
            server: taplo_lsp::create_server(),
            world: taplo_lsp::create_world(NativeEnvironment::new()),
            tx,
            rx,
            next_id: 0,
        };

        // No workspace folders and no `initialized` notification,
        // so the server does not load any configuration or schema catalogs.
        client
            .request::<Initialize>(InitializeParams::default())
            .await;

        client
    }

    async fn send(&mut self, method: &str, id: Option<i32>, params: Value) -> Vec<Message> {
        let message = Message {
            jsonrpc: "2.0".into(),
            method: Some(method.into()),
            id: id.map(NumberOrString::Number),
            params: Some(params),
            result: None,
            error: None,
        };

        self.server
            .handle_message(
                self.world.clone(),
                message,
                self.tx
                    .clone()
                    .sink_map_err(|err| -> std::io::Error { panic!("{err}") }),
            )
            .await
            .unwrap();

        let mut messages = Vec::new();
        while let Ok(Some(message)) = self.rx.try_next() {
            messages.push(message);
        }
        messages
    }

    async fn request<R: Request>(&mut self, params: R::Params) -> R::Result {
        self.next_id += 1;
        let id = self.next_id;

        let response = self
            .send(R::METHOD, Some(id), serde_json::to_value(params).unwrap())
            .await
            .into_iter()
            .find(|m| m.id == Some(NumberOrString::Number(id)))
            .unwrap();

        if let Some(error) = response.error {
            panic!("{}: {error:?}", R::METHOD);
        }

        serde_json::from_value(response.result.unwrap_or_default()).unwrap()
    }

    /// Opens the document and returns the published diagnostics.
    async fn open(&mut self, text: &str) -> Vec<PublishDiagnosticsParams> {
        self.send(
            DidOpenTextDocument::METHOD,
            None,
            serde_json::to_value(DidOpenTextDocumentParams {
                text_document: TextDocumentItem {
                    uri: doc_url(),
                    language_id: "toml".into(),
                    version: 1,
                    text: text.into(),
                },
            })
            .unwrap(),
        )
        .await
        .into_iter()
        .filter(|m| m.method.as_deref() == Some(PublishDiagnostics::METHOD))
        .map(|m| serde_json::from_value(m.params.unwrap()).unwrap())
        .collect()
    }
}

/// Not a file URL, so that the document is not excluded by the
/// (unloaded) configuration of the detached workspace.
fn doc_url() -> Url {
    "untitled:toml-1-1.toml".parse().unwrap()
}

fn doc_position(text: &str, line: u32, character: u32) -> TextDocumentPositionParams {
    assert!(text.lines().nth(line as usize).is_some());
    TextDocumentPositionParams {
        text_document: TextDocumentIdentifier { uri: doc_url() },
        position: Position { line, character },
    }
}

/// The position of the start of the first occurrence of `needle` in `text`.
fn position_of(text: &str, needle: &str) -> Position {
    for (line, s) in text.lines().enumerate() {
        if let Some(character) = s.find(needle) {
            return Position {
                line: line as u32,
                character: character as u32,
            };
        }
    }
    panic!("{needle:?} not found");
}

fn run<F: std::future::Future>(f: F) -> F::Output {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    tokio::task::LocalSet::new().block_on(&rt, f)
}

/// Writes a schema for [`FEATURES`] and returns the document with a schema directive.
fn with_schema(name: &str, text: &str) -> String {
    let dir = std::env::temp_dir().join(format!("taplo-lsp-{name}-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();

    let schema_path = dir.join("schema.json");
    std::fs::write(
        &schema_path,
        json!({
            "type": "object",
            "properties": {
                "offset-date-time": {
                    "type": "string",
                    "format": "date-time",
                    "description": "An offset date-time."
                },
                "server": {
                    "type": "object",
                    "description": "The server.",
                    "properties": {
                        "host": { "type": "string", "description": "The host name." },
                        "ports": { "type": "array", "items": { "type": "integer" } },
                        "timeout": { "type": "integer", "description": "The timeout." },
                        "tls": {
                            "type": "object",
                            "properties": {
                                "cert": { "type": "string", "description": "The certificate." },
                                "key": { "type": "string" },
                                "ca": { "type": "string", "description": "The CA." }
                            },
                            "additionalProperties": false
                        },
                        "hours": {
                            "type": "object",
                            "properties": {
                                "open": { "type": "string", "description": "Opening time." },
                                "close": { "type": "string" },
                                "days": { "type": "array" }
                            }
                        }
                    }
                }
            }
        })
        .to_string(),
    )
    .unwrap();

    format!(
        "#:schema {}\n{text}",
        Url::from_file_path(schema_path).unwrap()
    )
}

#[test]
fn no_diagnostics() {
    run(async {
        let mut client = Client::new().await;

        for text in [FEATURES.to_string(), with_schema("diagnostics", FEATURES)] {
            let diagnostics = client.open(&text).await;
            assert!(!diagnostics.is_empty());
            for d in diagnostics {
                assert!(d.diagnostics.is_empty(), "{:#?}", d.diagnostics);
            }
        }
    });
}

#[test]
fn schema_diagnostics_in_multi_line_inline_tables() {
    run(async {
        let mut client = Client::new().await;

        let text = with_schema(
            "schema-diagnostics",
            &FEATURES.replace(
                r#"key = "key.pem","#,
                "key = \"key.pem\",\n    password = \"x\",",
            ),
        );

        let diagnostics: Vec<_> = client
            .open(&text)
            .await
            .into_iter()
            .flat_map(|d| d.diagnostics)
            .collect();

        assert_eq!(diagnostics.len(), 1, "{diagnostics:#?}");
        assert!(diagnostics[0].message.contains("'password' was unexpected"));
        assert_eq!(diagnostics[0].range.start, position_of(&text, r#""x""#));
    });
}

#[test]
fn document_symbols() {
    run(async {
        let mut client = Client::new().await;
        client.open(FEATURES).await;

        let Some(DocumentSymbolResponse::Nested(symbols)) = client
            .request::<DocumentSymbolRequest>(DocumentSymbolParams {
                text_document: TextDocumentIdentifier { uri: doc_url() },
                work_done_progress_params: Default::default(),
                partial_result_params: Default::default(),
            })
            .await
        else {
            panic!("expected nested symbols");
        };

        fn names(symbols: &[DocumentSymbol]) -> Vec<&str> {
            symbols.iter().map(|s| s.name.as_str()).collect()
        }

        fn child<'s>(symbols: &'s [DocumentSymbol], name: &str) -> &'s [DocumentSymbol] {
            symbols
                .iter()
                .find(|s| s.name == name)
                .unwrap()
                .children
                .as_deref()
                .unwrap_or_default()
        }

        assert_eq!(
            names(&symbols),
            [
                "esc",
                "hex",
                "multi-line-hex",
                "time",
                "local-date-time",
                "offset-date-time",
                "negative-offset",
                "trailing-comma",
                "server",
                "table"
            ]
        );
        assert_eq!(names(child(&symbols, "trailing-comma")), ["a"]);

        let server = child(&symbols, "server");
        assert_eq!(names(server), ["host", "ports", "tls", "hours"]);
        assert_eq!(names(child(server, "tls")), ["cert", "key"]);
        assert_eq!(names(child(server, "hours")), ["open", "close"]);

        let server_symbol = symbols.iter().find(|s| s.name == "server").unwrap();
        let server = position_of(FEATURES, "server = {");
        assert_eq!(
            server_symbol.range.start,
            Position {
                line: server.line,
                character: server.character + 9
            }
        );
        assert_eq!(
            server_symbol.range.end.line,
            position_of(FEATURES, "[table]").line - 2
        );
    });
}

#[test]
fn folding_ranges() {
    run(async {
        let mut client = Client::new().await;
        client.open(FEATURES).await;

        let ranges = client
            .request::<FoldingRangeRequest>(FoldingRangeParams {
                text_document: TextDocumentIdentifier { uri: doc_url() },
                work_done_progress_params: Default::default(),
                partial_result_params: Default::default(),
            })
            .await
            .unwrap();

        let has_range = |start: Position, end_line: u32| {
            ranges.iter().any(|r: &FoldingRange| {
                r.start_line == start.line
                    && r.start_character == Some(start.character)
                    && r.end_line == end_line
            })
        };

        // Multi-line inline tables are folded like multi-line arrays.
        let server = position_of(FEATURES, "server = {");
        assert!(has_range(
            Position {
                line: server.line,
                character: server.character + 9
            },
            position_of(FEATURES, "[table]").line - 2,
        ));

        let tls = position_of(FEATURES, "tls = {");
        assert!(has_range(
            Position {
                line: tls.line,
                character: tls.character + 6
            },
            tls.line + 3,
        ));

        let ports = position_of(FEATURES, "ports = [");
        assert!(has_range(
            Position {
                line: ports.line,
                character: ports.character + 8
            },
            ports.line + 3,
        ));

        let inline = position_of(FEATURES, "inline = {");
        assert!(has_range(
            Position {
                line: inline.line,
                character: 9
            },
            inline.line + 3,
        ));

        // Single-line inline tables are not folded.
        let hours = position_of(FEATURES, "hours = {");
        assert!(!ranges.iter().any(|r| r.start_line == hours.line));
    });
}

#[test]
fn semantic_tokens() {
    run(async {
        let mut client = Client::new().await;
        client.open(FEATURES).await;

        let Some(SemanticTokensResult::Tokens(tokens)) = client
            .request::<SemanticTokensFullRequest>(SemanticTokensParams {
                text_document: TextDocumentIdentifier { uri: doc_url() },
                work_done_progress_params: Default::default(),
                partial_result_params: Default::default(),
            })
            .await
        else {
            panic!("expected semantic tokens");
        };

        let mut line = 0;
        let mut character = 0;
        let mut decoded = Vec::new();

        for token in tokens.data {
            if token.delta_line > 0 {
                character = 0;
            }
            line += token.delta_line;
            character += token.delta_start;

            let text = &FEATURES.lines().nth(line as usize).unwrap()
                [character as usize..(character + token.length) as usize];
            let ty = ["tomlArrayKey", "tomlTableKey"][token.token_type as usize];
            decoded.push((text, ty));
        }

        assert_eq!(
            decoded,
            [
                ("trailing-comma", "tomlTableKey"),
                ("server", "tomlTableKey"),
                ("ports", "tomlArrayKey"),
                ("tls", "tomlTableKey"),
                ("hours", "tomlTableKey"),
                ("inline", "tomlTableKey"),
                ("b", "tomlTableKey"),
            ]
        );
    });
}

#[test]
fn hover() {
    run(async {
        let mut client = Client::new().await;
        let text = with_schema("hover", FEATURES);
        client.open(&text).await;

        async fn hover(client: &mut Client, text: &str, needle: &str) -> String {
            let position = position_of(text, needle);
            let hover = client
                .request::<HoverRequest>(HoverParams {
                    text_document_position_params: doc_position(
                        text,
                        position.line,
                        position.character + 1,
                    ),
                    work_done_progress_params: Default::default(),
                })
                .await;

            match hover {
                Some(Hover {
                    contents: HoverContents::Markup(m),
                    ..
                }) => m.value,
                other => panic!("{needle}: {other:?}"),
            }
        }

        for (needle, docs) in [
            ("1979-05-27 07:32Z", "An offset date-time."),
            ("server = {", "The server."),
            ("host", "The host name."),
            (r#""localhost""#, "The host name."),
            ("cert", "The certificate."),
            ("open", "Opening time."),
            ("08:00", "Opening time."),
        ] {
            let hover = hover(&mut client, &text, needle).await;
            assert!(hover.contains(docs), "{needle}: {hover}");
        }
    });
}

#[test]
fn completion() {
    run(async {
        let mut client = Client::new().await;

        // Empty lines in multi-line inline tables.
        let text = with_schema(
            "completion",
            &FEATURES
                .replace("  ports = [", "\n  ports = [")
                .replace(r#"    key = "key.pem","#, "    key = \"key.pem\",\n\n"),
        );
        client.open(&text).await;

        async fn complete(
            client: &mut Client,
            text: &str,
            line: u32,
            character: u32,
        ) -> Vec<String> {
            let response = client
                .request::<Completion>(CompletionParams {
                    text_document_position: doc_position(text, line, character),
                    work_done_progress_params: Default::default(),
                    partial_result_params: Default::default(),
                    context: None,
                })
                .await;

            let Some(CompletionResponse::Array(items)) = response else {
                panic!("{response:?}");
            };
            let mut labels: Vec<_> = items.into_iter().map(|i| i.label).collect();
            labels.sort();
            labels
        }

        let server_line = position_of(&text, "  ports = [").line - 1;
        assert_eq!(text.lines().nth(server_line as usize), Some(""));
        assert_eq!(
            complete(&mut client, &text, server_line, 0).await,
            ["hours.days", "timeout", "tls.ca"]
        );

        let tls_line = position_of(&text, r#"key = "key.pem""#).line + 1;
        assert_eq!(text.lines().nth(tls_line as usize), Some(""));
        assert_eq!(complete(&mut client, &text, tls_line, 0).await, ["ca"]);

        // Inside a single-line inline table.
        let hours = position_of(&text, "close = 17:30");
        assert_eq!(
            complete(&mut client, &text, hours.line, hours.character - 1).await,
            ["days"]
        );

        // Outside of the inline tables.
        let root_line = position_of(&text, "server = {").line - 1;
        assert_eq!(text.lines().nth(root_line as usize), Some(""));
        assert_eq!(
            complete(&mut client, &text, root_line, 0).await,
            ["server.hours.days", "server.timeout", "server.tls.ca"]
        );
    });
}

#[test]
fn rename_in_multi_line_inline_table() {
    run(async {
        let mut client = Client::new().await;
        client.open(FEATURES).await;

        let mut position = position_of(FEATURES, "cert");
        position.character += 1;

        let edit = client
            .request::<Rename>(RenameParams {
                text_document_position: doc_position(FEATURES, position.line, position.character),
                new_name: "certificate".into(),
                work_done_progress_params: Default::default(),
            })
            .await
            .unwrap();

        let edits = &edit.changes.unwrap()[&doc_url()];
        assert_eq!(edits.len(), 1);
        assert_eq!(edits[0].new_text, "certificate");
        assert_eq!(edits[0].range.start, position_of(FEATURES, "cert"));
        assert_eq!(
            edits[0].range.end.character,
            edits[0].range.start.character + 4
        );
    });
}

#[test]
fn conversion() {
    run(async {
        let mut client = Client::new().await;

        let json = client
            .request::<ConvertToJsonRequest>(ConvertToJsonParams {
                text: FEATURES.into(),
            })
            .await
            .text
            .unwrap();
        let value: Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["time"], "13:37:00");
        assert_eq!(value["offset-date-time"], "1979-05-27T07:32:00Z");
        assert_eq!(value["esc"], "\u{1b}[1mbold\u{1b}[0m");
        assert_eq!(value["server"]["tls"]["cert"], "cert.pem");

        let toml = client
            .request::<ConvertToTomlRequest>(ConvertToTomlParams { text: json.clone() })
            .await
            .text
            .unwrap();
        let back = client
            .request::<ConvertToJsonRequest>(ConvertToJsonParams { text: toml.clone() })
            .await
            .text
            .unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&back).unwrap(),
            value,
            "{toml}"
        );
    });
}
