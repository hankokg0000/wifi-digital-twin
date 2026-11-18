import { useEffect } from 'react';
import { connectSensing } from './sensingStore';

/** Renders nothing; mount once near the app root so detection keeps running in every mode. */
export function SensingDriver(): null {
  useEffect(() => connectSensing(), []);
  return null;
}
