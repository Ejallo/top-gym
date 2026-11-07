import type { Category } from './db';

/** Sections besides muscle groups, in filter order. Stretch and yoga are "mobility": hold-timer work. */
export const CATEGORIES: Category[] = ['stretch', 'yoga', 'rehab'];

export const isCategory = (x: string): x is Category => (CATEGORIES as string[]).includes(x);

/** Stretching and yoga: logged as holds, run in the player, counted apart from strength workouts. */
export const isMobility = (c?: Category) => c === 'stretch' || c === 'yoga';
