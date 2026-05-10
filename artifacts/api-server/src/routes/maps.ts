/**
 * maps.ts — Server-side Google Maps proxy
 *
 * Why: Google Maps API keys must NEVER be in client code (APK decompilable).
 * The client calls /api/maps/* and the server adds the secret key.
 *
 * Uses GOOGLE_MAPS_SERVER_KEY env var (separate from client-side Maps key).
 * Falls back to GOOGLE_MAPS_API_KEY if server key not set separately.
 *
 * Endpoints:
 *   GET /api/maps/directions?origin=lat,lng&destination=lat,lng
 *   GET /api/maps/geocode?q=address&lat=bias_lat&lng=bias_lng
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function getMapsKey(): string {
  return (
    process.env.GOOGLE_MAPS_SERVER_KEY ??
    process.env.GOOGLE_MAPS_API_KEY ??
    ""
  );
}

/* ─── GET /api/maps/directions ────────────────────────────────────────────── */
router.get("/maps/directions", async (req: Request, res: Response) => {
  const { origin, destination } = req.query as {
    origin?: string;
    destination?: string;
  };

  if (!origin || !destination) {
    res.status(400).json({ message: "origin aur destination required hain" });
    return;
  }

  const key = getMapsKey();
  if (!key) {
    res.status(503).json({ message: "Maps service unavailable" });
    return;
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=driving&key=${key}`;
    const upstream = await fetch(url);
    const data = (await upstream.json()) as object;
    res.json(data);
  } catch (err) {
    logger.error({ err }, "[maps] directions proxy error");
    res.status(502).json({ message: "Maps service error" });
  }
});

/* ─── GET /api/maps/distance-matrix ──────────────────────────────────────── */
/**
 * Lighter than Directions API — purpose-built for distance/time estimates.
 * Used by Rapido/Ola-style apps: no polyline/steps data, just km + seconds.
 *
 * Query params:
 *   origins      — "lat,lng"
 *   destinations — "lat,lng"
 */
router.get("/maps/distance-matrix", async (req: Request, res: Response) => {
  const { origins, destinations } = req.query as {
    origins?: string;
    destinations?: string;
  };

  if (!origins || !destinations) {
    res.status(400).json({ message: "origins aur destinations required hain" });
    return;
  }

  const key = getMapsKey();
  if (!key) {
    res.status(503).json({ message: "Maps service unavailable" });
    return;
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(destinations)}&mode=driving&key=${key}`;
    const upstream = await fetch(url);
    const data = (await upstream.json()) as object;
    res.json(data);
  } catch (err) {
    logger.error({ err }, "[maps] distance-matrix proxy error");
    res.status(502).json({ message: "Maps service error" });
  }
});

/* ─── GET /api/maps/geocode ───────────────────────────────────────────────── */
router.get("/maps/geocode", async (req: Request, res: Response) => {
  const { q, lat, lng } = req.query as {
    q?: string;
    lat?: string;
    lng?: string;
  };

  if (!q) {
    res.status(400).json({ message: "q (address) required hai" });
    return;
  }

  const key = getMapsKey();
  if (!key) {
    res.status(503).json({ message: "Maps service unavailable" });
    return;
  }

  try {
    const biasParam =
      lat && lng ? `&location=${lat},${lng}&radius=50000` : "";
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&components=country:IN&region=in${biasParam}&key=${key}`;
    const upstream = await fetch(url);
    const data = (await upstream.json()) as object;
    res.json(data);
  } catch (err) {
    logger.error({ err }, "[maps] geocode proxy error");
    res.status(502).json({ message: "Maps service error" });
  }
});

export default router;
