# Checksums

This folder documents the checksum area in IDrive e2.

Store production checksum lists in IDrive e2, not in GitHub. This repo may only
contain small examples and documentation.

Rules:

- Use SHA256 for immutable objects and deployment artifacts.
- Keep checksum paths relative to the IDrive e2 object layout.
- Do not commit production checksum inventories, secrets or private paths.
- If a checksum is missing or does not match, fail closed and do not release.

