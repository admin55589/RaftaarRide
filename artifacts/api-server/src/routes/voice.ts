import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import OpenAI from "openai";
import { toFile } from "openai";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

router.post("/voice/transcribe", upload.single("audio"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Audio file required" });
      return;
    }

    const lang = (req.body as { language?: string }).language ?? "hi";
    const whisperLang = lang === "hi" ? "hi" : "en";

    const ext = req.file.originalname?.split(".").pop() ?? "m4a";
    const mimeType = req.file.mimetype || "audio/m4a";
    const file = await toFile(req.file.buffer, `audio.${ext}`, { type: mimeType });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "gpt-4o-mini-transcribe",
      language: whisperLang,
    });

    res.json({ text: transcription.text?.trim() ?? "" });
  } catch (err) {
    console.error("[voice/transcribe] error:", err);
    res.status(500).json({ error: "Transcription failed", text: "" });
  }
});

export default router;
