import type { SceneDoc, Id, Level, Wall, ValidationIssue } from '../types';
import { validateDoc } from '../validate';

/** Thrown by any op when the input is invalid or would leave the doc in an invalid state. */
export class SceneOpError extends Error {
  issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[] = []) {
    super(message);
    this.name = 'SceneOpError';
    this.issues = issues;
  }
}

/** Validate `next`; throw SceneOpError if it introduces any issues, otherwise return it. */
export function checked(next: SceneDoc): SceneDoc {
  const issues = validateDoc(next);
  if (issues.length > 0) {
    throw new SceneOpError(`operation would produce an invalid document (${issues.length} issue(s))`, issues);
  }
  return next;
}

export function requireLevel(doc: SceneDoc, levelId: Id): Level {
  const level = doc.levels.find((l) => l.id === levelId);
  if (!level) throw new SceneOpError(`level "${levelId}" not found`);
  return level;
}

export function requireWall(doc: SceneDoc, wallId: Id): Wall {
  const wall = doc.walls.find((w) => w.id === wallId);
  if (!wall) throw new SceneOpError(`wall "${wallId}" not found`);
  return wall;
}

export function requireEntity<T extends { id: Id }>(list: T[], id: Id, kind: string): T {
  const entity = list.find((x) => x.id === id);
  if (!entity) throw new SceneOpError(`${kind} "${id}" not found`);
  return entity;
}
