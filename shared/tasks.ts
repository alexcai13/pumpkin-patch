/**
 * FARMER TASKS — small shared goals the farmer hands out. Both players work
 * on the same task together; when it's done you each get `reward` tickets
 * and the farmer comes up with a new one.
 *
 * To add a task: add it here, then call `room.farmer.progress("<id>")` from
 * the activity that should count it (see server/src/rooms/activities/).
 */
export interface FarmerTask {
  id: string;
  /** What the farmer says. */
  text: string;
  /** How many times it must happen. */
  goal: number;
  reward: number;
}

export const FARMER_TASKS: FarmerTask[] = [
  { id: "pumpkins", text: "Could you bring me 5 pumpkins from the field? Just pick 'em and hand 'em to me.", goal: 5, reward: 10 },
  { id: "hayride", text: "Take a hayride around the patch — best views on the farm!", goal: 1, reward: 6 },
  { id: "carve", text: "My porch looks bare. Carve me a jack-o'-lantern, would ya?", goal: 1, reward: 6 },
  { id: "minigame", text: "Go play a game over in the minigame corner. Any game!", goal: 1, reward: 6 },
  { id: "cider", text: "Take a break — sit on a bench by the cider stand.", goal: 1, reward: 5 },
  { id: "crow", text: "That pesky crow keeps stealing pumpkins! Chase it off for me.", goal: 1, reward: 8 },
  { id: "photo", text: "Snap a photo strip in the booth to remember the day!", goal: 1, reward: 6 },
  { id: "note", text: "Leave each other a note on the note board by the cider stand.", goal: 1, reward: 6 },
];

export const FARMER_NAME = "Farmer Hollis";
