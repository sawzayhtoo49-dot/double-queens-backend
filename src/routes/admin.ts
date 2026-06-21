import { db, transactionsTable, usersTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/auth";
import { getIo } from "../game/socket-server";

const router: IRouter = Router();

router.get("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  const users = await db.select({
    id: usersTable.id,
    phone: usersTable.phone,
    name: usersTable.name,
    balance: usersTable.balance,
    referralCode: usersTable.referralCode,
    referredByCode: usersTable.referredByCode,
    isAdmin: usersTable.isAdmin,
    createdAt: usersTable.createdAt,
  }).from(usersTable).orderBy(desc(usersTable.createdAt));
  res.json(users);
});

router.get("/admin/transactions", requireAdmin, async (req, res): Promise<void> => {
  const txs = await db.select({
    id: transactionsTable.id,
    userId: transactionsTable.userId,
    type: transactionsTable.type,
    amount: transactionsTable.amount,
    method: transactionsTable.method,
    status: transactionsTable.status,
    details: transactionsTable.details,
    adminNote: transactionsTable.adminNote,
    createdAt: transactionsTable.createdAt,
    updatedAt: transactionsTable.updatedAt,
    userName: usersTable.name,
    userPhone: usersTable.phone,
  })
    .from(transactionsTable)
    .leftJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(200);
  res.json(txs);
});

router.put("/admin/transactions/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id)).limit(1);
  if (!tx) { res.status(404).json({ error: "Not found" }); return; }
  if (tx.status !== "pending") { res.status(409).json({ error: "Already processed" }); return; }

  await db.update(transactionsTable).set({ status: "approved", adminNote: req.body.note ?? null }).where(eq(transactionsTable.id, id));

  // Update user balance for deposits
  if (tx.type === "deposit") {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, tx.userId)).limit(1);
    if (user) {
      await db.update(usersTable).set({ balance: user.balance + tx.amount }).where(eq(usersTable.id, tx.userId));
    }
  } else if (tx.type === "withdraw") {
    // For withdrawals, deduct on approve
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, tx.userId)).limit(1);
    if (user && user.balance >= tx.amount) {
      await db.update(usersTable).set({ balance: user.balance - tx.amount }).where(eq(usersTable.id, tx.userId));
    }
  }

  req.log.info({ txId: id }, "Transaction approved");
  res.json({ success: true });
});

router.put("/admin/transactions/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id)).limit(1);
  if (!tx) { res.status(404).json({ error: "Not found" }); return; }
  if (tx.status !== "pending") { res.status(409).json({ error: "Already processed" }); return; }

  await db.update(transactionsTable).set({ status: "rejected", adminNote: req.body.note ?? null }).where(eq(transactionsTable.id, id));

  req.log.info({ txId: id }, "Transaction rejected");
  res.json({ success: true });
});

router.patch("/admin/users/:id/balance", requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  const { balance } = req.body;
  if (isNaN(id) || balance == null) { res.status(400).json({ error: "Invalid" }); return; }

  const [user] = await db.update(usersTable).set({ balance: Number(balance) }).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ success: true, balance: user.balance });
});

// POST /api/admin/broadcast — push real-time notification to ALL connected sockets
router.post("/admin/broadcast", requireAdmin, async (req, res): Promise<void> => {
  const { title, body } = req.body as { title?: string; body?: string };
  if (!title?.trim() || !body?.trim()) {
    res.status(400).json({ error: "title and body are required" });
    return;
  }
  const io = getIo();
  if (io) {
    io.emit("admin:broadcast", { title: title.trim(), body: body.trim(), ts: Date.now() });
  }
  req.log.info({ title }, "Admin broadcast sent");
  res.json({ success: true, connectedSockets: io?.sockets.sockets.size ?? 0 });
});

export default router;
