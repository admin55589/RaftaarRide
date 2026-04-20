import * as Speech from "expo-speech";
import { useCallback, useRef } from "react";
import { useLanguage } from "@/context/LanguageContext";

interface SpeakOptions {
  pitch?: number;
  rate?: number;
}

export function useVoiceAI() {
  const { lang } = useLanguage();
  const isSpeaking = useRef(false);
  const hi = lang === "hi";

  const speak = useCallback(
    (textHi: string, textEn: string, options?: SpeakOptions) => {
      Speech.stop();
      isSpeaking.current = true;
      Speech.speak(hi ? textHi : textEn, {
        language: hi ? "hi-IN" : "en-IN",
        pitch: options?.pitch ?? 1.0,
        rate: options?.rate ?? 0.9,
        onDone: () => { isSpeaking.current = false; },
        onError: () => { isSpeaking.current = false; },
      });
    },
    [hi]
  );

  const announceWelcome = useCallback(
    (name: string) => {
      speak(
        `Namaste ${name}! Raftaar Ride mein aapka swagat hai.`,
        `Welcome ${name}! Thank you for choosing Raftaar Ride.`
      );
    },
    [speak]
  );

  const announceSearching = useCallback(() => {
    speak(
      "Driver dhoonda ja raha hai. Kripya pratiksha karein.",
      "Searching for a driver. Please wait."
    );
  }, [speak]);

  const announceDriverFound = useCallback(
    (driverName: string, eta: number) => {
      speak(
        `Driver mil gaya! ${driverName} aapke paas aa raha hai. Estimated time ${eta} minute.`,
        `Driver found! ${driverName} is on the way. Estimated time ${eta} minutes.`
      );
    },
    [speak]
  );

  const announcePickupReached = useCallback(() => {
    speak(
      "Aapka driver pickup point pe pahunch gaya hai. Bahar aa jaiye!",
      "Your driver has reached the pickup point. Please come outside!"
    );
  }, [speak]);

  const announceRideStarted = useCallback(
    (destination: string) => {
      speak(
        `Ride shuru ho gayi. ${destination} ki taraf ja rahe hain. Safe journey!`,
        `Ride started. Heading towards ${destination}. Have a safe journey!`
      );
    },
    [speak]
  );

  const announceArrived = useCallback(() => {
    speak(
      "Aap apni manzil par pahunch gaye hain. Raftaar Ride use karne ke liye shukriya!",
      "You have reached your destination. Thank you for riding with Raftaar Ride!"
    );
  }, [speak]);

  const announcePaymentSuccess = useCallback(
    (amount: number) => {
      speak(
        `Payment successful. ${amount} rupay kat gaye. Aapka safar mubarak ho!`,
        `Payment successful. ${amount} rupees charged. Have a great day!`
      );
    },
    [speak]
  );

  const announceVoicePrompt = useCallback(() => {
    speak(
      "Kahan jaana hai? Bol dijiye.",
      "Where do you want to go? Please speak now."
    );
  }, [speak]);

  const stop = useCallback(() => {
    Speech.stop();
    isSpeaking.current = false;
  }, []);

  return {
    speak,
    stop,
    announceWelcome,
    announceSearching,
    announceDriverFound,
    announcePickupReached,
    announceRideStarted,
    announceArrived,
    announcePaymentSuccess,
    announceVoicePrompt,
  };
}
