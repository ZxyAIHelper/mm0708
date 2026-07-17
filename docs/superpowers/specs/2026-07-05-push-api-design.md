# Push API Design

## Goal

Add a single Cloudflare Worker API in `apps/my-cloud-hub` that supports:

- sending messages to an Enterprise WeCom group robot webhook
- sending WeChat template messages to an individual recipient

The API should be simple enough for a daily agent job to call directly.

## Route

`POST /api/push/send`

Request body supports two modes:

### WeCom webhook

```json
{
  "type": "wecom-webhook",
  "webhookUrl": "optional explicit webhook",
  "msgtype": "text",
  "content": "plain text message"
}
```

or

```json
{
  "type": "wecom-webhook",
  "msgtype": "markdown",
  "content": "## Daily Report\n- item 1"
}
```

If `webhookUrl` is omitted, the route reads `wecom_webhook_url` from the existing D1 config table.

### WeChat template message

```json
{
  "type": "wechat-template",
  "openid": "recipient openid",
  "templateId": "template id",
  "url": "optional jump url",
  "data": {
    "first": { "value": "hello" },
    "remark": { "value": "done" }
  }
}
```

The worker uses `WECHAT_TEMPLATE_APPID` and `WECHAT_TEMPLATE_SECRET` if configured, otherwise falls back to `WECHAT_APPID` and `WECHAT_SECRET`.

## Response

Success:

```json
{
  "success": true,
  "channel": "wecom-webhook"
}
```

Failure:

```json
{
  "error": "message"
}
```

## Implementation shape

- Route layer: parse request and return HTTP errors
- Utility layer: send WeCom webhook messages and WeChat template messages
- Existing `wechat.ts` becomes the WeChat token and template-send utility
- Existing email monitor flow can reuse the new WeCom sender helper

## Validation

- reject unknown `type`
- reject missing `content` for webhook mode
- reject missing `openid`, `templateId`, or `data` for template mode
- reject webhook mode when no explicit or stored webhook is available
- surface upstream API failures in JSON responses

## Verification

- route test for WeCom webhook mode with inline webhook
- route test for WeCom webhook mode using stored D1 config
- route test for WeChat template mode with mocked token and send calls
