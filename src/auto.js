// Auto-mounting entry, built into dist/singularity.js: load it with
// <script type="module"> on a page whose anchor is marked data-singularity
// (and, optionally, whose frame is marked data-singularity-clip). The handle
// is kept on window.singularity, so the console can call
// window.singularity.destroy().
import { mount } from './main.js';

const go = () => { window.singularity = mount(); };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true });
else go();
