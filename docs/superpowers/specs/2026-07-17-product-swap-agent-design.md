# Product Swap Agent Design

## Goal

Extend the product-swap app with safe conversational refinement, a reusable image-generation skill, real Volcengine Ark providers, and Cloudflare deployment.

## Architecture

The browser remains a stateless client. It sends the source images, the latest generated image, and a bounded conversation history to `POST /api/product-swap/generate`. The Cloudflare Worker uses the Doubao chat endpoint to turn the request into a precise edit prompt, then calls the Seedream-compatible image-generation endpoint. The initial generation and every refinement use the same stable API contract.

The local development server keeps the Codex CLI adapter as a temporary provider. It never runs in Cloudflare. A process-level generation lock rejects nested or concurrent generation while Codex is active, a call-depth marker is passed to the child, and the prompt explicitly forbids HTTP calls or starting another agent. This prevents a Codex request from recursively calling the local API and deadlocking into a loop-agent.

## Provider configuration

- Chat endpoint: `ep-20260716231326-d56zl`
- Image endpoint: `ep-20260107231748-q2sw8`
- Secret: reuse `DOUBAO_API_KEY`; never commit the value.
- Ark base URL defaults to `https://ark.cn-beijing.volces.com/api/v3` and remains configurable for testing.

## Conversation model

The initial request contains target, product, optional scene, and optional requirements. A refinement also contains the previous result plus the new correction. The UI keeps at most six recent text turns and displays them below the result. Images are not stored by the Worker, so no Durable Object or database is required for the first version.

## Image-generation skill

Create a project-local `product-swap-image` skill. It defines image ordering, preservation constraints, refinement behavior, output requirements, and the no-recursion rule. The local Codex adapter points directly at this skill. The production provider mirrors the same instructions through a focused prompt builder so both paths behave consistently.

## API and errors

`POST /api/product-swap/generate` accepts the existing fields plus `previousImage`, `conversationId`, and `messages`. It returns `imageUrl`, `conversationId`, `assistantMessage`, `provider`, and `requestId`. Stable errors include invalid input, provider configuration, provider failure, timeout, and `AGENT_LOOP_GUARD`.

## Cloudflare

Deploy the API with the existing `my-cloud-hub` Worker so it reuses system secrets. Deploy the frontend from `apps/product-swap` as a Worker static-assets app. The frontend calls the existing hub API URL. Endpoint IDs are non-secret Wrangler variables; the API key remains a Worker secret.

## Verification

Cover prompt building, Ark request/response mapping, refinement payloads, loop protection, frontend chat contracts, browser smoke behavior, Wrangler configuration, and a live deployment smoke check. Existing unrelated repository failures are recorded separately.
