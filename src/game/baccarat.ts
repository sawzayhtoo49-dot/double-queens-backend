// Baccarat game engine — open-source inspired (MIT-compatible logic)
// Standard Punto Banco rules

export type Suit = "♠" | "♥" | "♦" | "♣";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

export interface Card {
  rank: Rank;
  suit: Suit;
  value: number; // 0-9
}

export type BetSide = "player" | "banker" | "tie";

export interface BaccaratResult {
  playerHand: Card[];
  bankerHand: Card[];
  playerScore: number;
  bankerScore: number;
  winner: BetSide;
  playerNatural: boolean;
  bankerNatural: boolean;
}

const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];

const CARD_VALUES: Record<Rank, number> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  "10": 0, J: 0, Q: 0, K: 0,
};

function buildShoe(decks = 8): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        shoe.push({ rank, suit, value: CARD_VALUES[rank] });
      }
    }
  }
  // Fisher-Yates shuffle
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

function handScore(hand: Card[]): number {
  return hand.reduce((s, c) => (s + c.value) % 10, 0);
}

export function dealBaccarat(): BaccaratResult {
  const shoe = buildShoe(1); // 1 deck for speed
  let idx = 0;
  const draw = () => shoe[idx++];

  const playerHand: Card[] = [draw(), draw()];
  const bankerHand: Card[] = [draw(), draw()];

  let pScore = handScore(playerHand);
  let bScore = handScore(bankerHand);

  const playerNatural = pScore >= 8;
  const bankerNatural = bScore >= 8;

  if (!playerNatural && !bankerNatural) {
    // Player third card rule
    let playerThird: Card | null = null;
    if (pScore <= 5) {
      playerThird = draw();
      playerHand.push(playerThird);
      pScore = handScore(playerHand);
    }

    // Banker third card rule
    if (playerThird === null) {
      if (bScore <= 5) {
        bankerHand.push(draw());
        bScore = handScore(bankerHand);
      }
    } else {
      const ptv = playerThird.value;
      const shouldDraw =
        bScore <= 2 ||
        (bScore === 3 && ptv !== 8) ||
        (bScore === 4 && ptv >= 2 && ptv <= 7) ||
        (bScore === 5 && ptv >= 4 && ptv <= 7) ||
        (bScore === 6 && ptv >= 6 && ptv <= 7);
      if (shouldDraw) {
        bankerHand.push(draw());
        bScore = handScore(bankerHand);
      }
    }
  }

  let winner: BetSide;
  if (pScore > bScore) winner = "player";
  else if (bScore > pScore) winner = "banker";
  else winner = "tie";

  return {
    playerHand,
    bankerHand,
    playerScore: pScore,
    bankerScore: bScore,
    winner,
    playerNatural,
    bankerNatural,
  };
}

export function calcPayout(bet: BetSide, winner: BetSide, amount: number): number {
  if (bet !== winner) return -amount;
  if (bet === "tie") return amount * 8;
  if (bet === "banker") return amount * 0.95; // 5% commission
  return amount; // player pays 1:1
}
