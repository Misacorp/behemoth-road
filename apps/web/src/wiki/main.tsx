import { render } from 'preact';
import { Wiki } from './Wiki.tsx';

const root = document.getElementById('wiki');
if (root) render(<Wiki />, root);
