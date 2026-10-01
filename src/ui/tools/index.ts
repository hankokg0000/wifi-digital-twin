import type { Tool } from '../store';
import type { ToolHandler } from './types';
import { selectTool } from './selectTool';
import { wallTool } from './wallTool';
import { doorTool, windowTool } from './openingTool';
import { roomTool } from './roomTool';
import { objectTool } from './objectTool';
import { apTool } from './apTool';
import { zoneTool } from './zoneTool';

export type { ToolContext, ToolHandler } from './types';
export { toolContextFromStore } from './context';
export { useSelectDrag } from './selectTool';
export type { DragState } from './selectTool';

export const TOOL_HANDLERS: Record<Tool, ToolHandler> = {
  select: selectTool,
  wall: wallTool,
  door: doorTool,
  window: windowTool,
  room: roomTool,
  object: objectTool,
  ap: apTool,
  zone: zoneTool,
};
