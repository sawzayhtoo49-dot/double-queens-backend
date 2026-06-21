import { db, lotteryResultsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/lottery/results", async (req, res): Promise<void> => {
  const mode = typeof req.query.mode === "string" ? req.query.mode : undefined;
  let query = db.select().from(lotteryResultsTable).orderBy(desc(lotteryResultsTable.createdAt)).limit(30);
  const results = await query;
  const filtered = mode ? results.filter((r) => r.mode === mode) : results;
  res.json(filtered);
});

router.post("/lottery/results", requireAdmin, async (req, res): Promise<void> => {
  const { mode, number, drawTime, drawDate } = req.body;
  if (!mode || !number || !drawTime || !drawDate) {
    res.status(400).json({ error: "mode, number, drawTime, drawDate required" });
    return;
  }

  const [result] = await db.insert(lotteryResultsTable).values({ mode, number, drawTime, drawDate }).returning();
  req.log.info({ resultId: result.id }, "Lottery result added");
  res.status(201).json(result);
});

export default router;
