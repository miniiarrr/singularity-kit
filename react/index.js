// React binding: <Singularity mode="hole">{fallback}</Singularity> renders
// the anchor (a div marked data-singularity; its children are the drawing
// shown without WebGL), mounts the scene on it once it is in the DOM and
// destroys the scene when it unmounts or its props change. Import the
// stylesheet once: import '@miniiarrr/singularity/singularity.css'.
//
// `clip` may be an element, a ref object or a selector; leave it out to use
// the element marked data-singularity-clip, pass null for no clip.
import { createElement, useEffect, useRef } from 'react';
import { mount } from '../src/main.js';

const resolve = (x) => (x && typeof x === 'object' && 'current' in x ? x.current : x);

export function Singularity({ mode = 'full', clip, colors, from, at, children, ...props }) {
  const ref = useRef(null);
  const { ink, red, paper } = colors || {};
  useEffect(() => {
    const options = { mode, anchor: ref.current, colors: { ink, red, paper }, from, at };
    if (clip !== undefined) options.clip = resolve(clip);
    const scene = mount(options);
    return () => scene.destroy();
  }, [mode, clip, ink, red, paper, from, at]);
  return createElement('div', { ref, 'data-singularity': '', 'data-singularity-mode': mode, ...props }, children);
}
