// The #199 event contract, imported for its side effect from the one shared source (no
// copy). Wrangler bundles this exact file into the Worker; the runtime suite proves the
// built bundle rejects what the shared validator rejects.
import '../../../shared/learning-outbox.js';

const contract = globalThis.LEARNING_OUTBOX;
if (!contract || contract.SCHEMA_VERSION !== 1 || !contract.validateCatalog(contract.CATALOG)) {
  throw new Error('The shared learning-event contract is unavailable');
}

export const SCHEMA_VERSION = contract.SCHEMA_VERSION;
export const CATALOG = contract.CATALOG;
export const validateEvent = event => contract.validateEvent(event);
export const validateStatus = status => contract.validateStatus(status);

// Canonical payload: the validated event's own fields with sorted keys. All values are
// primitives (the validator forbids nesting), so equal events give equal strings.
export function canonical(event) {
  const sorted = {};
  for (const key of Object.keys(event).sort()) sorted[key] = event[key];
  return JSON.stringify(sorted);
}
