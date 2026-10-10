import { PATCH_MAP } from "../../../../../shared/map/patchMap";
import type { WorldContext } from "../WorldContext";
import { inRect } from "../Interactions";

const BOARD = PATCH_MAP.props.find((p) => p.id === "noteBoard")!;

/** E at the note board opens the NoteBoard screen. */
export class NoteView {
  constructor(ctx: WorldContext) {
    // Registered before SignView, so E here opens the board instead of just reading it.
    ctx.interactions.add((c) => {
      if (!inRect(c.faceX, c.faceY, BOARD)) return null;
      return {
        label: "Note Board",
        use: () => {
          ctx.setUiOpen(true);
          ctx.scene.scene.launch("NoteBoard", { onClose: () => ctx.setUiOpen(false) });
        },
      };
    });
  }
}
