import "dotenv/config";
import express from "express";

const app = express();
const port = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;

// gpt-3.5-turbo-instruct and the legacy /v1/completions endpoint were shut down
// in September 2026. We now use Chat Completions, which still returns
// logprobs/top_logprobs for models that support them.
// The model must support `logprobs` + `top_logprobs` (non-reasoning models,
// or reasoning models run with reasoning effort "none"). Override in .env.
const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
// Optional: set e.g. OPENAI_REASONING_EFFORT=none for reasoning models that
// only return logprobs when reasoning is turned off. Leave unset otherwise.
const reasoningEffort = process.env.OPENAI_REASONING_EFFORT || "";

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

// Chat models answer messages instead of continuing raw text, so we ask the
// model to behave like a base model and output only the continuation.
const SYSTEM_PROMPT = [
  "You are a raw text-continuation engine, like a base language model.",
  "The user message contains the beginning of a text between <text> and </text>.",
  "Reply with ONLY the text that comes directly after it, as if you were writing the next characters of the same document.",
  "Never repeat the given text, never answer or comment on it, never add quotes or explanations.",
  "Keep the same language and style.",
  "Whitespace matters: if the text does not end with a space and the next word is a new word, start your reply with a single space.",
  "If the text already ends with a space, do not start with a space.",
].join(" ");

function buildMessages(prompt) {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `<text>${prompt}</text>` },
  ];
}

async function chatCompletion(params) {
  const body = {
    model,
    messages: buildMessages(params.prompt),
    max_completion_tokens: params.maxTokens,
    temperature: params.temperature,
    top_p: params.topP,
  };
  if (params.topLogprobs) {
    body.logprobs = true;
    body.top_logprobs = params.topLogprobs;
  }
  if (reasoningEffort) {
    body.reasoning_effort = reasoningEffort;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    const err = new Error("OpenAI request failed");
    err.status = response.status;
    err.details = text;
    throw err;
  }
  return response.json();
}

function sendError(res, err) {
  console.error(`[${model}]`, err.message, err.details ?? "");
  if (err.status) {
    return res
      .status(err.status)
      .json({ error: err.message, model, details: err.details });
  }
  return res.status(500).json({ error: "Server error", details: String(err) });
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

app.post("/api/predict", async (req, res) => {
  try {
    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY env var." });
    }

    const prompt = String(req.body?.prompt ?? "");
    if (!prompt.trim()) {
      return res.json({ tokens: [] });
    }

    const data = await chatCompletion({
      prompt,
      maxTokens: 1,
      temperature: 0,
      topP: clampNumber(req.body?.top_p, 0.9, 0, 1),
      // Chat Completions allows up to 20 top_logprobs.
      topLogprobs: Math.round(clampNumber(req.body?.top_k, 5, 1, 20)),
    });

    const top = data?.choices?.[0]?.logprobs?.content?.[0]?.top_logprobs;
    if (!Array.isArray(top)) {
      return res.status(502).json({
        error: `Model "${model}" returned no logprobs. Choose a model that supports logprobs (set OPENAI_MODEL in .env).`,
      });
    }

    // Merge duplicates (same text can appear more than once) and sort.
    const byToken = new Map();
    for (const { token, logprob } of top) {
      const prev = byToken.get(token);
      byToken.set(
        token,
        prev === undefined ? logprob : Math.log(Math.exp(prev) + Math.exp(logprob))
      );
    }
    const entries = [...byToken.entries()]
      .map(([token, logprob]) => ({ token, logprob }))
      .sort((a, b) => b.logprob - a.logprob);

    // Convert logprobs to normalized probabilities over returned candidates.
    const maxLogprob = entries[0]?.logprob ?? 0;
    const exp = entries.map((e) => Math.exp(e.logprob - maxLogprob));
    const sumExp = exp.reduce((a, b) => a + b, 0) || 1;
    const tokens = entries.map((e, i) => ({
      token: e.token,
      prob: exp[i] / sumExp,
    }));

    res.json({ tokens });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/next", async (req, res) => {
  try {
    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY env var." });
    }

    const prompt = String(req.body?.prompt ?? "");
    if (!prompt.trim()) {
      return res.json({ token: "" });
    }

    const data = await chatCompletion({
      prompt,
      maxTokens: Math.round(clampNumber(req.body?.max_tokens, 1, 1, 5)),
      temperature: clampNumber(req.body?.temperature, 0, 0, 2),
      topP: clampNumber(req.body?.top_p, 0.9, 0, 1),
    });

    const token = data?.choices?.[0]?.message?.content ?? "";
    res.json({ token });
  } catch (err) {
    sendError(res, err);
  }
});

app.listen(port, () => {
  console.log(`Token predictor running at http://localhost:${port} (model: ${model})`);
});
