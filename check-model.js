// Quick test: does the configured model return top_logprobs for the next token?
// Usage: npm run check            (uses OPENAI_MODEL from .env)
//        npm run check -- gpt-4.1-mini gpt-4o-mini   (test several models)
import "dotenv/config";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("Missing OPENAI_API_KEY in .env");
  process.exit(1);
}

const models = process.argv.slice(2);
if (!models.length) models.push(process.env.OPENAI_MODEL || "gpt-4.1-mini");
const reasoningEffort = process.env.OPENAI_REASONING_EFFORT || "";
const prompt = "Eg gjekk ut i hagen og";

for (const model of models) {
  const body = {
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a raw text-continuation engine. Reply with ONLY the text that comes directly after the text between <text> and </text>.",
      },
      { role: "user", content: `<text>${prompt}</text>` },
    ],
    max_completion_tokens: 1,
    temperature: 0,
    logprobs: true,
    top_logprobs: 5,
  };
  if (reasoningEffort) body.reasoning_effort = reasoningEffort;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.log(`✗ ${model}: ${data?.error?.message ?? res.status}`);
    continue;
  }
  const top = data?.choices?.[0]?.logprobs?.content?.[0]?.top_logprobs;
  if (!Array.isArray(top)) {
    console.log(`✗ ${model}: no logprobs returned`);
    continue;
  }
  const list = top
    .map((t) => `${JSON.stringify(t.token)} ${(Math.exp(t.logprob) * 100).toFixed(1)}%`)
    .join(", ");
  console.log(`✓ ${model}: ${list}`);
}
