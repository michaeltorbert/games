// D1 access with a per-request statement budget. Every handler uses a fixed, small
// number of statements whatever the batch size; the budget is a hard stop, not a goal.

export class BudgetError extends Error {
  constructor() {
    super('Statement budget exceeded');
    this.name = 'BudgetError';
  }
}

export function createDb(d1, budget) {
  let used = 0;
  const spend = count => {
    used += count;
    if (used > budget) throw new BudgetError();
  };
  const statement = (sql, params) => {
    if (params.length > 100) throw new RangeError('Too many bound parameters');
    return d1.prepare(sql).bind(...params);
  };
  return {
    get used() { return used; },
    async first(sql, ...params) {
      spend(1);
      return statement(sql, params).first();
    },
    async all(sql, ...params) {
      spend(1);
      return (await statement(sql, params).all()).results;
    },
    async run(sql, ...params) {
      spend(1);
      return (await statement(sql, params).run()).meta;
    },
    // One atomic D1 batch (a single transaction): all statements commit or none do.
    async batch(items) {
      spend(items.length);
      const results = await d1.batch(items.map(([sql, ...params]) => statement(sql, params)));
      return results.map(result => result.results ?? []);
    },
  };
}

export const SYSTEM = 'SELECT installation, confirm_key AS confirmKey, scope_version AS scopeVersion FROM system WHERE id = 1';

// The system marker row, or null when the schema or marker is missing (then 503). A
// missing table is an error from D1, also reported as unavailable.
export async function readSystem(db) {
  try {
    const row = await db.first(SYSTEM);
    return row && /^[0-9a-f]{32}$/.test(row.installation) && /^[0-9a-f]{64}$/.test(row.confirmKey) ? row : null;
  } catch (error) {
    if (error instanceof BudgetError) throw error;
    return null;
  }
}
