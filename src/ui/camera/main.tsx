import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans-thai/400.css';
import '@fontsource/ibm-plex-sans-thai/500.css';
import '@fontsource/ibm-plex-sans-thai/600.css';
import '@fontsource/ibm-plex-mono/500.css';
import { CameraHome } from './RoomMonitor';
import '../theme/base.css';
import '../shell/topbar.css';
import './camera.css';

const root = document.getElementById('root');
if (!root) throw new Error('Camera viewer root is missing');
createRoot(root).render(<CameraHome />);
