import {useCallback, useEffect, useRef, useState} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Pause,
  Play,
  RotateCcw,
  Square,
  Zap,
} from 'lucide-react';
import {HowItLearns} from './components/HowItLearns';
import {RewardBreakdownPanel} from './components/RewardBreakdownPanel';
import {RewardChart} from './components/RewardChart';
import {SimulationCanvas} from './components/SimulationCanvas';
import {StateInspector} from './components/StateInspector';
import {ThrusterReadout} from './components/ThrusterReadout';
import {TrainingLog} from './components/TrainingLog';
import {buildRewardReasons, DroneEnvironment} from './rl/environment';
import {ReinforcePolicy} from './rl/reinforcePolicy';
import type {
  ControlMode,
  EpisodeStatus,
  EpisodeSummary,
  SimulationSnapshot,
  ThrusterActions,
  TrainingLogEntry,
} from './rl/types';

const EPISODE_BATCH_OPTIONS = [25, 50, 100, 200, 300, 500] as const;
const SPEED_OPTIONS = [
  {label: '0.5×', value: 0.5},
  {label: '1×', value: 1},
  {label: '2×', value: 2},
  {label: '4×', value: 4},
] as const;

export default function App() {
  const envRef = useRef<DroneEnvironment | null>(null);
  if (!envRef.current) {
    envRef.current = new DroneEnvironment();
  }
  const policyRef = useRef<ReinforcePolicy | null>(null);
  if (!policyRef.current) {
    policyRef.current = new ReinforcePolicy();
  }

  const [mode, setMode] = useState<ControlMode>('manual');
  const [isRunning, setIsRunning] = useState(false);
  const [isBatchTraining, setIsBatchTraining] = useState(false);
  const [simSpeed, setSimSpeed] = useState<number>(1);
  const [trainBatchSize, setTrainBatchSize] = useState<number>(100);
  const [batchProgress, setBatchProgress] = useState<{done: number; total: number}>({
    done: 0,
    total: 0,
  });

  const [episodeNumber, setEpisodeNumber] = useState<number>(1);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(() =>
    envRef.current!.getSnapshot()
  );
  const [history, setHistory] = useState<EpisodeSummary[]>([]);
  const [logs, setLogs] = useState<TrainingLogEntry[]>([
    {
      id: 1,
      episode: 1,
      kind: 'info',
      message:
        'Manual mode ready. Use W/↑/Space for main thrust and A/D or ←/→ to steer.',
    },
  ]);

  const manualKeysRef = useRef<ThrusterActions>({main: 0, left: 0, right: 0});
  const logIdRef = useRef<number>(2);
  const episodeCounterRef = useRef<number>(1);
  const frameTickRef = useRef<number>(0);
  const batchCancelRef = useRef<boolean>(false);
  const nextEpisodeTimeoutRef = useRef<number | null>(null);

  const appendLog = useCallback(
    (episode: number, kind: TrainingLogEntry['kind'], message: string) => {
      const id = logIdRef.current++;
      setLogs((prev) => [{id, episode, kind, message}, ...prev].slice(0, 80));
    },
    []
  );

  const recordCompletedEpisode = useCallback(
    (finalSnap: SimulationSnapshot, epNum: number): EpisodeSummary => {
      const summary: EpisodeSummary = {
        episode: epNum,
        totalReward: finalSnap.episodeReward,
        landed: finalSnap.status === 'landed',
        status: finalSnap.status,
        reason: finalSnap.statusDetail,
        steps: finalSnap.step,
        fuelRemainingPct: Math.round(
          (finalSnap.drone.fuel / finalSnap.drone.maxFuel) * 100
        ),
        breakdown: {...finalSnap.breakdown},
        reasonItems: buildRewardReasons(
          finalSnap.breakdown,
          finalSnap.status,
          finalSnap.statusDetail
        ),
      };
      setHistory((prev) => [...prev, summary]);
      return summary;
    },
    []
  );

  const clearScheduledNextEpisode = useCallback(() => {
    if (nextEpisodeTimeoutRef.current !== null) {
      window.clearTimeout(nextEpisodeTimeoutRef.current);
      nextEpisodeTimeoutRef.current = null;
    }
  }, []);

  const resetFlight = useCallback(
    (randomize = mode === 'ai') => {
      clearScheduledNextEpisode();
      policyRef.current?.discardCurrentEpisode();
      const snap = envRef.current!.reset(randomize);
      setSnapshot(snap);
      setIsRunning(false);
    },
    [clearScheduledNextEpisode, mode]
  );

  const handleModeChange = useCallback(
    (nextMode: ControlMode) => {
      if (nextMode === mode) return;
      batchCancelRef.current = true;
      clearScheduledNextEpisode();
      setIsBatchTraining(false);
      setIsRunning(false);
      policyRef.current?.discardCurrentEpisode();
      manualKeysRef.current = {main: 0, left: 0, right: 0};
      setMode(nextMode);
      const snap = envRef.current!.reset(nextMode === 'ai');
      setSnapshot(snap);
      appendLog(
        episodeCounterRef.current,
        'info',
        nextMode === 'manual'
          ? 'Switched to Manual mode — keyboard controls active.'
          : 'Switched to Train AI mode — policy network controls thrusters.'
      );
    },
    [appendLog, clearScheduledNextEpisode, mode]
  );

  const handleStart = useCallback(() => {
    if (isBatchTraining) return;
    clearScheduledNextEpisode();
    const env = envRef.current!;
    if (
      env.status === 'landed' ||
      env.status === 'crashed' ||
      env.status === 'out_of_bounds' ||
      env.status === 'timeout'
    ) {
      episodeCounterRef.current += 1;
      setEpisodeNumber(episodeCounterRef.current);
      policyRef.current?.discardCurrentEpisode();
      setSnapshot(env.reset(mode === 'ai'));
    }
    setIsRunning(true);
  }, [clearScheduledNextEpisode, isBatchTraining, mode]);

  const handlePause = useCallback(() => {
    clearScheduledNextEpisode();
    setIsRunning(false);
  }, [clearScheduledNextEpisode]);

  const handleResetAgent = useCallback(() => {
    batchCancelRef.current = true;
    clearScheduledNextEpisode();
    setIsBatchTraining(false);
    setIsRunning(false);
    policyRef.current!.resetWeights();
    episodeCounterRef.current = 1;
    setEpisodeNumber(1);
    setHistory([]);
    const snap = envRef.current!.reset(mode === 'ai');
    setSnapshot(snap);
    setLogs([
      {
        id: logIdRef.current++,
        episode: 1,
        kind: 'info',
        message: 'Agent weights, episode history, and reward chart reset to Episode 1.',
      },
    ]);
  }, [clearScheduledNextEpisode, mode]);

  const runBatchTraining = useCallback(() => {
    if (isBatchTraining) {
      batchCancelRef.current = true;
      return;
    }

    clearScheduledNextEpisode();
    setIsRunning(false);
    setMode('ai');
    setIsBatchTraining(true);
    batchCancelRef.current = false;
    setBatchProgress({done: 0, total: trainBatchSize});
    policyRef.current?.discardCurrentEpisode();

    appendLog(
      episodeCounterRef.current,
      'train',
      `Started REINFORCE batch training (${trainBatchSize} episodes)...`
    );

    const env = envRef.current!;
    const policy = policyRef.current!;
    let completedInBatch = 0;
    const chunkSize = 4;

    const runChunk = () => {
      if (batchCancelRef.current) {
        setIsBatchTraining(false);
        appendLog(
          episodeCounterRef.current,
          'info',
          `Batch training stopped after ${completedInBatch} episodes.`
        );
        return;
      }

      const newSummaries: EpisodeSummary[] = [];
      let lastSnap = env.getSnapshot();

      for (let c = 0; c < chunkSize && completedInBatch < trainBatchSize; c++) {
        const epNum = episodeCounterRef.current;
        let snap = env.reset(true);
        let done = false;

        while (!done) {
          const {actions, probabilities} = policy.selectAction(snap.stateVector, true);
          const stepRes = env.step(actions, probabilities);
          policy.recordReward(stepRes.stepReward);
          snap = stepRes.snapshot;
          done = stepRes.done;
        }

        const updateRes = policy.finishEpisode(4);
        const summary = {
          episode: epNum,
          totalReward: snap.episodeReward,
          landed: snap.status === 'landed',
          status: snap.status,
          reason: snap.statusDetail,
          steps: snap.step,
          fuelRemainingPct: Math.round((snap.drone.fuel / snap.drone.maxFuel) * 100),
          breakdown: {...snap.breakdown},
          reasonItems: buildRewardReasons(
            snap.breakdown,
            snap.status,
            snap.statusDetail
          ),
        };
        newSummaries.push(summary);
        lastSnap = snap;

        if (summary.landed) {
          appendLog(epNum, 'landed', summary.reason);
        } else if (completedInBatch % 10 === 0 || completedInBatch === trainBatchSize - 1) {
          appendLog(
            epNum,
            summary.status === 'out_of_bounds' ? 'oob' : 'crash',
            summary.reason
          );
        }

        if (updateRes.updated && (epNum % 20 === 0 || completedInBatch === trainBatchSize - 1)) {
          appendLog(
            epNum,
            'train',
            `Policy updated (mean return baseline: ${updateRes.baselineUsed.toFixed(1)})`
          );
        }

        completedInBatch += 1;
        episodeCounterRef.current += 1;
      }

      setHistory((prev) => [...prev, ...newSummaries]);
      setEpisodeNumber(episodeCounterRef.current);
      setSnapshot(lastSnap);
      setBatchProgress({done: completedInBatch, total: trainBatchSize});

      if (completedInBatch < trainBatchSize) {
        window.setTimeout(runChunk, 0);
      } else {
        setIsBatchTraining(false);
        const demoSnap = env.reset(true);
        setSnapshot(demoSnap);
        setIsRunning(true);
        appendLog(
          episodeCounterRef.current,
          'train',
          `Batch complete (${trainBatchSize} episodes). Launching live policy flight.`
        );
      }
    };

    window.setTimeout(runChunk, 0);
  }, [appendLog, clearScheduledNextEpisode, isBatchTraining, trainBatchSize]);

  // Keyboard listener for Manual Mode
  useEffect(() => {
    const updateKey = (code: string, pressed: boolean, e: KeyboardEvent) => {
      if (mode !== 'manual' || isBatchTraining) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA')
      ) {
        return;
      }

      let matched = false;
      if (code === 'KeyW' || code === 'ArrowUp' || code === 'Space') {
        manualKeysRef.current.main = pressed ? 1 : 0;
        matched = true;
      } else if (code === 'KeyA' || code === 'ArrowLeft') {
        manualKeysRef.current.left = pressed ? 1 : 0;
        matched = true;
      } else if (code === 'KeyD' || code === 'ArrowRight') {
        manualKeysRef.current.right = pressed ? 1 : 0;
        matched = true;
      }

      if (matched) {
        e.preventDefault();
        if (pressed && !isRunning) {
          const env = envRef.current!;
          if (env.status === 'ready') {
            setIsRunning(true);
          }
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => updateKey(e.code, true, e);
    const onKeyUp = (e: KeyboardEvent) => updateKey(e.code, false, e);
    const onBlur = () => {
      manualKeysRef.current = {main: 0, left: 0, right: 0};
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [isBatchTraining, isRunning, mode]);

  // Main simulation animation loop
  useEffect(() => {
    if (!isRunning || isBatchTraining) return;

    let rafId = 0;

    const tick = () => {
      frameTickRef.current += 1;
      const env = envRef.current!;
      const policy = policyRef.current!;

      // Support 0.5x slow motion as well as 1x, 2x, 4x
      const stepsThisFrame =
        simSpeed < 1 ? (frameTickRef.current % 2 === 0 ? 1 : 0) : Math.round(simSpeed);

      let latestSnap = env.getSnapshot();
      let finished = false;

      for (let s = 0; s < stepsThisFrame; s++) {
        let actions: ThrusterActions;
        let probs = {main: 0, left: 0, right: 0};

        if (mode === 'manual') {
          actions = {...manualKeysRef.current};
          probs = {main: actions.main, left: actions.left, right: actions.right};
        } else {
          const sampled = policy.selectAction(latestSnap.stateVector, true);
          actions = sampled.actions;
          probs = sampled.probabilities;
        }

        const res = env.step(actions, probs);
        if (mode === 'ai') {
          policy.recordReward(res.stepReward);
        }

        latestSnap = res.snapshot;

        if (res.eventMessage && res.eventKind) {
          appendLog(episodeCounterRef.current, res.eventKind, res.eventMessage);
        }

        if (res.done) {
          finished = true;
          break;
        }
      }

      setSnapshot(latestSnap);

      if (finished) {
        const completedEp = episodeCounterRef.current;
        recordCompletedEpisode(latestSnap, completedEp);
        setIsRunning(false);

        if (mode === 'ai') {
          const updateRes = policy.finishEpisode(2);
          if (updateRes.updated) {
            appendLog(
              completedEp,
              'train',
              `Policy updated (baseline ${updateRes.baselineUsed.toFixed(1)})`
            );
          }

          // Automatically launch the next live AI episode after a brief readable pause
          nextEpisodeTimeoutRef.current = window.setTimeout(() => {
            episodeCounterRef.current += 1;
            setEpisodeNumber(episodeCounterRef.current);
            setSnapshot(env.reset(true));
            setIsRunning(true);
          }, 750);
        }
        return;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [appendLog, isBatchTraining, isRunning, mode, recordCompletedEpisode, simSpeed]);

  useEffect(() => {
    return () => clearScheduledNextEpisode();
  }, [clearScheduledNextEpisode]);

  const handleManualHoldStart = (thruster: keyof ThrusterActions) => {
    if (mode !== 'manual') return;
    manualKeysRef.current[thruster] = 1;
    if (!isRunning && envRef.current?.status === 'ready') {
      setIsRunning(true);
    }
  };

  const handleManualHoldEnd = (thruster: keyof ThrusterActions) => {
    manualKeysRef.current[thruster] = 0;
  };

  const fuelPct = Math.round((snapshot.drone.fuel / snapshot.drone.maxFuel) * 100);
  const latestEpisode = history.length > 0 ? history[history.length - 1] : null;

  const renderStatusLabel = (status: EpisodeStatus) => {
    switch (status) {
      case 'landed':
        return (
          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            Landed safely
          </span>
        );
      case 'crashed':
      case 'out_of_bounds':
      case 'timeout':
        return (
          <span className="inline-flex items-center gap-1.5 font-medium text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {status === 'out_of_bounds'
              ? 'Out of bounds'
              : status === 'timeout'
                ? 'Timed out'
                : 'Crashed'}
          </span>
        );
      case 'flying':
        return <span className="font-medium text-sky-700">In flight</span>;
      default:
        return <span className="font-medium text-slate-600">Ready</span>;
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F8FB] text-slate-900">
      {/* Three-Zone Top Bar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          <a
            href="#simulation"
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Drone Landing Lab
          </a>

          <nav
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
            aria-label="Section navigation"
          >
            <a
              href="#simulation"
              className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              Simulation
            </a>
            <a
              href="#analytics"
              className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              Analytics
            </a>
            <a
              href="#breakdown"
              className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              Reward Breakdown
            </a>
            <a
              href="#how-it-learns"
              className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              How It Learns
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={runBatchTraining}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${
                isBatchTraining
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-sky-600 text-white hover:bg-sky-700'
              }`}
            >
              {isBatchTraining ? (
                <>
                  <Square className="h-3.5 w-3.5" aria-hidden="true" />
                  Stop ({batchProgress.done}/{batchProgress.total})
                </>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                  Train {trainBatchSize} Episodes
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6">
        {/* Simulation Workspace */}
        <section id="simulation" className="space-y-4">
          {/* Workspace Control Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Mode Switcher */}
              <div
                className="inline-flex items-center rounded-lg bg-slate-100 p-1"
                role="group"
                aria-label="Control mode"
              >
                <button
                  type="button"
                  onClick={() => handleModeChange('manual')}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    mode === 'manual'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Manual Mode
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('ai')}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    mode === 'ai'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Train AI Mode
                </button>
              </div>

              <div className="h-6 w-px bg-slate-200 hidden sm:block" aria-hidden="true" />

              {/* Start / Pause / Reset */}
              <div className="flex flex-wrap items-center gap-2">
                {!isRunning ? (
                  <button
                    type="button"
                    disabled={isBatchTraining}
                    onClick={handleStart}
                    className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    {mode === 'ai' ? 'Watch AI Fly' : 'Start Flight'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handlePause}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                    Pause
                  </button>
                )}

                <button
                  type="button"
                  disabled={isBatchTraining}
                  onClick={() => resetFlight(mode === 'ai')}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Reset Flight
                </button>

                <button
                  type="button"
                  onClick={handleResetAgent}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  Reset Agent
                </button>
              </div>
            </div>

            {/* Adjustable Episode Count & Simulation Speed */}
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="flex items-center gap-2 text-slate-600">
                <span className="font-medium whitespace-nowrap">Batch Episodes</span>
                <select
                  value={trainBatchSize}
                  disabled={isBatchTraining}
                  onChange={(e) => setTrainBatchSize(Number(e.target.value))}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs font-medium text-slate-900 focus:border-sky-600 focus:outline-none"
                >
                  {EPISODE_BATCH_OPTIONS.map((count) => (
                    <option key={count} value={count}>
                      {count} ep
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-2 text-slate-600">
                <span className="font-medium whitespace-nowrap">Sim Speed</span>
                <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
                  {SPEED_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSimSpeed(opt.value)}
                      className={`rounded px-2 py-1 font-mono text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                        simSpeed === opt.value
                          ? 'bg-white text-sky-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Two-Zone Simulation Layout */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
            {/* Left / Primary Stage */}
            <div className="space-y-4 lg:col-span-8">
              {/* Clean Unboxed Telemetry Status Strip */}
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="text-slate-500">
                    Mode:{' '}
                    <strong className="font-semibold text-slate-900">
                      {mode === 'manual' ? 'Manual' : 'Train AI'}
                    </strong>
                  </span>
                  <span className="text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-slate-500">
                    Episode{' '}
                    <strong className="font-mono font-semibold tabular-nums text-slate-900">
                      #{episodeNumber}
                    </strong>
                  </span>
                  <span className="text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-slate-500">
                    Reward{' '}
                    <strong
                      className={`font-mono font-semibold tabular-nums ${
                        snapshot.episodeReward >= 0
                          ? 'text-emerald-700'
                          : 'text-red-700'
                      }`}
                    >
                      {snapshot.episodeReward >= 0 ? '+' : ''}
                      {snapshot.episodeReward.toFixed(1)}
                    </strong>
                  </span>
                  <span className="text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-slate-500">
                    Fuel{' '}
                    <strong className="font-mono font-semibold tabular-nums text-slate-900">
                      {fuelPct}%
                    </strong>
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  {renderStatusLabel(snapshot.status)}
                </div>
              </div>

              <SimulationCanvas
                snapshot={snapshot}
                mode={mode}
                isTrainingBatch={isBatchTraining}
              />

              <ThrusterReadout
                mode={mode}
                actions={snapshot.actions}
                probabilities={snapshot.probabilities}
                fuelPct={fuelPct}
                onManualHoldStart={handleManualHoldStart}
                onManualHoldEnd={handleManualHoldEnd}
              />
            </div>

            {/* Right Telemetry & State Deck */}
            <div className="space-y-4 lg:col-span-4">
              <TrainingLog entries={logs} />
              <StateInspector items={snapshot.stateItems} />
            </div>
          </div>
        </section>

        {/* Learning Analytics & Reward Breakdown Row */}
        <section
          id="analytics"
          className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start"
        >
          <div className="lg:col-span-7">
            <RewardChart history={history} />
          </div>
          <div id="breakdown" className="lg:col-span-5">
            <RewardBreakdownPanel
              latestEpisode={latestEpisode}
              liveSnapshot={snapshot}
            />
          </div>
        </section>

        {/* Educational Guide */}
        <HowItLearns />
      </main>
    </div>
  );
}
