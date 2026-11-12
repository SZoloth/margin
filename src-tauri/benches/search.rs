use criterion::{black_box, criterion_group, criterion_main, Criterion};
use margin_lib::commands::search::{
    extract_file_snippet, index_document_inner, sanitize_fts_query, search_documents_inner,
};
use rusqlite::Connection;
use std::io::Write;

fn seed_corpus(conn: &Connection, count: usize) {
    for i in 0..count {
        let id = format!("doc-{i}");
        let title = format!("Document {i}: Testing search performance");
        let content = format!(
            "This is document number {i}. It contains text about writing quality, \
             annotation systems, and editorial judgment. The purpose is to test \
             full-text search indexing and retrieval across a corpus of {} documents. \
             Keywords: margin, highlight, correction, rule, enforcement, synthesis.",
            count
        );
        index_document_inner(conn, &id, &title, &content).unwrap();
    }
}

fn bench_sanitize_fts_query(c: &mut Criterion) {
    c.bench_function("sanitize_fts_query/simple", |b| {
        b.iter(|| sanitize_fts_query(black_box("hello world")))
    });
    c.bench_function("sanitize_fts_query/operators", |b| {
        b.iter(|| sanitize_fts_query(black_box("hello OR world NOT \"test\" (group)")))
    });
    c.bench_function("sanitize_fts_query/long", |b| {
        let q = "writing quality annotation ".repeat(20);
        b.iter(|| sanitize_fts_query(black_box(&q)))
    });
}

fn bench_search_documents(c: &mut Criterion) {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA journal_mode=WAL;").unwrap();
    seed_corpus(&conn, 100);

    c.bench_function("search_documents/single_term_100docs", |b| {
        b.iter(|| search_documents_inner(black_box(&conn), black_box("writing"), 20))
    });

    c.bench_function("search_documents/multi_term_100docs", |b| {
        b.iter(|| {
            search_documents_inner(black_box(&conn), black_box("writing quality annotation"), 20)
        })
    });

    c.bench_function("search_documents/prefix_100docs", |b| {
        b.iter(|| search_documents_inner(black_box(&conn), black_box("wri"), 20))
    });

    c.bench_function("search_documents/no_match_100docs", |b| {
        b.iter(|| search_documents_inner(black_box(&conn), black_box("zzzznonexistent"), 20))
    });

    // Larger corpus
    let conn_large = Connection::open_in_memory().unwrap();
    conn_large.execute_batch("PRAGMA journal_mode=WAL;").unwrap();
    seed_corpus(&conn_large, 1000);

    c.bench_function("search_documents/single_term_1000docs", |b| {
        b.iter(|| search_documents_inner(black_box(&conn_large), black_box("writing"), 20))
    });
}

fn bench_extract_file_snippet(c: &mut Criterion) {
    // Small file
    let mut small = tempfile::NamedTempFile::new().unwrap();
    writeln!(small, "# My Document\n\nFirst paragraph of content here.").unwrap();
    let small_path = small.path().to_str().unwrap().to_string();

    // Large file (1MB)
    let mut large = tempfile::NamedTempFile::new().unwrap();
    writeln!(large, "# Large Document Title").unwrap();
    for i in 0..10_000 {
        writeln!(large, "Line {i}: Lorem ipsum dolor sit amet, consectetur adipiscing elit.").unwrap();
    }
    let large_path = large.path().to_str().unwrap().to_string();

    // File with blank lines at top
    let mut blanks = tempfile::NamedTempFile::new().unwrap();
    for _ in 0..15 {
        writeln!(blanks).unwrap();
    }
    writeln!(blanks, "Finally some content after blank lines.").unwrap();
    let blanks_path = blanks.path().to_str().unwrap().to_string();

    c.bench_function("extract_file_snippet/small_file", |b| {
        b.iter(|| extract_file_snippet(black_box(&small_path)))
    });

    c.bench_function("extract_file_snippet/large_file", |b| {
        b.iter(|| extract_file_snippet(black_box(&large_path)))
    });

    c.bench_function("extract_file_snippet/blank_lines_then_content", |b| {
        b.iter(|| extract_file_snippet(black_box(&blanks_path)))
    });
}

criterion_group!(
    benches,
    bench_sanitize_fts_query,
    bench_search_documents,
    bench_extract_file_snippet,
);
criterion_main!(benches);
