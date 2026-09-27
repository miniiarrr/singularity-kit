import type { HTMLAttributes, ReactElement, ReactNode, RefObject } from 'react';
import type { Colors, Mode } from '../index.js';

export interface SingularityProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Which animation plays; default `'full'`. */
  mode?: Mode;
  /** The element the scene stays inside while behind the page: an element, a ref to one, or a selector. Omit for `[data-singularity-clip]`, `null` for none. */
  clip?: Element | RefObject<Element | null> | string | null;
  colors?: Partial<Colors>;
  /** Scene time to start from, seconds (see `MountOptions.from`). */
  from?: number;
  /** Scene time to freeze at, seconds. */
  at?: number;
  /** The fallback drawing, shown without WebGL. */
  children?: ReactNode;
}

/** The anchor `<div data-singularity>` with the scene mounted on it; remounts when `mode`, `clip`, `colors`, `from` or `at` change. */
export function Singularity(props: SingularityProps): ReactElement;
