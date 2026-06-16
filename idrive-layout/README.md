# IDrive e2 Layout

This folder mirrors the planned IDrive e2 object layout for smejj.com.

- `objects/sha256/`: immutable content-addressed objects.
- `manifests/`: small mutable control files.
- `checksums/`: checksum lists and verification outputs.
- `indexes/`: search and RAG index shards.
- `rag/`: document chunks, embeddings and retrieval manifests.

Git tracks only the layout examples and small manifests. Real user files,
models, media, backups, deployments and central data belong in IDrive e2, not
GitHub.

Do not commit secrets, model weights, large media, private local machine paths,
real user data, production checksums, production manifests or deployment
archives here. Browser code must never receive IDrive e2 secrets; it may only
use short-lived presigned URLs created by the fail-closed gatekeeper.

All paths in this folder must be relative object-layout examples. If a path
contains a local user directory or private machine path, replace it before
commit.
