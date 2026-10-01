import type { ValidationIssue } from '../types';

/** Thrown by `parse` when the input is not valid JSON, not shaped like a SceneDoc, or fails validation. */
export class SceneParseError extends Error {
  issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[]) {
    super(message);
    this.name = 'SceneParseError';
    this.issues = issues;
  }
}

export function fail(message: string): never {
  throw new SceneParseError(message, [{ path: '$', message }]);
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function isVec2(v: unknown): v is [number, number] {
  return Array.isArray(v) && v.length === 2 && isFiniteNumber(v[0]) && isFiniteNumber(v[1]);
}

export function isVec3(v: unknown): v is [number, number, number] {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    isFiniteNumber(v[0]) &&
    isFiniteNumber(v[1]) &&
    isFiniteNumber(v[2])
  );
}

export function isString(v: unknown): v is string {
  return typeof v === 'string';
}

export function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

export function isBand(v: unknown): v is '2.4' | '5' {
  return v === '2.4' || v === '5';
}
