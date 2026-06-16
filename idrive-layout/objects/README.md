# Objects

This folder documents the content-addressed object area in IDrive e2.

Expected production layout:

```text
objects/sha256/<first-two-hex>/<full-sha256>
```

Rules:

- Objects are immutable.
- Large files, model weights, media, backups and deployment artifacts live in IDrive e2.
- GitHub only keeps this small layout example.
- Do not commit real objects, secrets, model weights or large binary files.

