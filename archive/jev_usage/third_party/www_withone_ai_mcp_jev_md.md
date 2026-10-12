# Jev MCP Server: TypeSafe's System One model for any agent

> Jev is TypeSafe's System One model: you give it state and typed questions, it gives back typed answers with probabilities. One hosts a remote MCP server that puts Jev in any AI client next to every other app your agent already uses. Point your client at the URL below, sign in, and add your TypeSafe key once.

**URL:** https://www.withone.ai/mcp/jev
**Server:** https://mcp.withone.ai/mcp
**Transport:** Streamable HTTP
**Actions:** 2

## Setup

1. Open your client's connector or MCP settings.
2. Add One as a custom connector with the URL https://mcp.withone.ai/mcp.
3. Sign in and add your TypeSafe credentials to your One account once.

## What Jev is, and what it isn't

Jev doesn't write text or hold a conversation. It answers narrow questions about the state you send it and returns three kinds of typed answer: a Choice picks one option from a set you define, a Score rates something against levels you describe, and a Noul gives the probability that a yes/no statement is true. Every answer carries probabilities, so your agent can tell a confident call from a coin flip.

That makes Jev a partner for your agent's LLM, not a replacement for it. The LLM in Claude Code or Cursor keeps reasoning and writing. When it needs a fast, calibrated decision (which of these actions fits, how urgent is this, is this claim supported by the source), it calls Jev through One and branches on the numbers.

Several questions about the same state go in one request and run in parallel, so asking five things costs one round trip, not five.

## What agents use Jev for

- **Route before acting.** Hand Jev a request and a short list of candidate actions, and it picks one with a probability for each. Add a "none of these" option and it can say so, which is how an agent avoids running the closest-sounding action when nothing actually fits.
- **Gate risky steps.** Before an agent sends, deletes or pays, ask Jev yes/no questions about the step: does it reach a person, can it be undone, does it move money. Code decides the threshold. Anything under it goes to a human.
- **Score and rank what you pulled.** Fetch tickets from Zendesk, leads from HubSpot or threads from Gmail through the same server, then score each one on urgency, fit or risk. The scores are numbers, so sorting and filtering happen in code instead of in another prompt.
- **Check work before it ships.** Ask whether a quote supports a claim, whether an extracted field matches the document, or whether a draft follows your rules. Jev returns a probability, so the agent knows when to fix, retry or escalate.

## Compared to TypeSafe's own tooling

TypeSafe doesn't ship an MCP server. Jev is reached through its HTTP API, its Python and JavaScript SDKs, and an agent skill that teaches coding agents to write code against it. One puts Jev behind the same hosted MCP endpoint as the rest of your stack, so an agent can read a ticket from Zendesk, ask Jev for a calibrated judgment on it, and act on the answer in Slack, all through one server. Your TypeSafe API key lives in your One account, not in a client config.

## Client guides with the exact config

Run against a real build of each client, so the config block is the one we tested.

