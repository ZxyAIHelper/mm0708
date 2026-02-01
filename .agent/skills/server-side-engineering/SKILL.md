---
name: server-side-engineering
description: MANDATORY Guidelines for server-side development. You MUST follow these rules when writing service code, performing DB operations, or deploying.
---

# Server-Side Engineering Skills

> **⚠️ CRITICAL**: This is a **MANDATORY** guideline. You must explicitly reference and follow these rules whenever you write server-side code, design database schemas, or plan deployments.

## Service Code & Architecture

### Layered Architecture
Organize code into distinct layers to separate concerns:
1.  **Interface Layer (Controllers/Routes)**: Handle incoming HTTP requests, validate input, and format responses. *No business logic here.*
2.  **Service Layer (Business Logic)**: Implement core business rules, workflows, and integrations. *Framework agnostic where possible.*
3.  **Data Access Layer (Repository/DAO)**: Direct interaction with the database. *Hide raw SQL/queries here.*

### Error Handling
- **Centralized Handling**: Use global error handling middleware to catch exceptions.
- **Structured Errors**: Return consistent error responses (e.g., standard HTTP status codes, error codes, and human-readable messages).
- **No Sensitive Info**: Never leak stack traces or internal paths to the client in production.

### Logging
- **Structured Logging**: Use JSON format for logs (e.g., `{"level": "info", "requestId": "...", "message": "..."}`) for easy parsing.
- **Contextual**: distinct request IDs should thread through all logic to trace specific requests.
- **Levels**: Use appropriate levels (DEBUG, INFO, WARN, ERROR).

## Database Operations

### Migrations (Strict)
- **NO DELETE/DROP**: **NEVER** delete the database or drop tables containing data to apply schema changes. Data loss is unacceptable.
- **Incremental Upgrades**: ALL changes must be implemented as incremental migration scripts (e.g., `ALTER TABLE server_side_engineering ADD COLUMN ...`).
- **Version Control**: Manage all schema changes via migration tools (e.g., Drizzle Kit, Prisma Migrate).
- **Idempotency**: Migrations should be repeatable without side effects.
- **Backwards Compatibility**: Non-destructive changes first; destructive changes (drops) only after code updates have been deployed and verified.

### Performance
- **Indexing**: Always index columns used in `WHERE`, `JOIN`, and `ORDER BY` clauses.
- **N+1 Problem**: Use `JOIN`s or batch fetching (e.g., `dataloader`) instead of executing queries in loops.
- **Connection Pooling**: Use a connection pool to manage database connections efficiently, especially in serverless environments (e.g., verify pool size limits).

### Security
- **Parameterization**: ALWAYS use parameterized queries or an ORM to prevent SQL Injection.
- **Least Privilege**: Application database users should only have permissions necessary for their function (e.g., no `DROP TABLE` rights).

## Deployment & DevOps

### Configuration
- **Environment Variables**: Store config in environment variables (e.g., `DATABASE_URL`, `API_KEY`). **NEVER** commit `.env` files.
- **Validation**: Validate startup configuration (e.g., check if required vars exist) before the server starts accepting traffic.

### Reliability
- **Health Checks**: Implement `/health` and `/ready` endpoints for load balancers.
- **Graceful Shutdown**: Handle `SIGTERM`/`SIGINT` to close connections and finish in-flight requests before exiting.

### CI/CD Pipeline
- **Automated Testing**: Run Unit and Integration tests on every PR.
- **Linting & Formatting**: Enforce code style automatically.
- **Immutable Artifacts**: Build once, deploy anywhere (e.g., Docker images).

## Security Best Practices (OWASP)

- **Input Validation**: Validate ALL input (query params, body, headers) using a schema library (e.g., Zod, Joi).
- **Authentication**: Use standard protocols (OAuth2, OIDC, JWT). prefer short-lived access tokens.
- **Authorization**: Implement Role-Based Access Control (RBAC) or Attribute-Based Access Control (ABAC). Check permissions on *every* resource access.
- **Rate Limiting**: Protect APIs from abuse by limiting requests per IP/User.
