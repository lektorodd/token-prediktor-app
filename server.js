import "dotenv/config";
import express from "express";

const app = express();
const port = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

app.post("/api/predict", async (req, res) => {
  try {
    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY env var." });
    }

    const prompt = String(req.body?.prompt ?? "");
    if (!prompt.trim()) {
      return res.json({ tokens: [] });
    }

    const response = await fetch("https://api.openai.com/v1/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo-instruct",
        prompt,
        max_tokens: 1,
        temperature: 0,
        logprobs: Math.max(1, Math.min(15, Number(req.body?.top_k ?? 5))),
        top_p: Number(req.body?.top_p ?? 0.9),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return res
        .status(response.status)
        .json({ error: "OpenAI request failed", details: text });
    }

    const data = await response.json();
    const top = data?.choices?.[0]?.logprobs?.top_logprobs?.[0] || {};
    const entries = Object.entries(top).map(([token, logprob]) => ({
      token,
      logprob,
    }));

    entries.sort((a, b) => b.logprob - a.logprob);

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
    res.status(500).json({ error: "Server error", details: String(err) });
  }
});

app.post("/api/next", async (req, res) => {
  try {
    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY env var." });
    }

    const prompt = String(req.body?.prompt ?? "");
    const temperature = Number(req.body?.temperature ?? 0);
    const maxTokens = Math.max(1, Math.min(5, Number(req.body?.max_tokens ?? 1)));
    if (!prompt.trim()) {
      return res.json({ token: "" });
    }

    const response = await fetch("https://api.openai.com/v1/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo-instruct",
        prompt,
        max_tokens: maxTokens,
        temperature,
        top_p: Number(req.body?.top_p ?? 0.9),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return res
        .status(response.status)
        .json({ error: "OpenAI request failed", details: text });
    }

    const data = await response.json();
    const token = data?.choices?.[0]?.text ?? "";
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: String(err) });
  }
});

app.listen(port, () => {
  console.log(`Token predictor running at http://localhost:${port}`);
});
