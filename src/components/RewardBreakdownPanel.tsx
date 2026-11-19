import {buildRewardReasons} from '../rl/environment';
import type {EpisodeSummary, SimulationSnapshot} from '../rl/types';

interface RewardBreakdownPanelProps {
  latestEpisode: EpisodeSummary | null;
  liveSnapshot: SimulationSnapshot;
}

export function RewardBreakdownPanel({
  latestEpisode,
  liveSnapshot,
}: RewardBreakdownPanelProps) {
  const showingLatest = latestEpisode !== null;
  const breakdown = showingLatest ? latestEpisode.breakdown : liveSnapshot.breakdown;
  const items = showingLatest
    ? latestEpisode.reasonItems
    : buildRewardReasons(
        liveSnapshot.breakdown,
        liveSnapshot.status,
        liveSnapshot.statusDetail
      );

  const maxMagnitude = Math.max(
    20,
    ...items.map((item) => Math.abs(item.value))
  );

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Reward Breakdown
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {showingLatest
              ? `Latest completed flight: Episode ${latestEpisode.episode} · ${latestEpisode.reason}`
              : 'Live step-by-step reward signals for the active flight'}
          </p>
        </div>

        <div className="text-right">
          <span className="text-xs text-slate-500">Total Score</span>
          <div
            className={`font-mono text-lg font-semibold tabular-nums ${
              breakdown.total >= 0 ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {breakdown.total >= 0 ? '+' : ''}
            {breakdown.total.toFixed(1)}
          </div>
        </div>
      </div>

      <div className="mt-4 divide-y divide-slate-100">
        {items.map((item) => {
          const pct = Math.min(100, (Math.abs(item.value) / maxMagnitude) * 100);
          const isPositive = item.value > 0.05;
          const isNegative = item.value < -0.05;

          return (
            <div key={item.key} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-800">
                  {item.label}
                </span>
                <span
                  className={`font-mono text-sm font-semibold tabular-nums ${
                    isPositive
                      ? 'text-emerald-700'
                      : isNegative
                        ? 'text-red-700'
                        : 'text-slate-600'
                  }`}
                >
                  {item.value >= 0 ? '+' : ''}
                  {item.value.toFixed(1)}
                </span>
              </div>

              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all duration-150 ${
                    isPositive
                      ? 'bg-emerald-600'
                      : isNegative
                        ? 'bg-red-600'
                        : 'bg-slate-400'
                  }`}
                  style={{width: `${Math.max(2, pct)}%`}}
                />
              </div>

              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                {item.explanation}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
