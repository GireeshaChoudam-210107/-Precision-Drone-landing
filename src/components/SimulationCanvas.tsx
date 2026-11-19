import {useEffect, useRef} from 'react';
import {
  DRONE_RADIUS,
  GROUND_Y,
  SAFE_ANGLE,
  SAFE_SPEED,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../rl/environment';
import type {ControlMode, SimulationSnapshot} from '../rl/types';

interface SimulationCanvasProps {
  snapshot: SimulationSnapshot;
  mode: ControlMode;
  isTrainingBatch: boolean;
}

export function SimulationCanvas({
  snapshot,
  mode,
  isTrainingBatch,
}: SimulationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = WORLD_WIDTH * dpr;
    const targetH = WORLD_HEIGHT * dpr;
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Calm deep-slate aerospace test-bay backdrop
    const bgGrad = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
    bgGrad.addColorStop(0, '#0B1220');
    bgGrad.addColorStop(1, '#121C2F');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // 2. Precision calibration grid (40px spacing)
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 40; x < WORLD_WIDTH; x += 40) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, GROUND_Y);
    }
    for (let y = 40; y < GROUND_Y; y += 40) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(WORLD_WIDTH, y + 0.5);
    }
    ctx.stroke();

    // Out-of-bounds perimeter markers
    ctx.save();
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      DRONE_RADIUS,
      DRONE_RADIUS,
      WORLD_WIDTH - DRONE_RADIUS * 2,
      GROUND_Y - DRONE_RADIUS
    );
    ctx.restore();

    const {drone, platform, actions, trail, status, speed} = snapshot;
    const padLeft = platform.x - platform.width / 2;
    const padRight = platform.x + platform.width / 2;

    // 3. Elevated deck-height reference line (shows above-platform reward threshold)
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = snapshot.isAbovePlatform
      ? 'rgba(56, 189, 248, 0.16)'
      : 'rgba(248, 113, 113, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, platform.y);
    ctx.lineTo(WORLD_WIDTH, platform.y);
    ctx.stroke();
    ctx.restore();

    // Approach corridor guide lines above the landing platform
    const corridorGrad = ctx.createLinearGradient(0, 80, 0, platform.y);
    corridorGrad.addColorStop(0, 'rgba(14, 165, 233, 0)');
    corridorGrad.addColorStop(1, 'rgba(14, 165, 233, 0.08)');
    ctx.fillStyle = corridorGrad;
    ctx.fillRect(padLeft + 6, 80, platform.width - 12, platform.y - 80);

    ctx.save();
    ctx.setLineDash([3, 6]);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.beginPath();
    ctx.moveTo(padLeft + 6, 110);
    ctx.lineTo(padLeft + 6, platform.y);
    ctx.moveTo(padRight - 6, 110);
    ctx.lineTo(padRight - 6, platform.y);
    ctx.stroke();
    ctx.restore();

    // 4. Ground floor slab
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(0, GROUND_Y, WORLD_WIDTH, WORLD_HEIGHT - GROUND_Y);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(WORLD_WIDTH, GROUND_Y);
    ctx.stroke();

    // Subtle ground hash marks
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < WORLD_WIDTH; x += 24) {
      ctx.moveTo(x, GROUND_Y + 2);
      ctx.lineTo(x - 10, WORLD_HEIGHT);
    }
    ctx.stroke();

    // 5. Elevated Landing Platform & support pylons
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(padLeft + 18, platform.y + platform.height);
    ctx.lineTo(padLeft + 8, GROUND_Y);
    ctx.moveTo(padRight - 18, platform.y + platform.height);
    ctx.lineTo(padRight - 8, GROUND_Y);
    ctx.stroke();

    // Cross-brace between pylons
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padLeft + 14, platform.y + platform.height + 10);
    ctx.lineTo(padRight - 10, GROUND_Y - 4);
    ctx.moveTo(padRight - 14, platform.y + platform.height + 10);
    ctx.lineTo(padLeft + 10, GROUND_Y - 4);
    ctx.stroke();

    // Platform deck body
    ctx.fillStyle = '#334155';
    ctx.fillRect(padLeft, platform.y, platform.width, platform.height);

    // Landing deck surface status color
    const speedSafe = speed <= SAFE_SPEED;
    const angleSafe = Math.abs(drone.angle) <= SAFE_ANGLE;
    const deckColor =
      status === 'landed'
        ? '#10B981'
        : status === 'crashed' || status === 'out_of_bounds'
          ? '#EF4444'
          : speedSafe && angleSafe
            ? '#38BDF8'
            : '#F59E0B';

    ctx.fillStyle = deckColor;
    ctx.fillRect(padLeft, platform.y, platform.width, 3);

    // Pad centerline tick
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(platform.x - 1.5, platform.y + 3, 3, platform.height - 3);

    // Pad edge beacons
    ctx.fillStyle = deckColor;
    ctx.beginPath();
    ctx.arc(padLeft + 5, platform.y - 2, 3, 0, Math.PI * 2);
    ctx.arc(padRight - 5, platform.y - 2, 3, 0, Math.PI * 2);
    ctx.fill();

    // Deck label
    ctx.font = '500 10px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#94A3B8';
    ctx.textAlign = 'center';
    ctx.fillText('LANDING DECK', platform.x, platform.y + 26);

    // 6. Motion trail
    if (trail.length > 1) {
      for (let i = 1; i < trail.length; i++) {
        const p0 = trail[i - 1];
        const p1 = trail[i];
        const alpha = (i / trail.length) * 0.65;
        ctx.strokeStyle = p1.main
          ? `rgba(251, 191, 36, ${alpha})`
          : `rgba(56, 189, 248, ${alpha})`;
        ctx.lineWidth = p1.main ? 2 : 1.5;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    }

    // 7. Faint guidance vector to landing deck center
    if (status === 'flying' || status === 'ready') {
      ctx.save();
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(drone.x, drone.y);
      ctx.lineTo(platform.x, platform.y - DRONE_RADIUS);
      ctx.stroke();
      ctx.restore();
    }

    // 8. Velocity vector arrow
    const velScale = 18;
    const vxEnd = drone.x + drone.vx * velScale;
    const vyEnd = drone.y + drone.vy * velScale;
    const velLen = Math.hypot(drone.vx * velScale, drone.vy * velScale);
    if (velLen > 3 && status !== 'landed') {
      const vecColor = speedSafe ? '#38BDF8' : '#F59E0B';
      ctx.strokeStyle = vecColor;
      ctx.fillStyle = vecColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(drone.x, drone.y);
      ctx.lineTo(vxEnd, vyEnd);
      ctx.stroke();

      const ang = Math.atan2(vyEnd - drone.y, vxEnd - drone.x);
      ctx.beginPath();
      ctx.moveTo(vxEnd, vyEnd);
      ctx.lineTo(
        vxEnd - 7 * Math.cos(ang - 0.45),
        vyEnd - 7 * Math.sin(ang - 0.45)
      );
      ctx.lineTo(
        vxEnd - 7 * Math.cos(ang + 0.45),
        vyEnd - 7 * Math.sin(ang + 0.45)
      );
      ctx.closePath();
      ctx.fill();
    }

    // 9. Delivery Drone
    ctx.save();
    ctx.translate(drone.x, drone.y);
    ctx.rotate(drone.angle);

    // Thruster flames (drawn before chassis)
    const flicker = 0.85 + Math.random() * 0.35;
    if (actions.main) {
      ctx.fillStyle = 'rgba(251, 146, 60, 0.9)';
      ctx.beginPath();
      ctx.moveTo(-6, 9);
      ctx.lineTo(6, 9);
      ctx.lineTo(0, 27 * flicker);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(254, 240, 138, 0.95)';
      ctx.beginPath();
      ctx.moveTo(-3, 9);
      ctx.lineTo(3, 9);
      ctx.lineTo(0, 19 * flicker);
      ctx.closePath();
      ctx.fill();
    }

    // Left thruster fires when steering left (nozzle on right pod pushing left)
    if (actions.left) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
      ctx.beginPath();
      ctx.moveTo(15, -3);
      ctx.lineTo(15, 3);
      ctx.lineTo(27 * flicker, 0);
      ctx.closePath();
      ctx.fill();
    }

    // Right thruster fires when steering right (nozzle on left pod pushing right)
    if (actions.right) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
      ctx.beginPath();
      ctx.moveTo(-15, -3);
      ctx.lineTo(-15, 3);
      ctx.lineTo(-27 * flicker, 0);
      ctx.closePath();
      ctx.fill();
    }

    // Landing skids
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-9, 7);
    ctx.lineTo(-12, DRONE_RADIUS);
    ctx.moveTo(-15, DRONE_RADIUS);
    ctx.lineTo(-7, DRONE_RADIUS);

    ctx.moveTo(9, 7);
    ctx.lineTo(12, DRONE_RADIUS);
    ctx.moveTo(7, DRONE_RADIUS);
    ctx.lineTo(15, DRONE_RADIUS);
    ctx.stroke();

    // Rotor arms
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-18, -3);
    ctx.lineTo(18, -3);
    ctx.stroke();

    // Rotor discs
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-23, -6);
    ctx.lineTo(-11, -6);
    ctx.moveTo(11, -6);
    ctx.lineTo(23, -6);
    ctx.stroke();

    // Central drone body & delivery payload pod
    const bodyFill =
      status === 'crashed' || status === 'out_of_bounds'
        ? '#EF4444'
        : status === 'landed'
          ? '#10B981'
          : '#E2E8F0';
    ctx.fillStyle = bodyFill;
    ctx.beginPath();
    ctx.roundRect(-12, -6, 24, 13, 4);
    ctx.fill();

    // Avionics stripe
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(-7, -2, 14, 5);

    // Orientation beacon on top
    ctx.fillStyle = angleSafe ? '#38BDF8' : '#F59E0B';
    ctx.beginPath();
    ctx.arc(0, -7, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Main nozzle
    ctx.fillStyle = '#64748B';
    ctx.fillRect(-5, 7, 10, 3);

    ctx.restore();

    // 10. Clean on-canvas tabular HUD (top-left & top-right)
    ctx.textAlign = 'left';
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#94A3B8';
    ctx.fillText(
      `MODE: ${mode === 'manual' ? 'MANUAL' : 'TRAIN AI'}`,
      16,
      24
    );

    const fuelPct = Math.round((drone.fuel / drone.maxFuel) * 100);
    ctx.fillStyle = fuelPct < 20 ? '#F59E0B' : '#CBD5E1';
    ctx.fillText(`FUEL: ${fuelPct}%`, 16, 42);

    ctx.fillStyle = snapshot.isAbovePlatform ? '#94A3B8' : '#F87171';
    ctx.fillText(
      snapshot.isAbovePlatform ? 'DECK ZONE: ABOVE' : 'DECK ZONE: BELOW (-PENALTY)',
      16,
      60
    );

    ctx.textAlign = 'right';
    const deg = ((drone.angle * 180) / Math.PI).toFixed(1);
    ctx.fillStyle = speedSafe ? '#38BDF8' : '#F59E0B';
    ctx.fillText(
      `SPEED: ${speed.toFixed(2)} / ${SAFE_SPEED.toFixed(2)}`,
      WORLD_WIDTH - 16,
      24
    );
    ctx.fillStyle = angleSafe ? '#38BDF8' : '#F59E0B';
    ctx.fillText(`TILT: ${deg}° / ±16.0°`, WORLD_WIDTH - 16, 42);
    ctx.fillStyle = '#94A3B8';
    ctx.fillText(`STEP: ${snapshot.step} / ${snapshot.maxSteps}`, WORLD_WIDTH - 16, 60);

    // 11. Terminal outcome callout or batch training indicator
    if (isTrainingBatch) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
      ctx.fillRect(WORLD_WIDTH / 2 - 175, WORLD_HEIGHT / 2 - 26, 350, 52);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(WORLD_WIDTH / 2 - 175, WORLD_HEIGHT / 2 - 26, 350, 52);
      ctx.textAlign = 'center';
      ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#F8FAFC';
      ctx.fillText(
        'Training batch in progress — watch the reward curve update',
        WORLD_WIDTH / 2,
        WORLD_HEIGHT / 2 + 4
      );
    } else if (
      status === 'landed' ||
      status === 'crashed' ||
      status === 'out_of_bounds' ||
      status === 'timeout'
    ) {
      const isLanded = status === 'landed';
      const boxW = 360;
      const boxH = 58;
      const bx = WORLD_WIDTH / 2 - boxW / 2;
      const by = 82;

      ctx.fillStyle = isLanded
        ? 'rgba(6, 78, 59, 0.88)'
        : 'rgba(127, 29, 29, 0.88)';
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, 8);
      ctx.fill();

      ctx.strokeStyle = isLanded ? '#34D399' : '#F87171';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.font = '600 14px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(
        isLanded ? 'SAFE TOUCHDOWN' : 'FLIGHT ENDED',
        WORLD_WIDTH / 2,
        by + 23
      );

      ctx.font = '400 12px "IBM Plex Mono", monospace';
      ctx.fillStyle = isLanded ? '#D1FAE5' : '#FECACA';
      ctx.fillText(snapshot.statusDetail, WORLD_WIDTH / 2, by + 43);
    }

    ctx.restore();
  }, [snapshot, mode, isTrainingBatch]);

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
      <canvas
        ref={canvasRef}
        className="block w-full aspect-[5/3]"
        aria-label="2D Drone Landing Simulation Canvas"
      />
    </div>
  );
}
