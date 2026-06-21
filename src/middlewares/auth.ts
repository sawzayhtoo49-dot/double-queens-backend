import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { type NextFunction, type Request, type Response } from "express";

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.token, token)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  (req as any).user = user;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, async () => {
    const user = (req as any).user;
    if (!user?.isAdmin) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  });
}
