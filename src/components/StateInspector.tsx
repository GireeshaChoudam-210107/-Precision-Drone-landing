import type {StateVectorItem} from '../rl/types';

interface StateInspectorProps {
  items: StateVectorItem[];
}

export function StateInspector({items}: StateInspectorProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            State Inspector (15-Value Observation)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Normalized inputs fed into the policy network each frame
          </p>
        </div>
        <span className="font-mono text-xs tabular-nums text-slate-500">
          dim = {items.length}
        </span>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-slate-500">
              <th className="pb-1.5 font-medium">#</th>
              <th className="pb-1.5 font-medium">Feature</th>
              <th className="pb-1.5 text-right font-medium">Norm</th>
              <th className="pb-1.5 text-right font-medium">Physical</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/80 font-mono tabular-nums">
            {items.map((item) => {
              const isFlag = item.index >= 13;
              const activeFlag = isFlag && item.normalized === 1;
              return (
                <tr key={item.key} className="hover:bg-slate-50/80">
                  <td className="py-1.5 pr-2 text-slate-400">
                    {String(item.index).padStart(2, '0')}
                  </td>
                  <td className="py-1.5 pr-2 font-sans text-slate-700">
                    {item.label}
                  </td>
                  <td
                    className={`py-1.5 pr-2 text-right font-medium ${
                      activeFlag
                        ? item.index === 13
                          ? 'text-emerald-700'
                          : 'text-red-700'
                        : 'text-slate-900'
                    }`}
                  >
                    {item.normalized >= 0 ? ' ' : ''}
                    {item.normalized.toFixed(3)}
                  </td>
                  <td className="py-1.5 text-right text-slate-500">
                    {item.rawDisplay}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
