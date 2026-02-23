/* global window */
(function bootstrapState(global) {
  function createStore(initialState = {}) {
    let state = { ...initialState };
    const listeners = new Set();

    function getState() {
      return state;
    }

    function setState(next) {
      const nextState = typeof next === "function" ? next(state) : next;
      state = { ...state, ...nextState };
      listeners.forEach((listener) => listener(state));
      return state;
    }

    function subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    return { getState, setState, subscribe };
  }

  function createRequestGate() {
    let token = 0;
    return {
      nextToken() {
        token += 1;
        return token;
      },
      isCurrent(candidate) {
        return candidate === token;
      }
    };
  }

  global.createStore = createStore;
  global.createRequestGate = createRequestGate;
})(window);
