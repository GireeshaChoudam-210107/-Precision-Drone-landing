export function HowItLearns() {
  const concepts = [
    {
      number: '01',
      title: 'Agent',
      body: 'The neural-network pilot inside the browser. It does not know physics equations beforehand—it learns solely from flight experience.',
    },
    {
      number: '02',
      title: 'Environment',
      body: 'The 2D flight bay with gravity, fuel limits, boundaries, and an elevated landing deck. It steps physics forward and reports outcomes.',
    },
    {
      number: '03',
      title: 'State',
      body: 'A 15-number normalized vector describing position, velocity, tilt angle, angular velocity, fuel, platform location, offsets, distance, speed, and terminal flags.',
    },
    {
      number: '04',
      title: 'Action',
      body: 'Three independent binary choices each frame: fire Main thruster, fire Left attitude thruster, and fire Right attitude thruster.',
    },
    {
      number: '05',
      title: 'Policy',
      body: 'A compact 2-layer neural network (15 → 48 → 3) that maps the 15-value state into three firing probabilities and samples each thruster.',
    },
    {
      number: '06',
      title: 'Reward & REINFORCE',
      body: 'After each batch of flights, discounted returns G_t are compared against a mean-return baseline and normalized into advantages so higher-return actions become more likely.',
    },
  ];

  return (
    <section
      id="how-it-learns"
      className="rounded-lg border border-slate-200 bg-white p-6"
    >
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-lg font-semibold text-slate-900">
          How It Learns
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Drone Landing Lab demonstrates a simplified policy-gradient algorithm
          inspired by REINFORCE running entirely in your browser.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
        {concepts.map((item) => (
          <div key={item.number} className="space-y-1.5">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-xs font-semibold tabular-nums text-sky-700">
                {item.number}.
              </span>
              <h3 className="text-sm font-semibold text-slate-900">
                {item.title}
              </h3>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              {item.body}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
        <span className="font-semibold text-slate-700">Educational scope:</span>{' '}
        This simulator uses simplified 2D kinematics and a lightweight policy
        network for fast local learning rather than a full aerodynamics engine or
        research-scale RL framework.
      </div>
    </section>
  );
}
