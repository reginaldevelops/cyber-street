/** Linear scale — 2× per axis = 4× world area (40→80 plaza). */
export const WORLD_SCALE = 2

const BASE_PLAZA_HALF = 20

export const PLAZA_HALF = BASE_PLAZA_HALF * WORLD_SCALE
export const PLAZA_SIZE = PLAZA_HALF * 2

/** Scale layout distances (offsets, spacing, tile size). */
export const ws = (n: number) => n * WORLD_SCALE

export const STREET_INNER = PLAZA_HALF + ws(0.5)
export const STREET_OUTER = PLAZA_HALF + ws(6.5)
export const STREET_MID = (STREET_INNER + STREET_OUTER) / 2
export const STREET_W = STREET_OUTER - STREET_INNER

export const SHOP_INSET = PLAZA_HALF - ws(1.5)

export const PERIM_INNER = PLAZA_HALF + ws(7)
export const PERIM_OUTER = PLAZA_HALF + ws(13)
export const SKYLINE_NEAR = PLAZA_HALF + ws(16)
export const SKYLINE_FAR = PLAZA_HALF + ws(38)

export const PLAYER_BOUNDARY_INSET = ws(2.5)
export const TILE_SIZE = ws(3.2)

export const ISO_FRUSTUM = 34 * WORLD_SCALE
export const ISO_CAM_OFFSET = 26 * WORLD_SCALE
