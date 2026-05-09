import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import OpenAI from "openai";
import { toFile } from "openai";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function getOpenAIConfig(): { client: OpenAI; model: string } | null {
  const replitKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const replitBase = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (replitKey) {
    return {
      client: new OpenAI({ baseURL: replitBase, apiKey: replitKey }),
      model: "gpt-4o-mini-transcribe",
    };
  }
  if (openaiKey) {
    return {
      client: new OpenAI({ apiKey: openaiKey }),
      model: "whisper-1",
    };
  }
  return null;
}

const LANG_MAP: Record<string, string> = {
  hi: "hi",
  en: "en",
};

router.post("/voice/transcribe", upload.single("audio"), async (req: Request, res: Response) => {
  try {
    const config = getOpenAIConfig();
    if (!config) {
      res.status(503).json({ error: "Voice service not configured", text: "" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "Audio file required" });
      return;
    }

    const rawLang = (req.body as { language?: string }).language ?? "hi";
    const whisperLang = LANG_MAP[rawLang] ?? "hi";

    const ext = req.file.originalname?.split(".").pop() ?? "m4a";
    const mimeType = req.file.mimetype || "audio/m4a";
    const file = await toFile(req.file.buffer, `audio.${ext}`, { type: mimeType });

    const transcriptionParams: OpenAI.Audio.TranscriptionCreateParamsNonStreaming = {
      file,
      model: config.model,
      language: whisperLang,
      stream: false,
    };

    if (whisperLang === "hi") {
      transcriptionParams.prompt =
        "हिंदी में बोला गया पाठ। दिल्ली, मुंबई, कश्मीरी गेट, चांदनी चौक, नई दिल्ली, भारत। देवनागरी लिपि में लिखें।";
    }

    const transcription = await config.client.audio.transcriptions.create(transcriptionParams);

    let resultText = transcription.text?.trim() ?? "";

    let scriptError = false;
    if (whisperLang === "hi" && /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(resultText)) {
      resultText = "";
      scriptError = true;
    }

    res.json({ text: resultText, language: whisperLang, scriptError });
  } catch (err) {
    logger.error({ err }, "[voice/transcribe] error");
    res.status(500).json({ error: "Transcription failed", text: "" });
  }
});

/* ─── POST /api/voice/parse-destination ──────────────────────────────────── */
/* Extract clean English place name from conversational Hindi/English voice input */
router.post("/voice/parse-destination", async (req: Request, res: Response) => {
  const { text } = req.body as { text?: string };
  if (!text?.trim()) {
    res.status(400).json({ destination: "", error: "Text required" });
    return;
  }

  const config = getOpenAIConfig();
  if (!config) {
    res.json({ destination: text.trim(), method: "passthrough" });
    return;
  }

  try {
    const completion = await config.client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You extract the destination place name from a ride-booking voice command. Return ONLY the clean English place name — nothing else, no explanation.

Examples:
"भाई, मुझे IGI Airport T3 जाना है" → "IGI Airport Terminal 3, Delhi"
"चांदनी चौक जाना है" → "Chandni Chowk, Delhi"
"Take me to Connaught Place" → "Connaught Place, New Delhi"
"Bhai mujhe Cyber Hub Gurgaon le chalo" → "Cyber Hub, Gurgaon"
"Saket mall chalna hai" → "Select City Walk, Saket, Delhi"
"mujhe ghar jana hai sector 62 noida" → "Sector 62, Noida"
"Humayun's Tomb" → "Humayun's Tomb, Delhi"

Only return the place name. No punctuation at end.`,
        },
        { role: "user", content: text.trim() },
      ],
      max_tokens: 60,
      temperature: 0,
    });

    const destination = completion.choices[0]?.message?.content?.trim() ?? text.trim();
    logger.info({ input: text, destination }, "[voice/parse-destination] extracted");
    res.json({ destination, method: "gpt" });
  } catch (err) {
    logger.error({ err }, "[voice/parse-destination] error");
    res.json({ destination: text.trim(), method: "fallback" });
  }
});

export default router;
