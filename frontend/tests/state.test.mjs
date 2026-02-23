import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, test } from 'vitest';

describe('state helpers', () => {
  test('createStore merges and notifies subscribers', () => {
    const script = readFileSync(resolve(process.cwd(), 'state.js'), 'utf8');
    const context = { window: {} };
    vm.runInNewContext(script, context);

    const store = context.window.createStore({ count: 0 });
    let observed = 0;
    store.subscribe((next) => {
      observed = next.count;
    });
    store.setState({ count: 2 });

    expect(store.getState().count).toBe(2);
    expect(observed).toBe(2);
  });

  test('createRequestGate invalidates previous token', () => {
    const script = readFileSync(resolve(process.cwd(), 'state.js'), 'utf8');
    const context = { window: {} };
    vm.runInNewContext(script, context);

    const gate = context.window.createRequestGate();
    const t1 = gate.nextToken();
    const t2 = gate.nextToken();

    expect(gate.isCurrent(t1)).toBe(false);
    expect(gate.isCurrent(t2)).toBe(true);
  });
});
