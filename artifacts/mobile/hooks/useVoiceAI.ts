import * as Speech from "expo-speech";
import { useCallback, useRef } from "react";

interface SpeakOptions {
  language?: string;
  pitch?: number;
  rate?: number;
}

export function useVoiceAI() {
  const isSpeaking = useRef(false);

  const speak = useCallback((text: string, options?: SpeakOptions) => {
    Speech.stop();
    isSpeaking.current = true;
    Speech.speak(text, {
      language: options?.language ?? "hi-IN",
      pitch: options?.pitch ?? 1.0,
      rate: options?.rate ?? 0.9,
      onDone: () => {
        isSpeaking.current = false;
      },
      onError: () => {
        isSpeaking.current = false;
      },
    });
  }, []);

  const announceDriverFound = useCallback((driverName: string, eta: number) => {
    speak(`Driver mil gaya! ${driverName} aapke paas aa raha hai. Estimated time ${eta} minute.`);
  }, [speak]);

  const announceRideStarted = useCallback((destination: string) => {
    speak(`Ride shuru ho gayi. ${destination} ki taraf ja rahe hain.`);
  }, [speak]);

  const announceArrived = useCallback(() => {
    speak("Aap apni manzil par pahunch gaye hain. Raftaar Ride use karne ke liye shukriya!");
  }, [speak]);

  const announcePaymentSuccess = useCallback((amount: number) => {
    speak(`Payment successful. ${amount} rupay kat gaye. Aapka safar shukriya!`);
  }, [speak]);

  const announceSearching = useCallback(() => {
    speak("Driver dhoonda ja raha hai. Kripya pratiksha karein.");
  }, [speak]);

  const announceWelcome = useCallback((name: string) => {
    speak(`Namaste ${name}! Raftaar Ride mein aapka swagat hai.`);
  }, [speak]);

  const stop = useCallback(() => {
    Speech.stop();
    isSpeaking.current = false;
  }, []);

  return {
    speak,
    stop,
    announceDriverFound,
    announceRideStarted,
    announceArrived,
    announcePaymentSuccess,
    announceSearching,
    announceWelcome,
  };
}
