// Live game room manager — in-memory, single process
import type { BetSide, BaccaratResult } from "./baccarat";

export type GamePhase = "betting" | "dealing" | "result" | "waiting";
export type GameType = "baccarat" | "slots";

export interface PlayerInRoom {
  userId: number;
  username: string;
  socketId: string;
  balance: number;
  bet?: { side: BetSide; amount: number };
}

export interface ChatMessage {
  userId: number;
  username: string;
  text: string;
  ts: number;
}

export interface GameRoom {
  id: string;
  name: string;
  type: GameType;
  phase: GamePhase;
  players: Map<string, PlayerInRoom>; // socketId → player
  minBet: number;
  maxBet: number;
  lastResult?: BaccaratResult;
  countdown: number; // seconds left in betting phase
  roundNum: number;
  chat: ChatMessage[];
  timerRef?: ReturnType<typeof setInterval>;
}

export interface RoomSummary {
  id: string;
  name: string;
  type: GameType;
  phase: GamePhase;
  playerCount: number;
  minBet: number;
  maxBet: number;
  roundNum: number;
}

const rooms = new Map<string, GameRoom>();

export function createDefaultRooms() {
  const defaults: Omit<GameRoom, "players" | "chat" | "roundNum" | "countdown">[] = [
    { id: "bac-vip", name: "VIP Baccarat", type: "baccarat", phase: "waiting", minBet: 5000, maxBet: 500000, lastResult: undefined },
    { id: "bac-classic", name: "Classic Baccarat", type: "baccarat", phase: "waiting", minBet: 1000, maxBet: 100000, lastResult: undefined },
    { id: "bac-speed", name: "Speed Baccarat", type: "baccarat", phase: "waiting", minBet: 500, maxBet: 50000, lastResult: undefined },
    { id: "slots-gold", name: "Gold Slots", type: "slots", phase: "waiting", minBet: 100, maxBet: 10000, lastResult: undefined },
  ];
  for (const d of defaults) {
    rooms.set(d.id, { ...d, players: new Map(), chat: [], roundNum: 0, countdown: 0 });
  }
}

export function getRoom(id: string): GameRoom | undefined {
  return rooms.get(id);
}

export function getAllRooms(): RoomSummary[] {
  return Array.from(rooms.values()).map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    phase: r.phase,
    playerCount: r.players.size,
    minBet: r.minBet,
    maxBet: r.maxBet,
    roundNum: r.roundNum,
  }));
}

export function joinRoom(roomId: string, player: PlayerInRoom): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;
  room.players.set(player.socketId, player);
  return true;
}

export function leaveRoom(roomId: string, socketId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  room.players.delete(socketId);
}

export function leaveAllRooms(socketId: string): string[] {
  const left: string[] = [];
  for (const [id, room] of rooms) {
    if (room.players.has(socketId)) {
      room.players.delete(socketId);
      left.push(id);
    }
  }
  return left;
}

export function placeBet(roomId: string, socketId: string, side: BetSide, amount: number): boolean {
  const room = rooms.get(roomId);
  if (!room || room.phase !== "betting") return false;
  const player = room.players.get(socketId);
  if (!player) return false;
  if (amount < room.minBet || amount > room.maxBet) return false;
  if (player.balance < amount) return false;
  player.bet = { side, amount };
  return true;
}

export function addChat(roomId: string, msg: ChatMessage): void {
  const room = rooms.get(roomId);
  if (!room) return;
  room.chat.push(msg);
  if (room.chat.length > 50) room.chat.shift();
}

export { rooms };
