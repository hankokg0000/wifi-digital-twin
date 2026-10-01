import { addZone } from '../../core';
import { createPolygonTool } from './polygonTool';

export const zoneTool = createPolygonTool('zone-polygon', (levelId, polygon) => (d) => addZone(d, { levelId, polygon }));
