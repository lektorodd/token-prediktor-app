// Next-token prediction on top of the Chat Completions API.
//
// gpt-3.5-turbo-instruct and /v1/completions were shut down in September 2026.
// Chat models start a *new message*, so the first token of a reply almost never
// has a leading space ("så" instead of " så"), and they can't continue a half
// word. To get real mid-text tokens we ask the model to first repeat the end of
// the text (the "anchor": up to the last 200 characters) and then continue.
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

// The end of the prompt that the model must repeat before continuing.
// A long anchor (up to `maxChars`, starting at a word) lets the model "write"
// the text itself, so the next token is well grounded in it. A short anchor
// (just the last word) is the fallback. Always includes trailing whitespace.
export function getAnchor(prompt, maxChars = 200) {
  const lastWord = prompt.match(/\S*\s*$/)?.[0] ?? "";
  if (lastWord.length >= maxChars) return lastWord;
  if (prompt.length <= maxChars) return prompt.replace(/^\s+/, "");
  const tail = prompt.slice(-maxChars);
  const start = tail.search(/\s\S/);
  return start === -1 ? lastWord : tail.slice(start + 1);
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
    // (Norwegian text is rarely more than one token per character.)
    max_completion_tokens: anchor.length + extraTokens + 2,
    logprobs: true,
  };
}

// Merge duplicates (e.g. "så" and " så" after stripping) and sort.
function mergeCandidates(entries) {
  const byToken = new Map();
  for (const { token, logprob } of entries) {
    if (logprob <= -9999) continue; // API placeholder for "very unlikely"
    const prev = byToken.get(token);
    byToken.set(
      token,
      prev === undefined ? logprob : Math.log(Math.exp(prev) + Math.exp(logprob))
    );
  }
  return [...byToken.entries()]
    .map(([token, logprob]) => ({ token, logprob }))
    .sort((a, b) => b.logprob - a.logprob);
}

// Normalize over the given candidates.
function toProbabilities(sorted) {
  const max = sorted[0]?.logprob ?? 0;
  const exp = sorted.map((e) => Math.exp(e.logprob - max));
  const sum = exp.reduce((a, b) => a + b, 0) || 1;
  return sorted.map((e, i) => ({ token: e.token, prob: exp[i] / sum }));
}

// Ask the API for the next-token candidates after `prompt` (always the max of
// 20, so every tab can use the same list). No top_p here: it filters which
// candidates the API returns, which would hide alternatives.
// Returns { candidates, reliable }; reliable = the model echoed the anchor.
async function fetchCandidates(prompt) {
  const longAnchor = getAnchor(prompt);
  const shortAnchor = getAnchor(prompt, 0);
  const anchors = longAnchor === shortAnchor ? [longAnchor] : [longAnchor, shortAnchor];

  let content;
  for (const anchor of anchors) {
    const data = await chatCompletion({
      ...buildRequest(prompt, anchor, 1),
      temperature: 0,
      top_logprobs: 20,
    });

    content = data?.choices?.[0]?.logprobs?.content;
    if (!Array.isArray(content) || !content.length) {
      const err = new Error(
        `Model "${model}" returned no logprobs. Choose a model that supports logprobs (OPENAI_MODEL in .env).`
      );
      err.status = 502;
      throw err;
    }

    const loc = locateAfterAnchor(content, anchor);
    if (loc) {
      const candidates = [];
      for (const { token, logprob } of content[loc.index].top_logprobs ?? []) {
        const tail = tailOf(token, loc);
        if (tail !== null) candidates.push({ token: tail, logprob });
      }
      return { candidates: mergeCandidates(candidates), reliable: true };
    }
    console.warn(
      `[${model}] anchor ${JSON.stringify(anchor)} not echoed, got ${JSON.stringify(data.choices[0].message?.content)}`
    );
  }

  // Model never echoed the anchor: fall back to the raw first-token candidates.
  return { candidates: mergeCandidates(content[0].top_logprobs ?? []), reliable: false };
}

// Chat models are not fully deterministic, even at temperature 0: the same
// request can return slightly different logprobs. We cache the candidate list
// per prompt so the same text always gets the same distribution while the
// server runs (identical prompts in parallel also share one request).
// Fallback results are not kept, so a bad answer isn't locked in.
const CACHE_LIMIT = 2000;
const cache = new Map();

function getCandidates(prompt) {
  if (cache.has(prompt)) return cache.get(prompt);
  const promise = fetchCandidates(prompt).then(({ candidates, reliable }) => {
    if (!reliable) cache.delete(prompt);
    return candidates;
  });
  cache.set(prompt, promise);
  promise.catch(() => cache.delete(prompt));
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return promise;
}

// Top-k distribution for the next token after `prompt`.
export async function predictNext(prompt, { topK = 5 } = {}) {
  const candidates = await getCandidates(prompt);
  return toProbabilities(candidates.slice(0, topK));
}

// Pick one candidate with temperature and top_p, like the API would do,
// but on the (top 20) distribution the app shows. Temperature 0 = always the
// most likely token, so equal prompts always give equal text.
function pick(candidates, temperature, topP) {
  if (!candidates.length) return null;
  if (temperature <= 0) return candidates[0];

  const max = candidates[0].logprob;
  const weights = candidates.map((c) => Math.exp((c.logprob - max) / temperature));
  const total = weights.reduce((a, b) => a + b, 0);

  // Nucleus: keep the most likely tokens until their sum reaches top_p.
  const kept = [];
  let cumulative = 0;
  for (let i = 0; i < candidates.length; i++) {
    kept.push(i);
    cumulative += weights[i] / total;
    if (cumulative >= topP) break;
  }

  const keptTotal = kept.reduce((a, i) => a + weights[i], 0);
  let r = Math.random() * keptTotal;
  for (const i of kept) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[kept[kept.length - 1]];
}

// Sample `maxTokens` tokens after `prompt` at the given temperature.
export async function sampleNext(prompt, { maxTokens = 1, temperature = 0, topP = 1 } = {}) {
  let output = "";
  for (let i = 0; i < maxTokens; i++) {
    const candidates = await getCandidates(prompt + output);
    const choice = pick(candidates, temperature, topP);
    if (!choice) break;
    output += choice.token;
  }
  return output;
}
