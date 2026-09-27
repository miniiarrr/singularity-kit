// Types for @miniiarrr/singularity (the same for the source entry and ./bundle).

/** Which animation plays. */
export type Mode =
  /** The whole story: the galaxy collapses, explodes, a black hole is born, the camera flies in, the surfer rides. */
  | 'full'
  /** The galaxy alone, turning slowly for as long as the page is open; the stars part for the pointer. */
  | 'galaxy'
  /** The black hole alone, from its birth: the gas condenses around it, the surfer gathers and rides. */
  | 'hole';

/** The palette, as #rrggbb. */
export interface Colors {
  /** The dots. */
  ink: string;
  /** The accents: hot gas, the board, the flash. */
  red: string;
  /** The page background; used where the surfer crosses the shadow. */
  paper: string;
}

export interface MountOptions {
  /** Default: the anchor's `data-singularity-mode` attribute, then `'full'`. `?mode=` in the page URL overrides it. */
  mode?: Mode;
  /** The square box the scene is centred on and scaled by. Element or selector; default `'[data-singularity]'`. */
  anchor?: Element | string;
  /** The element the scene stays inside while behind the page. Element, selector, or `null` for none; default `'[data-singularity-clip]'`. */
  clip?: Element | string | null;
  /** Overrides for the palette; defaults come from `data-singularity-ink|red|paper` on the anchor, then the brand colours. */
  colors?: Partial<Colors>;
  /**
   * Scene time to start playing from, in seconds on the kit's one timeline (`T`).
   * Values before the mode's start are clamped to it. `{ mode: 'hole', from: 16.5 }` skips the birth.
   * `?from=` in the page URL overrides it.
   */
  from?: number;
  /** Scene time to freeze at, in seconds (the pointer still works). `?at=` in the page URL overrides it. */
  at?: number;
}

export interface Singularity {
  /** The canvas, or `null` when the scene could not start (the fallback is shown and a `singularity:` warning logged). */
  canvas: HTMLCanvasElement | null;
  /** The mode that is running, or `null` when it could not start. */
  mode: Mode | null;
  /** Stops the loop, removes every listener, frees the GPU resources and the canvas, shows the fallback. */
  destroy(): void;
}

/** Starts the scene. Call it once the anchor is in the DOM; one instance per page. */
export function mount(options?: MountOptions): Singularity;

/** The brand palette: ink `#17160F`, red `#C63A1C`, paper `#EAE6DA`. */
export const COLORS: Colors;

/** What each mode is on the timeline: where its clock starts, its reduced-motion frame, when the canvas is in front, which layers it draws. */
export interface ModeSpec {
  start: number;
  still: number;
  front: [number, number] | null;
  galaxy: boolean;
  hole: boolean;
}
export const MODES: Record<Mode, ModeSpec>;

/** The timeline, in seconds of scene time. */
export const T: {
  fadeIn: number;
  collapse: number;
  implode: number;
  front: number;
  bang: number;
  birth: number;
  flyStart: number;
  settle: number;
  flyEnd: number;
  surfer: number;
  still: number;
};
