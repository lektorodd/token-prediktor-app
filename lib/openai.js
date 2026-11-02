// Next-token prediction on top of the Chat Completions API.
//
// gpt-3.5-turbo-instruct and /v1/completions were shut down in September 2026.
// Chat models start a *new message*, so the first token of a reply almost never
// has a leading space ("så" instead of " så"), and they can't continue a half
// word. To get real mid-text tokens we ask the model to first repeat the end of
// the text (the "anchor": last word + trailing whitespace) and then continue.
// We then read the logprobs of the first token *after* the echoed anchor.

export const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
// Optional, for reasoning models that only return logprobs without reasoning.
const reasoningEffort = process.env.OPENAI_REASONING_EFFORT || "";

const SYSTEM_PROMPT = [
  "You are a raw text-continuation engine, like a base language model.",
  "The user gives the beginning of a document between <text> and </text>, and its very last characters between <repeat> and </repeat>.",
  "Your reply MUST start by repeating the <repeat> characters exactly, character for character (same case, same spaces and punctuation),",
  "and then continue writing the document directly after them, as its original author would.",
  "Do not answer, comment on, quote or explain the text. Keep the same language and style.",
  "Texts are usually Norwegian (bokmål or nynorsk): if a text could be Norwegian, continue in Norwegian, not Swedish or Danish.",
].join(" ");

// Last "word" of the prompt plus any trailing whitespace, e.g. "og " or "ha".
export function getAnchor(prompt) {
  return prompt.match(/\S*\s*$/)?.[0] ?? "";
}

function stripLeadingSpace(token) {
  return token.replace(/^\s+/, "");
}

// Walk the returned tokens through the echoed anchor.
// Returns { index, rest, stripLead }:
//   index     – position of the first token that goes beyond the anchor
//   rest      – the part of the anchor that this token still covers ("" if the
//               anchor ended exactly on a token boundary)
//   stripLead – whether leading whitespace must be stripped (echo started there)
// Returns null if the model did not echo the anchor faithfully.
export function locateAfterAnchor(content, anchor) {
  let text = "";
  for (let i = 0; i < content.length; i++) {
    const stripLead = text === "";
    const tok = stripLead ? stripLeadingSpace(content[i].token) : content[i].token;
    const remaining = anchor.slice(text.length);
    if (tok.length <= remaining.length) {
      if (!remaining.startsWith(tok)) return null;
      text += tok;
      if (text === anchor) {
        return i + 1 < content.length ? { index: i + 1, rest: "", stripLead: false } : null;
      }
      continue;
    }
    // This token reaches past the end of the anchor ("token healing" case).
    if (!tok.startsWith(remaining)) return null;
    return { index: i, rest: remaining, stripLead };
  }
  return null;
}

// Turn a token at the located position into the part that comes after the anchor.
function tailOf(token, loc) {
  const t = loc.stripLead ? stripLeadingSpace(token) : token;
  if (!t.startsWith(loc.rest) || t.length === loc.rest.length) return null;
  return t.slice(loc.rest.length);
}

async function chatCompletion(body) {
  const payload = { model, ...body };
  if (reasoningEffort) payload.reasoning_effort = reasoningEffort;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
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

function buildRequest(prompt, anchor, extraTokens) {
  return {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `<text>${prompt}</text>\n<repeat>${anchor}</repeat>` },
    ],
    // Room for the echoed anchor plus the tokens we actually want.
    max_completion_tokens: Math.min(anchor.length * 2, 60) + extraTokens + 1,
    logprobs: true,
  };
}

function toProbabilities(entries) {
  // Merge duplicates (e.g. "så" and " så" after stripping) and sort.
  const byToken = new Map();
  for (const { token, logprob } of entries) {
    const prev = byToken.get(token);
    byToken.set(
      token,
      prev === undefined ? logprob : Math.log(Math.exp(prev) + Math.exp(logprob))
    );
  }
  const sorted = [...byToken.entries()]
    .map(([token, logprob]) => ({ token, logprob }))
    .sort((a, b) => b.logprob - a.logprob);

  // Normalize over the returned candidates.
  const max = sorted[0]?.logprob ?? 0;
  const exp = sorted.map((e) => Math.exp(e.logprob - max));
  const sum = exp.reduce((a, b) => a + b, 0) || 1;
  return sorted.map((e, i) => ({ token: e.token, prob: exp[i] / sum }));
}

// Top-k distribution for the next token after `prompt`.
export async function predictNext(prompt, { topK = 5, topP = 0.9 } = {}) {
  const anchor = getAnchor(prompt);
  const data = await chatCompletion({
    ...buildRequest(prompt, anchor, 1),
    temperature: 0,
    top_p: topP,
    top_logprobs: topK, // Chat Completions allows up to 20
  });

  const content = data?.choices?.[0]?.logprobs?.content;
  if (!Array.isArray(content) || !content.length) {
    const err = new Error(
      `Model "${model}" returned no logprobs. Choose a model that supports logprobs (OPENAI_MODEL in .env).`
    );
    err.status = 502;
    throw err;
  }

  const loc = locateAfterAnchor(content, anchor);
  if (!loc) {
    // Model didn't echo the anchor: fall back to the raw first-token candidates.
    console.warn(`[${model}] anchor ${JSON.stringify(anchor)} not echoed, got ${JSON.stringify(data.choices[0].message?.content)}`);
    return toProbabilities(content[0].top_logprobs ?? []);
  }

  const candidates = [];
  for (const { token, logprob } of content[loc.index].top_logprobs ?? []) {
    const tail = tailOf(token, loc);
    if (tail !== null) candidates.push({ token: tail, logprob });
  }
  return toProbabilities(candidates);
}

// Sample `maxTokens` tokens after `prompt` at the given temperature.
export async function sampleNext(prompt, { maxTokens = 1, temperature = 0, topP = 0.9 } = {}) {
  const anchor = getAnchor(prompt);
  const data = await chatCompletion({
    ...buildRequest(prompt, anchor, maxTokens),
    temperature,
    top_p: topP,
  });

  const choice = data?.choices?.[0];
  const content = choice?.logprobs?.content;
  const loc = Array.isArray(content) ? locateAfterAnchor(content, anchor) : null;
  if (!loc) {
    const text = choice?.message?.content ?? "";
    const trimmed = stripLeadingSpace(text);
    return trimmed.startsWith(anchor) ? trimmed.slice(anchor.length) : text;
  }

  const first = tailOf(content[loc.index].token, loc) ?? "";
  const rest = content
    .slice(loc.index + 1, loc.index + maxTokens)
    .map((c) => c.token)
    .join("");
  return first + rest;
}
