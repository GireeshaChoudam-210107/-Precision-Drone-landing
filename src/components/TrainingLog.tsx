import type {TrainingLogEntry} from '../rl/types';

interface TrainingLogProps {
  entries: TrainingLogEntry[];
}

export function TrainingLog({entries}: TrainingLogProps) {
  const getLabelColor = (kind: TrainingLogEntry['kind']) => {
    switch (kind) {
      case 'landed':
        return 'text-emerald-700';
      case 'crash':
      case 'oob':
        return 'text-red-700';
      case 'approach':
        return 'text-sky-700';
      case 'train':
        return 'text-amber-700';
      default:
        return 'text-slate-600';
    }
  };

  const getKindTag = (kind: TrainingLogEntry['kind']) => {
    switch (kind) {
      case 'landed':
        return 'LANDED';
      case 'crash':
        return 'CRASH';
      case 'oob':
        return 'BOUNDS';
      case 'approach':
        return 'APPROACH';
      case 'train':
        return 'POLICY';
      default:
        return 'EVENT';
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Training Log</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Recent flight milestones, touchdown failures, and policy updates
          </p>
        </div>
        <span className="font-mono text-xs tabular-nums text-slate-500">
          {entries.length} entries
        </span>
      </div>

      <div className="mt-3 max-h-56 overflow-y-auto pr-1">
        {entries.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">
            Flight events will appear here once you start flying or training.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 text-xs">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start gap-2.5 py-2">
                <span className="shrink-0 font-mono tabular-nums text-slate-400">
                  Ep {String(entry.episode).padStart(3, '0')}
                </span>
                <span
                  className={`shrink-0 font-mono text-[11px] font-semibold ${getLabelColor(
                    entry.kind
                  )}`}
                >
                  {getKindTag(entry.kind)}
                </span>
                <span className="text-slate-700 leading-relaxed">
                  {entry.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
