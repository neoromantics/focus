// Flight manager keeps focus sessions cohesive and decoupled from background.js
(function(global) {
  function createFlightManager({
    getFlight,
    setFlight,
    getHistory,
    setHistory,
    storage,
    flightConstants,
    getCurrentTask
  }) {
    const {
      MIN_DURATION_MS,
      TURBULENCE_LIMIT,
      HISTORY_LIMIT
    } = flightConstants;

    function ensureHistoryArray() {
      if (!Array.isArray(getHistory())) {
        setHistory([]);
      }
    }

    function getSnapshot() {
      const flight = getFlight();
      if (!flight) {
        return {
          active: false,
          turbulence: 0,
          limit: TURBULENCE_LIMIT
        };
      }
      return {
        active: flight.status === 'inflight',
        status: flight.status,
        turbulence: flight.turbulence || 0,
        limit: TURBULENCE_LIMIT,
        startedAt: flight.startedAt,
        goal: flight.goalSnapshot,
        durationMs: Date.now() - (flight.startedAt || Date.now()),
        id: flight.id
      };
    }

    function isActive() {
      const flight = getFlight();
      return !!(flight && flight.status === 'inflight');
    }

    async function persist() {
      await storage.set({
        currentFlight: getFlight(),
        flightHistory: getHistory()
      });
    }

    async function start() {
      if (isActive()) {
        return { success: false, error: 'flight-in-progress', flight: getSnapshot(), history: getHistory() };
      }
      const now = Date.now();
      setFlight({
        id: `flight-${now}`,
        startedAt: now,
        goalSnapshot: getCurrentTask ? getCurrentTask() : null,
        turbulence: 0,
        status: 'inflight',
        events: []
      });
      await persist();
      return { success: true, flight: getSnapshot(), history: getHistory() };
    }

    async function end(options = {}) {
      const { forcedOutcome = null, skipDurationCheck = false } = options;
      const current = getFlight();
      if (!current) {
        return { success: false, error: 'no-flight' };
      }
      const now = Date.now();
      const durationMs = now - (current.startedAt || now);
      if (!skipDurationCheck && !forcedOutcome && durationMs < MIN_DURATION_MS) {
        setFlight(null);
        await persist();
        return { success: false, tooShort: true, durationMs };
      }

      const turbulence = current.turbulence || 0;
      const outcome = forcedOutcome || determineOutcome(turbulence);
      const record = {
        id: current.id,
        goalSnapshot: current.goalSnapshot,
        startedAt: current.startedAt,
        completedAt: now,
        durationMs,
        turbulence,
        outcome
      };

      ensureHistoryArray();
      setHistory([record, ...getHistory()].slice(0, HISTORY_LIMIT));
      setFlight(null);
      await persist();
      return { success: true, record, flightHistory: getHistory() };
    }

    async function registerTurbulence({ url } = {}) {
      const current = getFlight();
      if (!current || current.status !== 'inflight') {
        return { applied: false };
      }
      current.turbulence = (current.turbulence || 0) + 1;
      current.events = current.events || [];
      current.events.push({ type: 'turbulence', url, timestamp: Date.now() });
      setFlight(current);
      await persist();

      if (current.turbulence >= TURBULENCE_LIMIT) {
        const result = await end({ forcedOutcome: 'fail', skipDurationCheck: true });
        return { applied: true, forcedLanding: true, result };
      }
      return { applied: true };
    }

    async function rollbackTurbulence() {
      const current = getFlight();
      if (!current || current.status !== 'inflight') {
        return { success: false, error: 'no-flight' };
      }
      if (!current.turbulence) {
        return { success: false, error: 'no-turbulence' };
      }
      current.turbulence = Math.max(0, current.turbulence - 1);
      if (Array.isArray(current.events)) {
        let idx = current.events.length - 1;
        while (idx >= 0) {
          if (current.events[idx].type === 'turbulence') {
            current.events.splice(idx, 1);
            break;
          }
          idx--;
        }
      }
      setFlight(current);
      await persist();
      return { success: true, flight: getSnapshot() };
    }

    function determineOutcome(turbulenceCount = 0) {
      if (turbulenceCount <= 0) return 'perfect';
      if (turbulenceCount < TURBULENCE_LIMIT) return 'delayed';
      return 'fail';
    }

    return {
      start,
      end,
      registerTurbulence,
      rollbackTurbulence,
      getSnapshot,
      isActive
    };
  }

  global.FG_FLIGHT = {
    createFlightManager
  };
})(self);
