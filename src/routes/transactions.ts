import { db, transactionsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/transactions", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { type, amount, method, details } = req.body;

  if (!type || !amount || !method) {
    res.status(400).json({ error: "type, amount, method required" });
    return;
  }
  if (!["deposit", "withdraw"].includes(type)) {
    res.status(400).json({ error: "type must be deposit or withdraw" });
    return;
  }
  if (!["kbz", "aya", "wave", "usdt"].includes(method)) {
    res.status(400).json({ error: "Invalid method" });
    return;
  }
  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) {
    res.status(400).json({ error: "Invalid amount" });
    return;
  }

  const [tx] = await db.insert(transactionsTable).values({
    userId: user.id,
    type,
    amount: amt,
    method,
    status: "pending",
    details: details ?? null,
  }).returning();

  req.log.info({ txId: tx.id, userId: user.id }, "Transaction created");
  res.status(201).json(tx);
});

router.get("/transactions", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const txs = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.userId, user.id))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(50);
  res.json(txs);
});

export default router;
