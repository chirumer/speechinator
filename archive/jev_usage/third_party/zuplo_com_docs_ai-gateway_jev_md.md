# Using Jev

**Jev** is [TypeSafe's](https://typesafe.ai) System One model. It doesn't write
text. You send it a piece of text—the _state_—and a set of typed questions, and
it returns a calibrated answer for each one: a probability, a choice from
options you define, or a score on a scale you define. Adding it as a provider
puts the gateway in front of TypeSafe's API for authentication, model filtering,
usage metering, and cost tracking, on your own TypeSafe account and billing.

Jev differs from every other provider in three ways that change what you type:

- **It has its own endpoint.** Requests go to `/v1/systemone`, not to chat
  completions.
- **Chat clients can't call it.** Every other endpoint refuses a Jev model, and
  the default model list doesn't include it.
- **Only input tokens cost money.** TypeSafe charges $0.042 per million input
  tokens, and output tokens are free.

## What Jev answers

Each request carries a `state` and a set of named `questions`. A question's type
decides the shape of its answer:

| Question type | Asks                                | Answer                                                               |
| ------------- | ----------------------------------- | -------------------------------------------------------------------- |
| `noul`        | A yes-or-no question                | A probability between 0 and 1                                        |
| `choice`      | Which of your options applies       | The chosen option, a probability for each option, and a confidence   |
| `score`       | Where the state falls on your scale | A score on the scale, a probability for each level, and a confidence |

The `state` is text: a string, a JSON object, or an array of text values. Jev
doesn't accept images, audio, or video. TypeSafe's documentation explains
[state](https://docs.typesafe.ai/concepts/state), the
[question types](https://docs.typesafe.ai/primitives), and how to read a
[confidence](https://docs.typesafe.ai/confidence).

## Supported endpoint

A Jev model serves one endpoint:

| Endpoint                                                                  | Jev |
| ------------------------------------------------------------------------- | --- |
| `/v1/systemone`                                                           | ✅  |
| `/v1/chat/completions`, `/v1/responses`, `/v1/messages`, `/v1/embeddings` | ❌  |

The gateway forwards your request body to TypeSafe unchanged, except for the
`model` field, which it replaces with the model ID your provider serves. The
response body comes back unchanged too, including the `model` field, which
reports the versioned model that answered. The `x-typesafe-request-id` header
comes back as well. TypeSafe's own error responses (`401`, `422`, `429`, and
`529`) pass through with TypeSafe's body, so the field a `422` names is the one
to fix.

The refusal works in both directions. A Jev model sent to a chat endpoint
(`/v1/chat/completions`, `/v1/responses`, or `/v1/messages`) returns a `400`
that names the endpoint, and a model from any other provider sent to
`/v1/systemone` returns a `400` that names Jev. `/v1/embeddings` fails
differently: Jev has no embedding models, so the gateway returns a `500` saying
the model `is not included in model selections`.

## Before you begin

You need:

- A TypeSafe account and an API key. Create a key in the
  [TypeSafe console](https://console.typesafe.ai/keys).
- An AI Gateway project in the Zuplo Portal, and an [app](./apps.mdx) to call
  from. The app page shows its API URL, and its API key lives on the app's **API
  Key** tab.

## Add the provider

Adding or editing providers requires the **Edit** permission, granted to Zuplo
account and project **Admins**—see
[Managing Providers](./managing-providers.mdx).

<Stepper>

1. Open
   [**Settings → AI Providers**](https://portal.zuplo.com/+/account/project/ai/settings/data-models)
   in your AI Gateway project in the Zuplo Portal.

1. Click the **Add Provider** button.

1. In the **AI Provider** list, select **Jev**.

1. Review the **Provider Name**, which fills in as `jev`. You can replace it
   with your own name, but only now—the name is permanent after creation, and
   it's the prefix in every model reference.

1. Paste your TypeSafe **API Key**. There's no endpoint or region to enter,
   because TypeSafe is a single global host.

1. Select the models to enable, then click **Create**.

</Stepper>

:::note

Saving provider settings triggers an automatic production deployment of your
gateway, because provider credentials are part of the deployed gateway. The
change is live once the deployment completes.

:::

## Model references

Apps reference models as `providerName/model`, where `providerName` is the name
you gave the provider. The Jev catalog has three models, so a provider named
`jev` can serve:

| Model reference   | What it is                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `jev/jev-latest`  | TypeSafe's most recent stable release, and the default in TypeSafe's SDKs.                                                             |
| `jev/jev-1.13.0`  | A specific release. Pin it when you tune confidence thresholds against one version.                                                    |
| `jev/jev-preview` | TypeSafe's most recent release, official or not. It points to the same model as `jev-latest` until TypeSafe publishes a preview build. |

An alias moves when TypeSafe ships a release, so the answers behind it can
change without a change on your side. The response's `model` field reports the
versioned ID that answered, so you can log which release produced each result.

## Call the model

Send requests to `/v1/systemone` under your app's URL, with the app's API key as
a bearer token. Include the `model` in every request, as `jev/<model>`.

### With TypeSafe's SDK

TypeSafe's JavaScript SDK works against your app. Set `baseURL` to the app URL
**without** `/v1`, because the SDK appends `/v1/systemone` itself. The `apiKey`
is the app's API key, not your TypeSafe key.

```ts
import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient({
  baseURL:
    "https://my-gateway-main-2e18f50.zuplo.app/config_fe0a04972d2848e0a94ae4b8bcd1497e",
  apiKey: process.env.ZUPLO_APP_API_KEY,
  defaultModel: "jev/jev-latest",
});

const response = await client.systemOne({
  state: "Help! My payouts have been failing for 3 days.",
  questions: {
    urgent: noul("Does this convey urgency?"),
    department: choice("Which team should handle this?", {
      billing: "Payments and invoices",
      technical: null,
    }),
    frustration: score("How frustrated is the customer?", [
      "Calm",
      "Frustrated",
      "Very angry",
    ]),
  },
});

console.log(response.answers.department.choice);
```

To use a different model for one call, pass `model: "jev/jev-1.13.0"` to
`systemOne()`.

### With HTTP

```bash
curl https://my-gateway-main-2e18f50.zuplo.app/config_fe0a04972d2848e0a94ae4b8bcd1497e/v1/systemone \
  -H "Authorization: Bearer $ZUPLO_APP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "jev/jev-latest",
    "state": "Help! My payouts have been failing for 3 days.",
    "questions": {
      "urgent": {
        "type": "noul",
        "instructions": "Does this convey urgency?"
      },
      "department": {
        "type": "choice",
        "instructions": "Which team should handle this?",
        "criteria": { "billing": "Payments and invoices", "technical": null }
      },
      "frustration": {
        "type": "score",
        "instructions": "How frustrated is the customer?",
        "criteria": ["Calm", "Frustrated", "Very angry"]
      }
    }
  }'
```

The response is TypeSafe's, unchanged. The values below are illustrative:

```json
{
  "model": "jev-1.13.0",
  "answers": {
    "urgent": { "type": "noul", "noul": 0.95 },
    "department": {
      "type": "choice",
      "choice": "billing",
      "probabilities": { "billing": 0.88, "technical": 0.12 },
      "confidence": 0.81
    },
    "frustration": {
      "type": "score",
      "score": 1.05,
      "legend": { "0": "Calm", "1": "Frustrated", "2": "Very angry" },
      "probabilities": { "0": 0, "1": 0.95, "2": 0.05 },
      "confidence": 0.92
    }
  },
  "usage": { "input_tokens": 296, "output_tokens": 20 }
}
```

### List the Jev models

The default `GET /v1/models` list holds chat models, so it leaves Jev out. To
list your Jev models, send `x-zuplo-models-endpoint: systemone`:

```bash
curl https://my-gateway-main-2e18f50.zuplo.app/config_fe0a04972d2848e0a94ae4b8bcd1497e/v1/models \
  -H "Authorization: Bearer $ZUPLO_APP_API_KEY" \
  -H "x-zuplo-models-endpoint: systemone"
```

The list has one entry for each enabled model, such as `jev/jev-latest`.

## Pricing and budgets

The gateway prices each request from the model catalog at the rate on TypeSafe's
[Models page](https://docs.typesafe.ai/models): $0.042 per million input tokens,
and nothing for output. The response carries `X-Cost-USD` with the cost and
`X-Cost-Source: catalog`, which tells you the figure came from the catalog
rather than from TypeSafe. Each request counts toward token, request, and
spending [budgets](./usage-limits.mdx).

A token budget counts output tokens too, even though they're free, so it's
slightly stricter than your TypeSafe invoice. A spending budget matches it.

When a budget is exhausted, the gateway refuses the request with a `429` before
it calls TypeSafe. A System One request never falls back to another model,
because no chat model can answer a set of typed questions.

TypeSafe's own rate limits apply to your key. A request over a limit returns
TypeSafe's `429` with its `retry-after` header. The Models page lists the
current limits.

## Policies on System One routes

These routes run your app's [policy chain](./policy-chains.mdx) like any other.
What changes is the request body: it's a System One request, not a chat message,
so a policy that reads chat content applies its `onUnknownShape` setting
instead. Each policy's default follows from its job: a guardrail fails closed,
while an observer or an optimization fails open.

| Policy                                                                                                                                                                                       | On System One routes                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Authentication](../policies/ai-gateway-auth-inbound.mdx)                                                                                                                                    | Works. Reads the app key from `Authorization: Bearer`, which is how TypeSafe's SDK sends it.                                                                                                                     |
| [Model Filtering](../policies/ai-gateway-model-filtering-inbound.mdx)                                                                                                                        | Works. Add the Jev models to the allow list. A Jev model outside the list returns `403`, and a listed model from another provider returns `400`.                                                                 |
| [Model Override](../policies/ai-gateway-model-override-inbound.mdx)                                                                                                                          | Works when the configured model is a Jev model. A chat model returns a configuration error that names the option, such as `options.models.completions.force`.                                                    |
| [Metering and budgets](../policies/ai-gateway-metering-inbound.mdx)                                                                                                                          | Works. Counts each request with its tokens and cost. An exhausted budget returns `429`.                                                                                                                          |
| [DLP](../policies/ai-gateway-dlp-inbound.mdx), [Akamai AI Firewall](../policies/ai-gateway-akamai-firewall-inbound.mdx), and [Prompt Injection](../policies/ai-gateway-prompt-injection.mdx) | **Blocks by default.** The policy can't inspect a System One body, so it denies the request with a `400` and the error code `guardrail_uninspectable`. Set `onUnknownShape` to `skip` to forward it uninspected. |
| [Galileo](../policies/ai-gateway-galileo-tracing-inbound.mdx) and [Comet Opik](../policies/ai-gateway-opik-tracing-inbound.mdx) tracing                                                      | **Skipped by default.** The request goes through untraced. Set `onUnknownShape` to `deny` to make a trace a hard requirement.                                                                                    |
| Semantic Cache and Smart Router                                                                                                                                                              | Skipped.                                                                                                                                                                                                         |
| [Fallback Model](./fallback.mdx)                                                                                                                                                             | Doesn't apply. A System One request goes to the one model it names, so a configured backup isn't used.                                                                                                           |

:::tip{title="Give System One its own app"}

An app can serve chat models and Jev side by side, as long as every request
names its model and no policy overrides it. Model Override's `force` replaces
the model in every request, and its `default` and the first entry of a Model
Filtering allow list supply one when a request omits it. Each picks a single
model, which can't be both a chat model and a Jev model. If you use one of them,
give System One its own app.

:::

## Troubleshooting

**A `400` that names a chat endpoint and your Jev provider.** You sent a Jev
model to `/v1/chat/completions`, `/v1/responses`, or `/v1/messages`. Call
`/v1/systemone` instead.

**A `400` saying `/v1/systemone` is only supported by providers that serve the
TypeSafe System One API.** The model in the request belongs to another provider.
Use a `jev/<model>` reference.

**A `400` saying the route requires the `jev` API.** The Model Filtering policy
found a model that isn't a Jev model. Send a `jev/<model>` reference, and put a
Jev model first in the allow list if requests omit `model`.

**A `403` from the Model Filtering policy.** The Jev model isn't in the app's
allow list. Add it, for example `jev/jev-latest`.

**A `400` with the error code `guardrail_uninspectable`.** A guardrail policy in
the app's chain can't inspect System One requests and denies them by default.
See [the policy table](#policies-on-system-one-routes).

**A `401`.** Two different keys can cause one. A `401` with a Problem Details
body (`application/problem+json`) comes from the gateway's authentication, so
check the app's API key. A `401` whose `detail.message` begins
`Cannot authenticate with the server` comes from TypeSafe, which rejected the
provider's API key. Update it in
[**Settings → AI Providers**](https://portal.zuplo.com/+/account/project/ai/settings/data-models)
with a key from the [TypeSafe console](https://console.typesafe.ai/keys).

**A `422` naming a field.** TypeSafe rejected the request body, and the gateway
passed its answer through. The `detail` array names the field that failed
validation.

**An error saying the model `is not included in model selections`.** On
`/v1/embeddings`, this is expected: Jev has no embedding models, so call
`/v1/systemone` instead. On `/v1/systemone`, the model isn't enabled for the
provider. Open the provider in
[**Settings → AI Providers**](https://portal.zuplo.com/+/account/project/ai/settings/data-models),
enable the model, and save.

**Your app's model list has no Jev models.** Expected. The default list holds
chat models—see [List the Jev models](#list-the-jev-models).

**TypeSafe's `client.models.list()` throws.** The SDK expects TypeSafe's own
list format, and the gateway answers `GET /v1/models` in the OpenAI format. Name
the model in `defaultModel` or in each call instead, or list the models with the
`x-zuplo-models-endpoint` header.

## Next steps

- [AI Providers](./providers.mdx)—the capability matrix across every supported
  provider.
- [Managing Providers](./managing-providers.mdx)—edit models and keys, and
  understand when changes deploy.
- [AI Gateway Apps](./apps.mdx)—create the apps that call your models.
- [Model Filtering policy](../policies/ai-gateway-model-filtering-inbound.mdx)—control
  which models each app can call.
- [Usage limits](./usage-limits.mdx)—set budgets on tokens, requests, and
  spending.
