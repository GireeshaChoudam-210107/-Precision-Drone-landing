import type {EpisodeSummary} from '../rl/types';

interface RewardChartProps {
  history: EpisodeSummary[];
}

export function RewardChart({history}: RewardChartProps) {
  const width = 560;
  const height = 220;
  const padLeft = 46;
  const padRight = 14;
  const padTop = 16;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const recentWindow = history.slice(-20);
  const recentSuccessCount = recentWindow.filter((e) => e.landed).length;
  const recentSuccessRate =
    recentWindow.length > 0
      ? Math.round((recentSuccessCount / recentWindow.length) * 100)
      : 0;
  const totalSuccessCount = history.filter((e) => e.landed).length;
  const bestReward =
    history.length > 0
      ? Math.max(...history.map((e) => e.totalReward))
      : null;

  // Compute 10-episode moving average
  const movingAvg = history.map((_, idx) => {
    const start = Math.max(0, idx - 9);
    const slice = history.slice(start, idx + 1);
    const avg = slice.reduce((acc, item) => acc + item.totalReward, 0) / slice.length;
    return avg;
  });

  const allVals = history.map((e) => e.totalReward);
  const rawMin = allVals.length > 0 ? Math.min(...allVals, -100) : -120;
  const rawMax = allVals.length > 0 ? Math.max(...allVals, 120) : 160;
  const yMin = Math.floor(rawMin / 25) * 25;
  const yMax = Math.ceil(rawMax / 25) * 25;
  const ySpan = Math.max(1, yMax - yMin);

  const toX = (idx: number) => {
    if (history.length <= 1) return padLeft + plotW * 0.5;
    return padLeft + (idx / (history.length - 1)) * plotW;
  };

  const toY = (val: number) => {
    return padTop + ((yMax - val) / ySpan) * plotH;
  };

  const zeroY = toY(0);
  const rawPath = history
    .map((e, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(e.totalReward).toFixed(1)}`)
    .join(' ');
  const avgPath = movingAvg
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`)
    .join(' ');

  const yTicks = [yMax, Math.round((yMax + yMin) / 2), 0, yMin].filter(
    (v, i, arr) => arr.indexOf(v) === i && v >= yMin && v <= yMax
  );

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Episode Rewards &amp; Success Rate
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Tracks total episode reward and 10-episode moving average across flights
          </p>
        </div>

        <div className="flex items-center gap-5 text-xs">
          <div>
            <span className="text-slate-500">Recent 20 Landings</span>
            <div className="font-mono text-base font-semibold tabular-nums text-emerald-700">
              {recentSuccessRate}%{' '}
              <span className="text-xs font-normal text-slate-500">
                ({recentSuccessCount}/{recentWindow.length || 0})
              </span>
            </div>
          </div>
          <div className="h-7 w-px bg-slate-200" aria-hidden="true" />
          <div>
            <span className="text-slate-500">Total Landed</span>
            <div className="font-mono text-base font-semibold tabular-nums text-slate-900">
              {totalSuccessCount}
              <span className="text-xs font-normal text-slate-500">
                /{history.length}
              </span>
            </div>
          </div>
          <div className="h-7 w-px bg-slate-200" aria-hidden="true" />
          <div>
            <span className="text-slate-500">Best Reward</span>
            <div className="font-mono text-base font-semibold tabular-nums text-sky-700">
              {bestReward !== null ? bestReward.toFixed(1) : '—'}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        {history.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50/60 px-6 text-center text-sm text-slate-500">
            Complete an episode or run a training batch to plot the live reward curve.
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto"
            role="img"
            aria-label="Line chart of episode rewards over time"
          >
            {/* Horizontal gridlines */}
            {yTicks.map((tick) => {
              const y = toY(tick);
              return (
                <g key={tick}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={width - padRight}
                    y2={y}
                    stroke={tick === 0 ? '#94A3B8' : '#E2E8F0'}
                    strokeDasharray={tick === 0 ? '4 4' : undefined}
                    strokeWidth={1}
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    className="fill-slate-500 font-mono text-[10px]"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {/* Zero axis label */}
            {zeroY >= padTop && zeroY <= height - padBottom && (
              <text
                x={width - padRight}
                y={zeroY - 4}
                textAnchor="end"
                className="fill-slate-400 font-mono text-[9px]"
              >
                0 baseline
              </text>
            )}

            {/* Episode reward line */}
            {history.length > 1 && (
              <path
                d={rawPath}
                fill="none"
                stroke="#94A3B8"
                strokeOpacity={0.55}
                strokeWidth={1.3}
              />
            )}

            {/* 10-episode moving average */}
            {history.length > 1 && (
              <path
                d={avgPath}
                fill="none"
                stroke="#0284C7"
                strokeWidth={2.2}
                strokeLinejoin="round"
              />
            )}

            {/* Individual episode outcome markers (sampled if many episodes) */}
            {history.map((ep, idx) => {
              if (history.length > 90 && !ep.landed && idx % 2 !== 0) return null;
              return (
                <circle
                  key={ep.episode}
                  cx={toX(idx)}
                  cy={toY(ep.totalReward)}
                  r={ep.landed ? 3.2 : 2.1}
                  fill={ep.landed ? '#059669' : '#DC2626'}
                  fillOpacity={ep.landed ? 0.9 : 0.45}
                />
              );
            })}

            {/* X-axis labels */}
            <text
              x={padLeft}
              y={height - 8}
              textAnchor="start"
              className="fill-slate-500 font-mono text-[10px]"
            >
              Ep 1
            </text>
            <text
              x={width - padRight}
              y={height - 8}
              textAnchor="end"
              className="fill-slate-500 font-mono text-[10px]"
            >
              Ep {history[history.length - 1].episode}
            </text>
          </svg>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-5 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-sky-600 inline-block" aria-hidden="true" />
          10-episode average
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-600 inline-block" aria-hidden="true" />
          Safe landing
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-600/60 inline-block" aria-hidden="true" />
          Crash / out of bounds
        </span>
      </div>
    </section>
  );
}
