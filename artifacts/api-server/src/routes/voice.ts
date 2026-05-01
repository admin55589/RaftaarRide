import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import OpenAI from "openai";
import { toFile } from "openai";

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

    const transcription = await config.client.audio.transcriptions.create({
      file,
      model: config.model,
      language: whisperLang,
    });

    res.json({ text: transcription.text?.trim() ?? "", language: whisperLang });
  } catch (err) {
    console.error("[voice/transcribe] error:", err);
    res.status(500).json({ error: "Transcription failed", text: "" });
  }
});

export default router;
