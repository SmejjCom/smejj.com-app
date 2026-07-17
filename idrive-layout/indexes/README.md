# Indexes

This folder documents the search and retrieval index area in IDrive e2.

Expected production layout:

```text
indexes/<project-id>/search-index.json
indexes/<project-id>/chunks.jsonl
indexes/<project-id>/bm25.json
indexes/<project-id>/embeddings.parquet
```

Rules:

- Store production index shards in IDrive e2.
- Keep browser downloads shard-based and cacheable.
- Do not commit production indexes, embeddings or private documents to GitHub.
- If an index is missing or stale, fall back to local search or disabled mode.

