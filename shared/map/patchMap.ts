/**
 * THE MAIN PUMPKIN PATCH MAP
 * ==========================
 * Edit this file to change the world. Both the server and the client read it,
 * so collisions always match what you see.
 *
 * The map has two parts:
 *
 * 1. `rows` — a grid of characters, one per 16x16 tile. Column numbers run
 *    left→right starting at 0, row numbers top→bottom (shown in the comment at
 *    the end of each line). Every row must be the same length.
 *    What each character means is defined in `legend.ts`:
 *
 *      .  grass            "  flowers / tall grass     =  dirt path
 *      _  packed dirt      :  tilled pumpkin soil      #  wooden porch floor
 *      L  bowling lane     ~  pond water (blocks)       T  tree (blocks)
 *      C  corn stalks (blocks)   h  hay bale (blocks)   p  decor pumpkin (blocks)
 *      j  jack-o'-lantern (blocks)
 *      -  fence (horizontal)   |  fence (vertical)   +  fence corner post
 *
 * 2. `props` — bigger things that span several tiles (farmhouse, stands,
 *    wagon...). Each prop has a top-left tile (x, y) and a size in tiles (w, h).
 *    `solid` says which of its tiles block walking:
 *       "all"  → every tile,  "none" → nothing (decoration you walk under),
 *       or an array of strings, one per row, where "x" = blocked and "." = open.
 *    The art for each prop `type` lives in client/src/game/art/props.ts.
 *    `label` is shown as a little sign caption in the world.
 */
import type { MapDef } from "./legend.js";

