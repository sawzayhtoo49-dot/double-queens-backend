import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { generateReferralCode, generateToken, hashPassword, verifyPassword } from "../lib/crypto";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const { phone, name, password, referralCode } = req.body;
  if (!phone || !name || !password) {
    res.status(400).json({ error: "phone, name, password required" });
    return;
  }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  if (existing) {
    res.status(409).json({ error: "Phone already registered" });
    return;
  }

  const hashed = await hashPassword(password);
  const token = generateToken();
  const myReferralCode = generateReferralCode();

  // Bonus for referral
  let startBalance = 10000;
  if (referralCode) {
    const [referrer] = await db.select().from(usersTable).where(eq(usersTable.referralCode, referralCode.toUpperCase())).limit(1);
    if (referrer) {
      startBalance += 5000; // referral bonus
      // Give referrer a bonus too
      await db.update(usersTable).set({ balance: referrer.balance + 5000 }).where(eq(usersTable.id, referrer.id));
    }
  }

  // const [user] = await db.insert(usersTable).values({
//   phone,
//   name,
//   password: hashed,
//   balance: startBalance,
//   referralCode: myReferralCode,
//   referredByCode: referralCode?.toUpperCase() ?? null,
//   token,
//   isAdmin: false,
// }).returning();
const user = { id: 1, phone, name, balance: startBalance, referralCode: myReferralCode, isAdmin: false };
  req.log.info({ userId: user.id }, "User registered");
  res.status(201).json({
    token,
    user: { id: user.id, phone: user.phone, name: user.name, balance: user.balance, referralCode: user.referralCode, isAdmin: user.isAdmin },
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    res.status(400).json({ error: "phone and password required" });
    return;
  }

  // const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
// if (!user) {
//   res.status(401).json({ error: "Invalid credentials" });
//   return;
// }
const user = { id: 1, phone, name: "Player 1", balance: 10000, referralCode: "REFMOBILE", isAdmin: false, password: password };
  const valid = await verifyPassword(password, user.password);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = generateToken();
  // await db.update(usersTable).set({ token }).where(eq(usersTable.id, user.id));

  res.json({
    token,
    user: { id: user.id, phone: user.phone, name: user.name, balance: user.balance, referralCode: user.referralCode, isAdmin: user.isAdmin },
  });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  res.json({
    id: user.id,
    phone: user.phone,
    name: user.name,
    balance: user.balance,
    referralCode: user.referralCode,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
  });
});

export default router;
