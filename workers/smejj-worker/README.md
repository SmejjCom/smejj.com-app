# smejj.com Coding Worker

Stateless CPU worker for the autonomous coding loop.

The worker:

- validates a short-lived job token against the Control Server
- clones one GitHub repository into an ephemeral workspace
- asks GLM-5.2 for one structured tool call per iteration
- reads and writes only safe repository-relative files
- runs allowlisted build, typecheck, lint, test and security checks
- returns a unified diff, verification evidence and rollback data
- creates a draft pull request only after explicit human approval
- removes the complete workspace after every request

It never merges to `main`, never exposes model or Git credentials to repository
processes, and never stores durable state on the Salad worker.
