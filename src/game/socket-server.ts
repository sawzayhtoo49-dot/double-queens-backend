// Socket.io real-time game server
import { Server as IOServer, type Socket } from "socket.io";
import type { Server as HttpServer } from "http";

import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  createDefaultRooms, getRoom, getAllRooms, joinRoom, leaveRoom,
  leaveAllRooms, placeBet, addChat, rooms,
  type PlayerInRoom,
} from "./room-manager";
import { dealBaccarat, calcPayout } from "./baccarat";
import { logger } from "../lib/logger";

const BETTING_SECONDS = 20;
const DEAL_DELAY_MS = 3000;
const RESULT_DISPLAY_MS = 5000;

function broadcastRooms(io: IOServer) {
  io.emit("rooms:update", getAllRooms());
}

function startRound(io: IOServer, roomId: string) {
  const room = getRoom(roomId);
  if (!room) return;
  if (room.timerRef) clearInterval(room.timerRef);

  // Reset bets
  for (const p of room.players.values()) p.bet = undefined;

  room.phase = "betting";
  room.countdown = BETTING_SECONDS;
  room.roundNum++;

  io.to(roomId).emit("room:phase", { phase: "betting", countdown: BETTING_SECONDS, roundNum: room.roundNum });
  broadcastRooms(io);

  let elapsed = 0;
  room.timerRef = setInterval(() => {
    elapsed++;
    room.countdown = BETTING_SECONDS - elapsed;
    io.to(roomId).emit("room:countdown", { countdown: room.countdown });

    if (elapsed >= BETTING_SECONDS) {
      clearInterval(room.timerRef);
      dealPhase(io, roomId);
    }
  }, 1000);
}

async function dealPhase(io: IOServer, roomId: string) {
  const room = getRoom(roomId);
  if (!room) return;

  room.phase = "dealing";
  io.to(roomId).emit("room:phase", { phase: "dealing", countdown: 0 });
  broadcastRooms(io);

  await new Promise((r) => setTimeout(r, DEAL_DELAY_MS));

  const result = dealBaccarat();
  room.lastResult = result;
  room.phase = "result";

  // Calculate payouts and update balances
  const payouts: { userId: number; username: string; bet?: { side: string; amount: number }; payout: number; newBalance?: number }[] = [];

  for (const player of room.players.values()) {
    let payout = 0;
    if (player.bet) {
      payout = calcPayout(player.bet.side, result.winner, player.bet.amount);
      player.balance += payout;
      // Update DB balance
      try {
        await db.update(usersTable).set({ balance: player.balance }).where(eq(usersTable.id, player.userId));
      } catch (e) {
        logger.error({ e }, "Failed to update balance");
      }
    }
    payouts.push({ userId: player.userId, username: player.username, bet: player.bet, payout, newBalance: player.balance });
    // Notify individual player
    io.to(player.socketId).emit("player:payout", { payout, newBalance: player.balance });
  }

  io.to(roomId).emit("room:result", { result, payouts });
  io.to(roomId).emit("room:phase", { phase: "result", countdown: 0 });
  broadcastRooms(io);

  // Wait then start next round
  await new Promise((r) => setTimeout(r, RESULT_DISPLAY_MS));
  if ((getRoom(roomId)?.players.size ?? 0) > 0) {
    startRound(io, roomId);
  } else {
    const r2 = getRoom(roomId);
    if (r2) { r2.phase = "waiting"; broadcastRooms(io); }
  }
}

let _io: IOServer | null = null;
export function getIo(): IOServer | null { return _io; }

export function initSocketServer(httpServer: HttpServer): IOServer {
  createDefaultRooms();

  const io = new IOServer(httpServer, {
    cors: { origin: "*" },
    path: "/api/socket.io",
  });
  _io = io;

  io.on("connection", (socket: Socket) => {
    logger.info({ socketId: socket.id }, "Socket connected");

    // Authenticate via token
    let authedUser: { id: number; name: string; balance: number } | null = null;

    socket.on("auth", async (token: string) => {
      try {
        const [user] = await db.select().from(usersTable).where(eq(usersTable.token, token));
        if (!user) { socket.emit("auth:error", "Invalid token"); return; }
        authedUser = { id: user.id, name: user.name, balance: user.balance };
        socket.emit("auth:ok", { id: user.id, name: user.name, balance: user.balance });
        socket.emit("rooms:update", getAllRooms());
      } catch { socket.emit("auth:error", "Server error"); }
    });

    socket.on("rooms:list", () => {
      socket.emit("rooms:update", getAllRooms());
    });

    socket.on("room:join", (roomId: string) => {
      if (!authedUser) { socket.emit("error", "Not authenticated"); return; }
      const room = getRoom(roomId);
      if (!room) { socket.emit("error", "Room not found"); return; }

      const player: PlayerInRoom = {
        userId: authedUser.id,
        username: authedUser.name,
        socketId: socket.id,
        balance: authedUser.balance,
      };
      joinRoom(roomId, player);
      socket.join(roomId);
      socket.data.roomId = roomId;

      // Send current room state
      socket.emit("room:joined", {
        roomId,
        phase: room.phase,
        countdown: room.countdown,
        roundNum: room.roundNum,
        lastResult: room.lastResult,
        chat: room.chat.slice(-20),
        playerCount: room.players.size,
      });

      io.to(roomId).emit("room:players", { count: room.players.size });
      broadcastRooms(io);

      // Start if first player
      if (room.players.size === 1 && room.phase === "waiting") {
        startRound(io, roomId);
      }
    });

    socket.on("room:leave", () => {
      const roomId = socket.data.roomId;
      if (roomId) {
        leaveRoom(roomId, socket.id);
        socket.leave(roomId);
        io.to(roomId).emit("room:players", { count: getRoom(roomId)?.players.size ?? 0 });
        broadcastRooms(io);
      }
    });

    socket.on("bet:place", ({ side, amount }: { side: string; amount: number }) => {
      const roomId = socket.data.roomId;
      if (!roomId || !authedUser) return;
      const ok = placeBet(roomId, socket.id, side as any, amount);
      if (ok) {
        authedUser.balance -= amount;
        socket.emit("bet:confirmed", { side, amount });
        const room = getRoom(roomId);
        const bets = Array.from(room?.players.values() ?? []).map((p) => ({
          username: p.username,
          bet: p.bet,
        }));
        io.to(roomId).emit("room:bets", { bets });
      } else {
        socket.emit("bet:rejected", { reason: "Invalid bet" });
      }
    });

    socket.on("chat:send", ({ text }: { text: string }) => {
      const roomId = socket.data.roomId;
      if (!roomId || !authedUser || !text?.trim()) return;
      const msg = { userId: authedUser.id, username: authedUser.name, text: text.slice(0, 120), ts: Date.now() };
      addChat(roomId, msg);
      io.to(roomId).emit("chat:message", msg);
    });

    socket.on("disconnect", () => {
      const roomIds = leaveAllRooms(socket.id);
      for (const roomId of roomIds) {
        const room = getRoom(roomId);
        io.to(roomId).emit("room:players", { count: room?.players.size ?? 0 });
      }
      broadcastRooms(io);
      logger.info({ socketId: socket.id }, "Socket disconnected");
    });
  });

  return io;
}
