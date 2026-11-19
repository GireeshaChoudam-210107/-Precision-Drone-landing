import type {ControlMode, ThrusterActions, ThrusterProbabilities} from '../rl/types';

interface ThrusterReadoutProps {
  mode: ControlMode;
  actions: ThrusterActions;
  probabilities: ThrusterProbabilities;
  fuelPct: number;
  onManualHoldStart: (thruster: keyof ThrusterActions) => void;
  onManualHoldEnd: (thruster: keyof ThrusterActions) => void;
}

export function ThrusterReadout({
  mode,
  actions,
  probabilities,
  fuelPct,
  onManualHoldStart,
  onManualHoldEnd,
}: ThrusterReadoutProps) {
  const rows: {
    key: keyof ThrusterActions;
    label: string;
    keys: string;
    active: boolean;
    prob: number;
  }[] = [
    {
      key: 'left',
      label: 'Left Thruster',
      keys: 'A / ←',
      active: actions.left === 1,
      prob: probabilities.left,
    },
    {
      key: 'main',
      label: 'Main Thruster',
      keys: 'W / ↑ / Space',
      active: actions.main === 1,
      prob: probabilities.main,
    },
    {
      key: 'right',
      label: 'Right Thruster',
      keys: 'D / →',
      active: actions.right === 1,
      prob: probabilities.right,
    },
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            {mode === 'manual' ? 'Manual Thruster Controls' : 'Policy Action Probabilities'}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {mode === 'manual'
              ? 'Hold keyboard keys or press buttons below to fire thrusters'
              : 'Three independent Bernoulli probabilities sampled each step'}
          </p>
        </div>
        <span className="font-mono text-xs tabular-nums text-slate-500">
          Fuel {fuelPct}%
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {rows.map((row) => {
          const pct = Math.round(row.prob * 100);
          return (
            <button
              key={row.key}
              type="button"
              disabled={mode !== 'manual'}
              onMouseDown={() => mode === 'manual' && onManualHoldStart(row.key)}
              onMouseUp={() => mode === 'manual' && onManualHoldEnd(row.key)}
              onMouseLeave={() => mode === 'manual' && onManualHoldEnd(row.key)}
              onTouchStart={(e) => {
                if (mode !== 'manual') return;
                e.preventDefault();
                onManualHoldStart(row.key);
              }}
              onTouchEnd={() => mode === 'manual' && onManualHoldEnd(row.key)}
              className={`flex flex-col justify-between rounded-md border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${
                row.active
                  ? 'border-sky-600 bg-sky-50 text-slate-900'
                  : 'border-slate-200 bg-slate-50/70 text-slate-700'
              } ${
                mode === 'manual'
                  ? 'cursor-pointer hover:border-slate-300 active:bg-sky-100'
                  : 'cursor-default'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900">
                  {row.label}
                </span>
                <span
                  className={`font-mono text-[11px] font-semibold ${
                    row.active ? 'text-sky-700' : 'text-slate-400'
                  }`}
                >
                  {row.active ? 'FIRING' : 'IDLE'}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                  {row.keys}
                </kbd>
                <span className="font-mono tabular-nums text-slate-700">
                  {mode === 'ai' ? `P = ${pct}%` : row.active ? '1' : '0'}
                </span>
              </div>

              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full transition-all duration-75 ${
                    row.active ? 'bg-sky-600' : 'bg-slate-400'
                  }`}
                  style={{width: `${mode === 'ai' ? pct : row.active ? 100 : 0}%`}}
                />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
