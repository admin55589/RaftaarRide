export interface SurgeResult {
  multiplier: number;
  reason: string;
  factors: string[];
  isActive: boolean;
}

interface WeatherCache {
  precipitation: number;
  weatherCode: number;
  fetchedAt: number;
}

const weatherCache = new Map<string, WeatherCache>();
const WEATHER_TTL_MS = 10 * 60 * 1000;

const FESTIVALS: Array<{ month: number; day: number; name: string; multiplier: number }> = [
  { month: 1, day: 1, name: "New Year's Day", multiplier: 2.0 },
  { month: 1, day: 14, name: "Makar Sankranti", multiplier: 1.6 },
  { month: 1, day: 26, name: "Republic Day", multiplier: 1.5 },
  { month: 3, day: 14, name: "Holi 2025", multiplier: 2.0 },
  { month: 3, day: 3, name: "Holi 2026", multiplier: 2.0 },
  { month: 3, day: 31, name: "Eid ul-Fitr 2025", multiplier: 1.8 },
  { month: 3, day: 20, name: "Eid ul-Fitr 2026", multiplier: 1.8 },
  { month: 8, day: 15, name: "Independence Day", multiplier: 1.5 },
  { month: 8, day: 27, name: "Janmashtami", multiplier: 1.6 },
  { month: 10, day: 2, name: "Dussehra", multiplier: 1.8 },
  { month: 10, day: 20, name: "Diwali 2025", multiplier: 2.2 },
  { month: 11, day: 8, name: "Diwali 2026", multiplier: 2.2 },
  { month: 11, day: 5, name: "Bhai Dooj", multiplier: 1.6 },
  { month: 12, day: 25, name: "Christmas", multiplier: 1.5 },
  { month: 12, day: 31, name: "New Year's Eve", multiplier: 2.5 },
];

function getISTNow(): Date {
  const now = new Date();
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  return new Date(now.getTime() + IST_OFFSET);
}

function checkFestival(date: Date): { isFestival: boolean; name: string; multiplier: number } {
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const f = FESTIVALS.find((f) => f.month === m && f.day === d);
  return f ? { isFestival: true, name: f.name, multiplier: f.multiplier } : { isFestival: false, name: "", multiplier: 1.0 };
}

function getTimeBasedSurge(istHour: number): { multiplier: number; label: string } {
  if (istHour >= 7 && istHour < 10) return { multiplier: 1.4, label: "Morning rush hour" };
  if (istHour >= 12 && istHour < 14) return { multiplier: 1.2, label: "Lunch peak" };
  if (istHour >= 17 && istHour < 21) return { multiplier: 1.6, label: "Evening peak hour" };
  if (istHour >= 23 || istHour < 4) return { multiplier: 1.3, label: "Late night charge" };
  return { multiplier: 1.0, label: "" };
}

async function fetchWeather(lat: number, lng: number): Promise<{ precipitation: number; weatherCode: number }> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = weatherCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < WEATHER_TTL_MS) {
    return { precipitation: cached.precipitation, weatherCode: cached.weatherCode };
  }
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=precipitation,weather_code&timezone=Asia%2FKolkata&forecast_days=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { precipitation: 0, weatherCode: 0 };
    const data = await res.json() as { current?: { precipitation?: number; weather_code?: number } };
    const precipitation = data.current?.precipitation ?? 0;
    const weatherCode = data.current?.weather_code ?? 0;
    weatherCache.set(key, { precipitation, weatherCode, fetchedAt: Date.now() });
    return { precipitation, weatherCode };
  } catch {
    return { precipitation: 0, weatherCode: 0 };
  }
}

function isRainCode(code: number): boolean {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code === 95 || code === 96 || code === 99;
}

export async function calculateAiSurge(lat: number, lng: number): Promise<SurgeResult> {
  const ist = getISTNow();
  const istHour = ist.getUTCHours();

  const festival = checkFestival(ist);
  const timeSurge = getTimeBasedSurge(istHour);
  const weather = await fetchWeather(lat, lng);

  const factors: string[] = [];
  let multiplier = 1.0;

  if (festival.isFestival) {
    multiplier = Math.max(multiplier, festival.multiplier);
    factors.push(`🎉 ${festival.name}`);
  } else if (timeSurge.multiplier > 1.0) {
    multiplier = Math.max(multiplier, timeSurge.multiplier);
    factors.push(`🕐 ${timeSurge.label}`);
  }

  const isRaining = isRainCode(weather.weatherCode) || weather.precipitation > 0.3;
  if (isRaining) {
    multiplier = Math.min(2.5, multiplier + 0.4);
    factors.push(`🌧️ Rain detected (${weather.precipitation.toFixed(1)} mm/h)`);
  }

  multiplier = Math.round(multiplier * 10) / 10;

  const reason =
    factors.length > 0
      ? factors.join(" · ")
      : "Normal demand — standard fare";

  return {
    multiplier,
    reason,
    factors,
    isActive: multiplier > 1.0,
  };
}

export function generateNext24hForecast(): Array<{ hour: number; label: string; multiplier: number; tag: string }> {
  const ist = getISTNow();
  const result = [];
  for (let i = 0; i < 24; i++) {
    const futureIST = new Date(ist.getTime() + i * 60 * 60 * 1000);
    const h = futureIST.getUTCHours();
    const festival = checkFestival(futureIST);
    const timeSurge = getTimeBasedSurge(h);
    let multiplier = 1.0;
    let tag = "Normal";
    if (festival.isFestival) {
      multiplier = festival.multiplier;
      tag = festival.name;
    } else if (timeSurge.multiplier > 1.0) {
      multiplier = timeSurge.multiplier;
      tag = timeSurge.label;
    }
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    const ampm = h < 12 ? "AM" : "PM";
    result.push({ hour: h, label: `${displayHour}:00 ${ampm}`, multiplier, tag });
  }
  return result;
}
