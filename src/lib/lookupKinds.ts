/** What the Coach can look up in the user's data (answered on the phone by agentLookup.ts). Kept apart so the AI schemas
 *  can name them without pulling in the app's data store. */
export const LOOKUP_KINDS = ['food', 'nutrition', 'workouts', 'exercise_history', 'records', 'body', 'activities', 'health', 'training_balance', 'schedule', 'routines', 'exercises', 'saved_food', 'settings', 'memory', 'notes', 'conversations', 'guide', 'web'] as const;
export type LookupKind = (typeof LOOKUP_KINDS)[number];
