// Quick test: does a model give sensible next-token probabilities?
// Usage: npm run check                                  (uses OPENAI_MODEL from .env)
//        npm run check -- gpt-4.1-mini gpt-4o-mini       (test several models)
import "dotenv/config";

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY in .env");
  process.exit(1);
}

const models = process.argv.slice(2);
if (!models.length) models.push(process.env.OPENAI_MODEL || "gpt-4.1-mini");

const prompts = ["Eg gjekk ut i hagen og", "Eg gjekk ut i hagen og ", "Eg gjekk ut i ha"];

for (const name of models) {
  process.env.OPENAI_MODEL = name;
  // Fresh import so lib/openai.js picks up the model name.
  const { predictNext, sampleNext } = await import(`./lib/openai.js?model=${name}`);
  console.log(`\n${name}`);
  try {
    for (const prompt of prompts) {
      const tokens = await predictNext(prompt, { topK: 5 });
      const list = tokens
        .map((t) => `${JSON.stringify(t.token)} ${(t.prob * 100).toFixed(1)}%`)
        .join(", ");
      console.log(`  ✓ ${JSON.stringify(prompt)} → ${list}`);
    }
    const sample = await sampleNext(prompts[0], { maxTokens: 3, temperature: 1 });
    console.log(`  ✓ temperature 1, 3 tokens → ${JSON.stringify(sample)}`);
  } catch (err) {
    let msg = err.message;
    try {
      msg = JSON.parse(err.details).error.message;
    } catch {}
    console.log(`  ✗ ${msg}`);
  }
}
