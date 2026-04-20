import { useState, useCallback, useRef } from "react";
import { Audio } from "expo-av";
import { useLanguage } from "@/context/LanguageContext";

const BASE_URL = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return "http://localhost:8080/api";
})();

export type VoiceInputState = "idle" | "listening" | "processing";

export function useVoiceInput(onResult: (text: string) => void) {
  const [state, setState] = useState<VoiceInputState>("idle");
  const recordingRef = useRef<Audio.Recording | null>(null);
  const { lang } = useLanguage();

  const startListening = useCallback(async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) return;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setState("listening");
    } catch (err) {
      console.error("[VoiceInput] startListening error:", err);
      setState("idle");
    }
  }, []);

  const stopListening = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;

    try {
      setState("processing");
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;

      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      if (!uri) {
        setState("idle");
        return;
      }

      const formData = new FormData();
      formData.append("audio", {
        uri,
        type: "audio/m4a",
        name: "voice.m4a",
      } as unknown as Blob);
      formData.append("language", lang);

      const res = await fetch(`${BASE_URL}/voice/transcribe`, {
        method: "POST",
        body: formData,
      });

      const data = (await res.json()) as { text?: string };
      if (data.text?.trim()) {
        onResult(data.text.trim());
      }
    } catch (err) {
      console.error("[VoiceInput] stopListening error:", err);
    } finally {
      setState("idle");
    }
  }, [lang, onResult]);

  const cancel = useCallback(async () => {
    const recording = recordingRef.current;
    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
      } catch {}
      recordingRef.current = null;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    setState("idle");
  }, []);

  const toggle = useCallback(async () => {
    if (state === "idle") {
      await startListening();
    } else if (state === "listening") {
      await stopListening();
    }
  }, [state, startListening, stopListening]);

  return { state, toggle, cancel };
}
