import { Router, type IRouter } from "express";
import { getAllRooms } from "../game/room-manager";

const router: IRouter = Router();

router.get("/games/rooms", (req, res): void => {
  res.json(getAllRooms());
});

export default router;
