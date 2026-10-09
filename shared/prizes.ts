/**
 * PRIZE STAND catalog — edit prices / add items here (server + client both use it).
 *
 * - "hat" prizes are worn on your head.
 * - "pumpkin" prizes recolor the pumpkins you carry and your carved
 *   jack-o'-lanterns on the porch.
 * Art for each id: client/src/game/art/cosmetics.ts.
 */
export type PrizeKind = "hat" | "pumpkin";

export interface Prize {
  id: string;
  kind: PrizeKind;
  name: string;
  cost: number;
}

export const PRIZES: Prize[] = [
  { id: "leafcrown", kind: "hat", name: "Leaf Crown", cost: 10 },
  { id: "flowercrown", kind: "hat", name: "Flower Crown", cost: 12 },
  { id: "pumpkincap", kind: "hat", name: "Pumpkin Cap", cost: 15 },
  { id: "strawhat", kind: "hat", name: "Straw Hat", cost: 18 },
  { id: "witchhat", kind: "hat", name: "Witch Hat", cost: 22 },
  { id: "tophat", kind: "hat", name: "Top Hat", cost: 28 },
  { id: "white", kind: "pumpkin", name: "Ghost-White Pumpkins", cost: 10 },
  { id: "green", kind: "pumpkin", name: "Green Pumpkins", cost: 12 },
  { id: "blue", kind: "pumpkin", name: "Blue Pumpkins", cost: 15 },
  { id: "purple", kind: "pumpkin", name: "Purple Pumpkins", cost: 18 },
  { id: "gold", kind: "pumpkin", name: "Golden Pumpkins", cost: 35 },
];

/** Everyone starts with plain orange pumpkins (free, always owned). */
export const DEFAULT_PUMPKIN = "orange";

export const prizeById = (id: string) => PRIZES.find((p) => p.id === id);
