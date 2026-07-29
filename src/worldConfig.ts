/** Plaza hub — fixed size (not scaled). */
export const PLAZA_HALF = 20
export const PLAZA_SIZE = PLAZA_HALF * 2

export const STREET_INNER = PLAZA_HALF + 0.5
export const STREET_OUTER = PLAZA_HALF + 6.5
export const STREET_MID = (STREET_INNER + STREET_OUTER) / 2
export const STREET_W = STREET_OUTER - STREET_INNER

export const SHOP_INSET = PLAZA_HALF - 1.5
export const PERIM_INNER = PLAZA_HALF + 7
export const PERIM_OUTER = PLAZA_HALF + 13
export const SKYLINE_NEAR = PLAZA_HALF + 16
export const SKYLINE_FAR = PLAZA_HALF + 38

/** SimCity-style grid extends beyond plaza ring. */
export const CITY_HALF = 78
export const PLAZA_EXCLUDE = STREET_OUTER + 1

export const PLAYER_BOUNDARY_INSET = 2.5
export const TILE_SIZE = 3.2

/** Identity — kept so plaza modules need no churn. */
export const ws = (n: number) => n

export const ISO_FRUSTUM = 46
export const ISO_CAM_OFFSET = 30
