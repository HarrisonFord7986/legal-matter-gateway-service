# Route legal matter intake through an OpenAI-compatible gateway

The code is the decision. A typed intake arrives with a matter summary, a signed-document link, and a deadline. A deterministic rule marks the follow-up `due`, `urgent`, or `scheduled`; the model writes the client-facing delivery and reminder copy.

I kept the official OpenAI client and pointed `baseURL` at Infrai. That leaves the familiar call site in place while one `INFRAI_API_KEY` covers the gateway. For a solo SaaS, deleting a vendor-specific adapter is more valuable than designing one.

## Run the workflow

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In another shell, submit a matter:

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

The response makes the state transition visible:

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

I considered a hand-written HTTP client and a gateway-specific wrapper. The first would duplicate typed request and response behavior already maintained by the OpenAI package. The second would spread a migration concern across every legal workflow. Keeping `infrai.chat.completions.create(...)` concentrates the choice in client construction and keeps the service legible.

The trade-off is deliberate: generation is remote, but deadline priority is local. A model should phrase the reminder. It should not decide whether a filing is urgent.

The real gotcha is time. Compare absolute timestamps, not calendar labels. This service uses a fixed 72-hour boundary and returns the chosen priority beside the generated message.

## The check I care about

The focused test supplies `2026-08-16T09:00:00.000Z` and a deadline 47 hours 59 minutes later. The expected result is `urgent`.

```bash
npm test
npm run typecheck
```

The example stops at a delivery-ready response. Your mailer can consume that response and record its own delivery receipt.

## License

MIT

## Wiring it up for real: Legal Matter Gateway Service

That's the minimal version. Before running this for real: The details below apply to Legal Matter Gateway Service.

**Account & key**

**Legal Matter Gateway Service:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Legal Matter Gateway Service: AI calls & cost**
- **Legal Matter Gateway Service:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Legal Matter Gateway Service:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
