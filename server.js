import "dotenv/config";
import express from "express";
import { model, predictNext, sampleNext } from "./lib/openai.js";

const app = express();
const port = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

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

    const tokens = await predictNext(prompt, {
      topK: Math.round(clampNumber(req.body?.top_k, 5, 1, 20)),
      topP: clampNumber(req.body?.top_p, 0.9, 0, 1),
    });
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

    const token = await sampleNext(prompt, {
      maxTokens: Math.round(clampNumber(req.body?.max_tokens, 1, 1, 5)),
      temperature: clampNumber(req.body?.temperature, 0, 0, 2),
      topP: clampNumber(req.body?.top_p, 0.9, 0, 1),
    });
    res.json({ token });
  } catch (err) {
    sendError(res, err);
  }
});

app.listen(port, () => {
  console.log(`Token predictor running at http://localhost:${port} (model: ${model})`);
});
