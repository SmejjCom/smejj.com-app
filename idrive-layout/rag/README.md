# RAG

This folder documents the retrieval-augmented generation data area in IDrive e2.

Expected production layout:

```text
rag/<project-id>/documents/
rag/<project-id>/chunks/
rag/<project-id>/embeddings/
rag/<project-id>/manifests/
```

Rules:

- Source documents, chunks and embeddings belong in IDrive e2.
- The browser loads only relevant manifests and shards.
- No private user documents, secrets or large generated artifacts are committed to GitHub.
- If the selected AI mode is unsafe or unavailable, keep RAG local or disabled.