export const PATCH_MAP: MapDef = {
  rows: [
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT', // 0
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT', // 1
  'TT..................".............T...CCCCCCCCCCCCCCCCCCCCCCCCTT', // 2
  'TT.......................T...~~~~.."..CCCCCCCCCCCCCCCCCCCCCCCCTT', // 3
  'TT............."............~~~~~~..T.CCCCCCCCCCCCCCCCCCCCCCCCTT', // 4
  'TT.....................h..."~~~~~~....CCCCCCCCCCCCCCCCCCCCCCCCTT', // 5
  'TT............._________....~~~~~~..."CCCCCCCCCCCCCCCCCCCCCCCCTT', // 6
  'TT............h_________....~~~~~~....CCCCCCCCCCCCCCCCCCCCCCCCTT', // 7
  'TT###########p._________.T...~~~~...".CCCCCCCCCCCCCCCCCCCCCCCCTT', // 8
  'TT###########p.________p............T.CCCCCCCCCCCC==CCCCCCCCCCTT', // 9
  'TTj#########j.._________..............CCCCCCCCCCCC==CCCCCCCCCCTT', // 10
  'TT.....==......j".==..j.."............"..........j==j.........TT', // 11
  'TT============================================================TT', // 12
  'TT============================================================TT', // 13
  'TT..."........====...........j==j...h.".."....==.........T....TT', // 14
  'TT....T.......==...+----------==----------+...==........."..T.TT', // 15
  'TT..."..."."..==...|::::::::::==::::::::::|.".==."...~~~~.....TT', // 16
  'TT.......T"...==...|::::::::::==::::::::::|...==....~~~~~~....TT', // 17
  'TT........."."==...|::::::::::==::::::::::|...==."..~~~~~~....TT', // 18
  'TT............==...|::::::::::==::::::::::|...==....~~~~~~....TT', // 19
  'TT...T........==...|:::::::::....:::::::::|...==....~~~~~~....TT', // 20
  'TT..."........===============..."===============.....~~~~.....TT', // 21
  'TTT...........==...|:::::::::"...:::::::::|...==..............TT', // 22
  'TT......""T.".==...|::::::::::==::::::::::|...==..............TT', // 23
  'TT............==...|::::::::::==::::::::::|...==..T.......p...TT', // 24
  'TT......".....==...|::::::::::==::::::::::|...==.......T......TT', // 25
  'TT..T...T.....==...|::::::::::==::::::::::|...==..........hh..TT', // 26
  'TT............==...+----------==----------+...==......".......TT', // 27
  'TT........."..==...""........j==j."...........==..............TT', // 28
  'TT============================================================TT', // 29
  'TT============================================================TT', // 30
  'TT."......=.....=.....h..____________.."......=......=......."TT', // 31
  'TTh_LL_.".=.....=.."....h____________h.....p..=..p...=........TT', // 32
  'TT"_LL_.____....=...T...h____________...".....=......=.."...".TT', // 33
  'TT._LL_.____....=........____________h........=......=......".TT', // 34
  'TT._LL_.____..""=...."..._j_________j.....j_______j_____......TT', // 35
  'TT._LL_.____....=................"..".p...._______._____p.....TT', // 36
  'TT._LL_.....__________.........".................."......"....TT', // 37
  'TT._LL_"."..__________..................hh.".............h....TT', // 38
  'TT._LL_."......................".........."............"......TT', // 39
  'TT._LL_....h........"..T"..T.....T.....T....T...T.........T...TT', // 40
  'TT......................."....................................TT', // 41
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT', // 42
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT', // 43
  ],

  props: [
    // --- North-west: farmhouse + carving porch ---
    { id: "farmhouse", type: "farmhouse", x: 3, y: 2, w: 9, h: 6, solid: "all" },
    { id: "carve1", type: "carvingTable", x: 4, y: 9, w: 2, h: 1, solid: "all" },
    { id: "carve2", type: "carvingTable", x: 9, y: 9, w: 2, h: 1, solid: "all" },
    { id: "signPorch", type: "sign", x: 6, y: 11, w: 1, h: 1, solid: "all", label: "Carving Porch" },

    // --- North: cider stand + benches ---
    { id: "cider", type: "ciderStand", x: 17, y: 3, w: 4, h: 3, solid: "all" },
    { id: "bench1", type: "bench", x: 16, y: 8, w: 2, h: 1, solid: "all" },
    { id: "bench2", type: "bench", x: 21, y: 8, w: 2, h: 1, solid: "all" },
    { id: "signCider", type: "sign", x: 17, y: 11, w: 1, h: 1, solid: "all", label: "Cider Stand" },

    // --- North-east: corn maze entrance (the arch is decoration you walk under) ---
    { id: "mazeArch", type: "mazeArch", x: 49, y: 8, w: 4, h: 3, solid: "none" },
    { id: "signMaze", type: "sign", x: 48, y: 11, w: 1, h: 1, solid: "all", label: "Corn Maze" },

    // --- Center: pumpkin field + scarecrow post ---
    { id: "signField", type: "sign", x: 28, y: 14, w: 1, h: 1, solid: "all", label: "Pumpkin Field" },
    { id: "scarecrowPost", type: "scarecrowPost", x: 32, y: 20, w: 1, h: 1, solid: "all", label: "Scarecrow" },

    // --- South-west: minigame area ---
    { id: "signGames", type: "sign", x: 7, y: 31, w: 1, h: 1, solid: "all", label: "Minigames" },
    { id: "bowlingPins", type: "bowlingPins", x: 4, y: 32, w: 2, h: 1, solid: "all" },
    { id: "appleBarrel", type: "appleBarrel", x: 9, y: 34, w: 2, h: 2, solid: "all" },
    { id: "tossFlag1", type: "tossFlag", x: 15, y: 36, w: 1, h: 1, solid: "none" },
    { id: "tossFlag2", type: "tossFlag", x: 18, y: 36, w: 1, h: 1, solid: "none" },
    { id: "tossFlag3", type: "tossFlag", x: 21, y: 36, w: 1, h: 1, solid: "none" },

    // --- South-middle: hayride wagon stop ---
    { id: "wagon", type: "wagon", x: 29, y: 32, w: 4, h: 2, solid: "all" },
    { id: "signHayride", type: "sign", x: 27, y: 31, w: 1, h: 1, solid: "all", label: "Hayride" },

    // --- South-east: ticket/prize stand + photo booth ---
    { id: "prizeStand", type: "prizeStand", x: 44, y: 32, w: 5, h: 3, solid: "all" },
    { id: "signPrizes", type: "sign", x: 45, y: 31, w: 1, h: 1, solid: "all", label: "Tickets & Prizes" },
    // The booth is a frame you step INTO: back wall + two side posts are solid.
    { id: "photoBooth", type: "photoBooth", x: 52, y: 32, w: 3, h: 3, solid: ["xxx", "x.x", "x.x"] },
    { id: "signPhoto", type: "sign", x: 55, y: 32, w: 1, h: 1, solid: "all", label: "Photo Booth" },
  ],

  /** Where players appear when they join (tile coordinates). Player 1 gets the first. */
  spawns: [
    { x: 29, y: 30 },
    { x: 32, y: 30 },
  ],
};
