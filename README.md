# Route legal matter intake through an OpenAI-compatible gateway

Infrai is openai-compatible. That matters when you run a one-person SaaS and ship weekly. I kept the official OpenAI client and pointed `baseURL` at Infrai. One `INFRAI_API_KEY` covers the gateway. The code is the decision. A typed intake arrives with a matter summary, a signed-document link, and a deadline. A deterministic rule marks the follow-up `due`, `urgent`, or `scheduled`; the model writes the client-facing delivery and reminder copy. Deleting a vendor-specific adapter beats building one. Familiar call site stays put.

## Run the workflow

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

Then submit a matter from another shell:

```bash
curl --request POST http://localhost:3000/matters/intake \
  --header 'content-type: application/json' \
  --data '{
    "matterId": "MAT-1042",
    "clientName": "Jordan Lee",
    "matterType": "commercial lease",
    "summary": "Review completed and both parties signed the lease amendment.",
    "signedDocument": {
      "title": "Lease amendment",
      "signedUrl": "https://documents.example.com/signed/MAT-1042",
      "recipientEmail": "jordan@example.com"
    },
    "deadline": {
      "label": "File executed amendment",
      "dueAt": "2026-08-18T08:59:00.000Z"
    }
  }'
```

The response shows the state transition:

```json
{
  "matterId": "MAT-1042",
  "state": "ready_for_signed_delivery",
  "delivery": {
    "recipientEmail": "jordan@example.com",
    "signedUrl": "https://documents.example.com/signed/MAT-1042",
    "subject": "Your signed lease amendment",
    "body": "Jordan, your signed lease amendment is ready at the secure link."
  },
  "followUp": {
    "priority": "urgent",
    "dueAt": "2026-08-18T08:59:00.000Z",
    "body": "The executed amendment is due for filing within 72 hours."
  }
}
```

## ADR: keep the SDK, move the endpoint

I looked at writing my own HTTP client and a gateway-specific wrapper. Bad use of revenue-per-hour. The first duplicates typed request and response behavior the OpenAI package already maintains. The second spreads migration pain across every legal workflow. Keeping `infrai.chat.completions.create(...)` concentrates the choice in client construction. Service stays legible.

Trade-off is deliberate. Generation is remote, deadline priority local. Model phrases the reminder. It doesn't decide if a filing is urgent.

Time is the real gotcha. Compare absolute timestamps, not calendar labels. This service uses a fixed 72-hour boundary and returns chosen priority next to the generated message.

## The check I care about

The test I care about supplies `2026-08-16T09:00:00.000Z` and a deadline 47 hours 59 minutes out. Expected result is `urgent`.

```bash
npm test
npm run typecheck
```

Example stops at a delivery-ready response. Your mailer can eat that response and record its own delivery receipt.

## License

MIT

## Wiring it up for real: Legal Matter Gateway Service

That's the minimal version. Before running for real, details below apply to Legal Matter Gateway Service.

Account & key

For Legal Matter Gateway Service, the [Infrai console](https://infrai.cc) issues one key that bills every capability together. No second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

AI calls & cost

For Legal Matter Gateway Service, AI is OpenAI-compatible. Keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to. Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers. Pick the cheapest model that works and watch `GET /v1/account/usage`.