- [Claude Code](https://www.withone.ai/connect/claude-code/typesafe)
- [Codex](https://www.withone.ai/connect/codex/typesafe)
- [Cursor](https://www.withone.ai/connect/cursor/typesafe)
- [Gemini](https://www.withone.ai/connect/gemini/typesafe)
- [Grok CLI](https://www.withone.ai/connect/grok-cli/typesafe)
- [OpenCode](https://www.withone.ai/connect/opencode/typesafe)
- [Muse Code](https://www.withone.ai/connect/muse-code/typesafe)

## Client guides without an MCP config

One's server has not been run inside these yet. Their guides cover the One CLI route instead.

- [OpenClaw](https://www.withone.ai/connect/openclaw/typesafe)
- [GitHub Copilot](https://www.withone.ai/connect/copilot/typesafe)
- [Windsurf](https://www.withone.ai/connect/windsurf/typesafe)
- [AMP](https://www.withone.ai/connect/amp/typesafe)
- [Antigravity](https://www.withone.ai/connect/antigravity/typesafe)
- [Cline](https://www.withone.ai/connect/cline/typesafe)
- [Droid](https://www.withone.ai/connect/droid/typesafe)
- [Goose](https://www.withone.ai/connect/goose/typesafe)
- [Kilo](https://www.withone.ai/connect/kilo/typesafe)
- [Kiro CLI](https://www.withone.ai/connect/kiro-cli/typesafe)
- [Roo](https://www.withone.ai/connect/roo/typesafe)
- [Trae](https://www.withone.ai/connect/trae/typesafe)
- [Warp Agent CLI](https://www.withone.ai/connect/warp/typesafe)
- [Mastra Code](https://www.withone.ai/connect/mastra-code/typesafe)
- [Hermes Agent](https://www.withone.ai/connect/hermes/typesafe)
- [Claude Cowork](https://www.withone.ai/connect/claude-cowork/typesafe)
- [Dots by OpenAI](https://www.withone.ai/connect/dots/typesafe)
- [Grok](https://www.withone.ai/connect/grok/typesafe)
- [Meta Muse](https://www.withone.ai/connect/meta-muse/typesafe)
- [Lovable](https://www.withone.ai/connect/lovable/typesafe)
- [Bolt](https://www.withone.ai/connect/bolt/typesafe)
- [Replit](https://www.withone.ai/connect/replit/typesafe)
- [v0](https://www.withone.ai/connect/v0/typesafe)
- [Base44](https://www.withone.ai/connect/base44/typesafe)
- [Figma Make](https://www.withone.ai/connect/figma-make/typesafe)
- [Emergent](https://www.withone.ai/connect/emergent/typesafe)
- [Dyad](https://www.withone.ai/connect/dyad/typesafe)
- [Mastra](https://www.withone.ai/connect/mastra/typesafe)
- [Vercel AI SDK](https://www.withone.ai/connect/ai-sdk/typesafe)
- [LangGraph](https://www.withone.ai/connect/langgraph/typesafe)
- [LangChain](https://www.withone.ai/connect/langchain/typesafe)
- [CrewAI](https://www.withone.ai/connect/crewai/typesafe)

## Actions (2)

- **GET** [List Available Models](https://www.withone.ai/knowledge/typesafe/conn_mod_def%3A%3AGNh4bXKyZ0c%3A%3AEN7s5YVdTMGFNL5Nhbyn1A/md) -- `/v1/models`
- **POST** [Answer Questions Using Systemone](https://www.withone.ai/knowledge/typesafe/conn_mod_def%3A%3AGNh4bXcHPaU%3A%3AV2ndvy5CQJmYHvkElwVM_w/md) -- `/v1/systemone`

## Why one server instead of one per app

A traditional MCP setup loads every tool schema upfront: five official servers we measured put 41,831 tokens in front of every message. One's server exposes three tools at about 1.2K tokens, about 35x less, regardless of how many of the 959+ platforms in the catalog you authorize (129,313+ actions total). Details: https://www.withone.ai/mcp-efficiency


## FAQ

### What is Jev?

Jev is TypeSafe's flagship model and the first of its System One models. You send it state (text, a JSON object or an array) and one or more typed questions, and it returns typed answers: a Choice with a probability per option, a Score on levels you define, or a Noul, the probability that a yes/no statement is true. It doesn't generate text.

### Can Jev replace the model inside Claude Code or Cursor?

No, and TypeSafe says the same in its docs. Your client's LLM keeps doing the reasoning, writing and tool calling. Through One's MCP server, that LLM can call Jev whenever it needs a structured decision it can branch on, then carry on with the answer.

### What do I need to connect Jev?

A TypeSafe API key, which you get from the TypeSafe console. Add it once as a TypeSafe connection in your One account. One injects it when your agent calls Jev, so it never sits in an MCP client config.

### Which Jev model does my agent call?

The model is a parameter on each request. One's TypeSafe catalog includes a List Available Models action, so your agent can look up the current model names and aliases before it asks a question.

## Links

- [Jev MCP Server](https://www.withone.ai/mcp/jev)
- [Jev Knowledge](https://www.withone.ai/knowledge/typesafe)
- [MCP overview](https://www.withone.ai/products/mcp)
- [MCP directory](https://www.withone.ai/mcp)
- [Get started](https://app.withone.ai)
