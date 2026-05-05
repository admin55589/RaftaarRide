import { Router, type IRouter, type Request, type Response } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { driversTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/stats/online-drivers", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({ id: driversTable.id })
      .from(driversTable)
      .where(eq(driversTable.isOnline, true));
    res.json({ count: rows.length });
  } catch {
    res.json({ count: 0 });
  }
});

export default router;
