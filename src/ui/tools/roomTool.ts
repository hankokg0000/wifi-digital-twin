import { addRoom } from '../../core';
import { createPolygonTool } from './polygonTool';

export const roomTool = createPolygonTool('room-polygon', (levelId, polygon) => (d) => addRoom(d, { levelId, polygon }));
