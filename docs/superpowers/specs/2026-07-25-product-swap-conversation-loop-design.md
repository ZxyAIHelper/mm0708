# Product Swap Conversation Loop Design

## Goal

Turn the production Volcengine product-swap pipeline into a bounded
conversation loop. Each user generation request is one conversation turn.
Within that turn, the Worker may generate, visually review, and repair the
image before returning the best candidate. Follow-up instructions continue
the same browser-local session without drifting away from the original
template or product identity.

## Scope

This design changes the production path in `apps/my-cloud-hub` and the
browser session handling in `apps/product-swap`.

It does not:

- turn the local Codex CLI adapter into the production provider;
- add cross-device sessions or server-side conversation storage;
- retain rejected candidate images after a turn;
- allow an unbounded autonomous agent loop.

## Architecture

The browser owns a compact session state in IndexedDB. Every request sends
that state, the source images, the last accepted image, and the user's newest
instruction to the Cloudflare Worker.

The Worker executes a bounded state machine:

1. The Doubao orchestrator interprets the new instruction, resolves it
   against the current session, and produces a generation plan and explicit
   acceptance criteria.
2. Seedream generates one candidate image.
3. A vision-capable Doubao reviewer compares the candidate with the source
   images and the acceptance criteria.
4. If the candidate passes, the turn ends early.
5. If it fails and attempts remain, the reviewer produces a delta-only
   repair prompt. Seedream edits the current best candidate and the reviewer
   checks the new result.
6. The Worker returns the highest-scoring successful candidate when the
   reviewer passes or the attempt limit is reached.

The default is two image-generation attempts. The request may select one,
two, or three attempts. The server always clamps the value to a maximum of
three.

## Provider configuration

Add a vision-capable `DOUBAO_AGENT_ENDPOINT` for both planning and visual
review. `DOUBAO_CHAT_ENDPOINT` may remain as a compatibility fallback only
when that endpoint is verified to accept image inputs.

Keep the existing settings:

- `DOUBAO_API_KEY`
- `DOUBAO_PRODUCT_SWAP_ENDPOINT_ID`
- `DOUBAO_IMAGE_ENDPOINT_ID`
- `DOUBAO_ARK_BASE_URL`

Add:

- `PRODUCT_SWAP_DEFAULT_ATTEMPTS`, default `2`
- `PRODUCT_SWAP_MAX_ATTEMPTS`, fixed or configured no higher than `3`

The Ark Chat API supports multimodal messages containing image URLs, and the
Ark Image Generations API supports multiple image inputs:

- https://api.volcengine.com/api-docs/view?action=ChatCompletions&serviceCode=ark&version=2024-01-01
- https://api.volcengine.com/api-docs/view?action=ImageGenerations&serviceCode=ark&version=2024-01-01

## Session model

The browser stores a versioned structure:

```ts
type ProductSwapSession = {
    version: 1
    conversationId: string
    revision: number
    anchors: {
        template: string
        productIdentity: string
        scene: string
        immutableRules: string[]
    }
    activeRequirements: string[]
    negativeConstraints: string[]
    lastResult: {
        summary: string
        score: number
        remainingIssues: string[]
    } | null
    recentTurns: Array<{
        user: string
        assistant: string
        resultSummary: string
    }>
}
```

The original images remain the authoritative source. Text anchors are a
compact interpretation used to stabilize the conversation, not a
replacement for the images.

Session limits:

- at most 12 active requirements;
- at most 160 characters per requirement;
- at most four recent turns;
- at most 500 characters per recent message field;
- approximately 8 KB maximum serialized session size.

The orchestrator classifies the latest instruction as `append`, `replace`,
`remove`, or `reset`. It updates the effective requirements rather than
accumulating contradictory instructions. A normal follow-up cannot silently
change immutable template and product anchors. Reset creates a new
conversation ID and clears the session while leaving uploaded source assets
available in the UI.

Only the winning image, final review summary, and user-visible exchange are
retained. Rejected candidates are discarded after the request.

## Planner contract

The planner produces validated JSON:

```ts
type PlannerDecision = {
    intent: 'append' | 'replace' | 'remove' | 'reset'
    activeRequirements: string[]
    generationPrompt: string
    acceptanceCriteria: string[]
    sessionSummary: string
    assistantAcknowledgement: string
}
```

The planner receives:

- immutable system rules;
- sanitized session state;
- the newest user instruction;
- the source images and previous accepted image when required for visual
  grounding.

If planner JSON is invalid, the Worker performs one format-repair request.
If it remains invalid, the turn fails before starting a billable image
generation. The Worker validates and clamps every model-produced field.

## Reviewer contract

The reviewer sees the original template, product reference, optional scene,
previous accepted image, current candidate, and acceptance criteria. It
returns validated JSON:

```ts
type ReviewDecision = {
    passed: boolean
    score: number
    criticalFailure: boolean
    issues: string[]
    repairPrompt: string
    resultSummary: string
}
```

The score is clamped to `0..100` with these rubric weights:

- product identity and identifying details: 30;
- template composition, camera, count, and arrangement: 30;
- completion of the current user instruction: 25;
- lighting, perspective, contact edges, and commercial quality: 15.

A candidate passes only when its total score is at least 85 and it has no
critical product-identity, composition, or product-count failure.

The repair prompt describes only the remaining differences. It must preserve
all accepted aspects and must not restate contradictory historical requests.

