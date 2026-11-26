import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans-thai/400.css';
import '@fontsource/ibm-plex-sans-thai/500.css';
import '@fontsource/ibm-plex-sans-thai/600.css';
import '@fontsource/ibm-plex-mono/500.css';
import '../theme/base.css';
import '../shell/topbar.css';
import '../camera/camera.css';
import './indoor.css';
import { IndoorSite } from './IndoorSite';

const root = document.getElementById('root');
if (!root) throw new Error('Indoor Twin root is missing');
createRoot(root).render(<IndoorSite />);
