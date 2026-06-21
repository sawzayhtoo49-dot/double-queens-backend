import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import transactionsRouter from "./transactions";
import adminRouter from "./admin";
import lotteryResultsRouter from "./lottery-results";
import gamesRouter from "./games";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(transactionsRouter);
router.use(adminRouter);
router.use(lotteryResultsRouter);
router.use(gamesRouter);

export default router;