## Loop behavior

The loop keeps `bestCandidate` and `bestReview`.

For each permitted attempt:

1. Seedream generates or edits a candidate.
2. The reviewer scores the candidate.
3. The candidate replaces `bestCandidate` only if its score is higher.
4. A passing review ends the loop.
5. Otherwise, the next attempt edits `bestCandidate` using the reviewer's
   repair prompt.

Later attempts receive the current best candidate first, followed by the
original template, product reference, and optional scene. Seedream remains
configured for one output image per call.

The internal attempts are not separate user-visible chat messages. One user
message plus the final selected image and assistant response is one
conversation turn.

The maximum model-call budget for the default two-attempt turn is:

- one planning call, plus one optional format-repair call;
- up to two Seedream calls;
- up to two visual-review calls.

Early passing stops the loop and avoids unused calls.

## Module boundaries

Refactor the production implementation into focused modules:

- `router.ts`: request validation and HTTP response mapping;
- `generation-loop.ts`: attempt state machine, best-candidate selection, and
  time budget;
- `session-manager.ts`: session validation, merge, conflict resolution, and
  compaction;
- `doubao-agent.ts`: multimodal planning and review calls plus response
  parsing;
- `volcano-provider.ts`: Seedream image-generation transport;
- `prompt-builder.ts`: immutable planning and review instructions.

The browser extends its existing local task/session persistence instead of
introducing a second storage system.

## API contract

The request extends the current contract:

```ts
{
    conversationId?: string
    sessionState?: ProductSwapSession
    requirements: string
    maxAttempts?: 1 | 2 | 3
    targetImage: string
    productImage?: string
    sceneImage?: string
    previousImage?: string
}
```

Requests without `sessionState` remain valid and start a new session.

The response adds:

```ts
{
    success: true
    conversationId: string
    sessionState: ProductSwapSession
    imageUrl: string
    assistantMessage: string
    provider: 'volcano'
    requestId: string
    attemptCount: number
    review: {
        status: 'passed' | 'max_attempts' | 'unavailable'
        score: number | null
        passed: boolean
        remainingIssues: string[]
    }
}
```

## Failure handling

- Missing vision-capable agent configuration returns
  `AGENT_PROVIDER_NOT_CONFIGURED`; the system must not claim to review an
  image with a text-only model.
- A first Seedream failure fails the turn and leaves the previous session
  unchanged.
- A later Seedream failure returns the best earlier candidate with a
  degradation warning.
- If a candidate exists but visual review fails, return that candidate with
  `review.status = 'unavailable'` and do not spend another image attempt
  blindly.
- If the overall time budget expires after a candidate exists, return the
  best candidate. If no candidate exists, return a timeout response.
- The Worker never performs more than the server-clamped attempt count.
- Failed or interrupted turns do not advance the browser's accepted
  `revision`.

## Browser experience

The UI presents simple progress states:

- understanding the instruction;
- generating version one;
- checking the result;
- optimizing version two or three;
- selecting the best result.

The result shows the selected image, a short assistant response, attempts
completed, and any remaining issues when the cap is reached. The existing
follow-up input continues the session. Add a reset-conversation action and a
small quality selector for one, two, or three attempts, defaulting to two.

Refreshing the same browser restores the accepted session from IndexedDB.
Cross-device recovery is intentionally unsupported.

## Observability and privacy

Structured logs contain only:

- `requestId`;
- `conversationId`;
- session revision;
- attempt number;
- review score and pass state;
- completion or degradation reason;
- provider latency and error class.

Logs must not contain source images, generated image payloads, full prompts,
session text, API credentials, or image URLs.

## Testing

### Unit tests

Cover:

- all four session intents and conflict replacement;
- immutable anchor preservation;
- session field and size limits;
- planner parsing and its single format-repair retry;
- multimodal reviewer message construction;
- review score clamping and critical-failure gating;
- early pass;
- fail-then-pass;
- maximum-attempt selection of the highest score;
- a later lower-scoring image not replacing the best candidate;
- later generation failure returning the earlier candidate;
- review failure degradation;
- the hard three-attempt ceiling.

### API integration tests

Cover:

- backward-compatible session creation;
- conversation ID and revision continuation;
- correct image order in planner, Seedream, and reviewer requests;
- returned session, attempt count, and review summary;
- stable missing-agent configuration errors;
- absence of private prompt and image content in logs and errors.

### Browser tests

Cover:

- first-turn session creation;
- IndexedDB recovery after refresh;
- follow-up submission with the accepted image and session;
- progress state transitions;
- reset behavior;
- quality selection restricted to one, two, or three.

### Live smoke test

Keep real Volcengine calls behind an explicit opt-in environment flag so the
default test suite never incurs model charges.

## Acceptance criteria

1. A first request produces an image and completes a visual review.
2. A follow-up such as “change the plate back to white and darken the
   background” replaces conflicting requirements and appends compatible
   ones.
3. Follow-up generation edits the previous accepted image while continuing
   to ground against the original template and product.
4. A page refresh in the same browser can continue the conversation.
5. A turn never exceeds the selected attempts or the server cap.
6. When the cap is reached, the highest-scoring candidate is returned with
   remaining issues.
7. Rejected candidates and unbounded chat history do not enter long-term
   session state.
8. Production generation continues to use Volcengine Ark and does not invoke
   Codex.
