import type {
  DroneState,
  EpisodeStatus,
  PlatformState,
  RewardBreakdown,
  RewardReasonItem,
  SimulationSnapshot,
  StateVectorItem,
  ThrusterActions,
  ThrusterProbabilities,
  TrailPoint,
} from './types';

export const WORLD_WIDTH = 800;
export const WORLD_HEIGHT = 480;
export const GROUND_Y = 452;
export const DRONE_RADIUS = 16;

// Tuned 2D flight constants for intuitive manual play and reliable browser RL training
export const GRAVITY = 0.085;
export const MAIN_THRUST = 0.21;
export const SIDE_TORQUE = 0.0052;
export const SIDE_LATERAL_THRUST = 0.055;
export const LINEAR_DAMPING_X = 0.992;
export const LINEAR_DAMPING_Y = 0.995;
export const ANGULAR_DAMPING = 0.92;

// Safe touchdown thresholds
export const SAFE_SPEED = 2.45;
export const SAFE_VX = 1.5;
export const SAFE_VY = 2.15;
export const SAFE_ANGLE = 0.28; // ~16 degrees

export const MAX_FUEL = 350;
export const MAX_STEPS = 320;

const MAX_VEL_NORM = 6.0;
const MAX_ANG_VEL_NORM = 0.22;

export function emptyBreakdown(): RewardBreakdown {
  return {
    approach: 0,
    slowApproach: 0,
    upright: 0,
    fuel: 0,
    belowPlatform: 0,
    outcome: 0,
    total: 0,
  };
}

export function buildRewardReasons(
  breakdown: RewardBreakdown,
  status: EpisodeStatus,
  detail: string
): RewardReasonItem[] {
  return [
    {
      key: 'approach',
      label: 'Platform approach',
      value: breakdown.approach,
      explanation:
        breakdown.approach >= 0
          ? 'Rewarded for closing distance while staying above the landing deck.'
          : 'Penalized for drifting farther away from the landing target.',
    },
    {
      key: 'slowApproach',
      label: 'Controlled speed',
      value: breakdown.slowApproach,
      explanation:
        'Bonus for approaching the platform below the safe touchdown speed limit.',
    },
    {
      key: 'upright',
      label: 'Upright attitude',
      value: breakdown.upright,
      explanation:
        breakdown.upright >= 0
          ? 'Small stability reward for keeping tilt near 0° above the platform.'
          : 'Penalty for excessive tilt angle that risks flipping or sideways crash.',
    },
    {
      key: 'fuel',
      label: 'Fuel economy',
      value: breakdown.fuel,
      explanation:
        status === 'landed'
          ? 'Small thruster burn cost offset by a fuel-conservation bonus on safe landing.'
          : 'Small cost per thruster firing to discourage wasteful hovering.',
    },
    {
      key: 'belowPlatform',
      label: 'Above-deck rule',
      value: breakdown.belowPlatform,
      explanation:
        breakdown.belowPlatform < -0.01
          ? 'Penalty for dropping below platform elevation — prevents hovering underneath for reward.'
          : 'Stayed safely above the landing deck elevation throughout approach.',
    },
    {
      key: 'outcome',
      label: 'Terminal outcome',
      value: breakdown.outcome,
      explanation:
        status === 'landed'
          ? 'Large +130 reward for touching down upright and within safe speed limits.'
          : status === 'flying' || status === 'ready'
            ? 'Pending touchdown — terminal reward or crash penalty applies when the flight ends.'
            : `Penalty applied for flight ending (${detail}).`,
    },
  ];
}

export class DroneEnvironment {
  drone!: DroneState;
  platform!: PlatformState;
  status: EpisodeStatus = 'ready';
  statusDetail = 'Ready for launch';
  stepCount = 0;
  episodeReward = 0;
  breakdown: RewardBreakdown = emptyBreakdown();
  lastActions: ThrusterActions = {main: 0, left: 0, right: 0};
  lastProbabilities: ThrusterProbabilities = {main: 0, left: 0, right: 0};
  trail: TrailPoint[] = [];
  private prevDist = 0;
  private prevSpeed = 0;
  private prevAbsAngle = 0;
  private loggedApproach = false;

  constructor() {
    this.reset(false);
  }

  reset(randomizeStart = true): SimulationSnapshot {
    const platOffset = randomizeStart ? (Math.random() - 0.5) * 90 : 0;
    this.platform = {
      x: WORLD_WIDTH * 0.5 + platOffset,
      y: 408,
      width: 132,
      height: 12,
    };

    const spawnOffset = randomizeStart ? (Math.random() - 0.5) * 180 : -80;
    const spawnY = randomizeStart ? 82 + (Math.random() - 0.5) * 20 : 80;

    this.drone = {
      x: Math.max(90, Math.min(WORLD_WIDTH - 90, WORLD_WIDTH * 0.5 + spawnOffset)),
      y: spawnY,
      vx: randomizeStart ? (Math.random() - 0.5) * 0.6 : 0.2,
      vy: 0,
      angle: randomizeStart ? (Math.random() - 0.5) * 0.08 : 0,
      angVel: 0,
      fuel: MAX_FUEL,
      maxFuel: MAX_FUEL,
    };

    this.status = 'ready';
    this.statusDetail = 'Ready on launch vector';
    this.stepCount = 0;
    this.episodeReward = 0;
    this.breakdown = emptyBreakdown();
    this.lastActions = {main: 0, left: 0, right: 0};
    this.lastProbabilities = {main: 0, left: 0, right: 0};
    this.trail = [{x: this.drone.x, y: this.drone.y, main: false}];
    this.prevDist = this.getDistanceToPad();
    this.prevSpeed = this.getSpeed();
    this.prevAbsAngle = Math.abs(this.drone.angle);
    this.loggedApproach = false;

    return this.getSnapshot();
  }

  private getTargetY(): number {
    return this.platform.y - DRONE_RADIUS;
  }

  getDistanceToPad(): number {
    const dx = this.platform.x - this.drone.x;
    const dy = this.getTargetY() - this.drone.y;
    return Math.hypot(dx, dy);
  }

  getSpeed(): number {
    return Math.hypot(this.drone.vx, this.drone.vy);
  }

  isAbovePlatform(): boolean {
    return this.drone.y <= this.platform.y - DRONE_RADIUS + 2;
  }

  /**
   * Produces the exact 15-value normalized observation vector:
   * 0: drone x, 1: drone y, 2: vx, 3: vy, 4: angle, 5: angVel,
   * 6: fuel, 7: platform x, 8: platform y, 9: dx offset, 10: dy offset,
   * 11: euclidean distance, 12: speed, 13: landed flag, 14: crashed flag
   */
  getStateItems(): StateVectorItem[] {
    const dx = this.platform.x - this.drone.x;
    const dy = this.getTargetY() - this.drone.y;
    const dist = Math.hypot(dx, dy);
    const speed = Math.hypot(this.drone.vx, this.drone.vy);
    const maxDiag = Math.hypot(WORLD_WIDTH, WORLD_HEIGHT);

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

    const landedFlag = this.status === 'landed' ? 1 : 0;
    const crashedFlag =
      this.status === 'crashed' || this.status === 'out_of_bounds' ? 1 : 0;

    return [
      {
        index: 0,
        key: 'x_norm',
        label: 'Drone X',
        normalized: (this.drone.x / WORLD_WIDTH) * 2 - 1,
        rawDisplay: `${this.drone.x.toFixed(0)} px`,
      },
      {
        index: 1,
        key: 'y_norm',
        label: 'Drone Y',
        normalized: (this.drone.y / WORLD_HEIGHT) * 2 - 1,
        rawDisplay: `${this.drone.y.toFixed(0)} px`,
      },
      {
        index: 2,
        key: 'vx_norm',
        label: 'Velocity X',
        normalized: clamp(this.drone.vx / MAX_VEL_NORM, -1.5, 1.5),
        rawDisplay: `${this.drone.vx.toFixed(2)}`,
      },
      {
        index: 3,
        key: 'vy_norm',
        label: 'Velocity Y',
        normalized: clamp(this.drone.vy / MAX_VEL_NORM, -1.5, 1.5),
        rawDisplay: `${this.drone.vy.toFixed(2)}`,
      },
      {
        index: 4,
        key: 'angle_norm',
        label: 'Tilt Angle',
        normalized: clamp(this.drone.angle / Math.PI, -1, 1),
        rawDisplay: `${((this.drone.angle * 180) / Math.PI).toFixed(1)}°`,
      },
      {
        index: 5,
        key: 'angVel_norm',
        label: 'Angular Vel',
        normalized: clamp(this.drone.angVel / MAX_ANG_VEL_NORM, -1.5, 1.5),
        rawDisplay: `${this.drone.angVel.toFixed(3)} rad/f`,
      },
      {
        index: 6,
        key: 'fuel_norm',
        label: 'Fuel Level',
        normalized: this.drone.fuel / this.drone.maxFuel,
        rawDisplay: `${Math.round((this.drone.fuel / this.drone.maxFuel) * 100)}%`,
      },
      {
        index: 7,
        key: 'platX_norm',
        label: 'Platform X',
        normalized: (this.platform.x / WORLD_WIDTH) * 2 - 1,
        rawDisplay: `${this.platform.x.toFixed(0)} px`,
      },
      {
        index: 8,
        key: 'platY_norm',
        label: 'Platform Y',
        normalized: (this.platform.y / WORLD_HEIGHT) * 2 - 1,
        rawDisplay: `${this.platform.y.toFixed(0)} px`,
      },
      {
        index: 9,
        key: 'dx_norm',
        label: 'Offset ΔX',
        normalized: clamp(dx / 240, -1.5, 1.5),
        rawDisplay: `${dx >= 0 ? '+' : ''}${dx.toFixed(0)} px`,
      },
      {
        index: 10,
        key: 'dy_norm',
        label: 'Offset ΔY',
        normalized: clamp(dy / 240, -1.5, 1.5),
        rawDisplay: `${dy >= 0 ? '+' : ''}${dy.toFixed(0)} px`,
      },
      {
        index: 11,
        key: 'dist_norm',
        label: 'Pad Distance',
        normalized: dist / maxDiag,
        rawDisplay: `${dist.toFixed(0)} px`,
      },
      {
        index: 12,
        key: 'speed_norm',
        label: 'Total Speed',
        normalized: clamp(speed / MAX_VEL_NORM, 0, 1.5),
        rawDisplay: `${speed.toFixed(2)}`,
      },
      {
        index: 13,
        key: 'landed',
        label: 'Landed Flag',
        normalized: landedFlag,
        rawDisplay: landedFlag === 1 ? 'TRUE' : 'FALSE',
      },
      {
        index: 14,
        key: 'crashed',
        label: 'Crashed Flag',
        normalized: crashedFlag,
        rawDisplay: crashedFlag === 1 ? 'TRUE' : 'FALSE',
      },
    ];
  }

  getStateVector(): number[] {
    return this.getStateItems().map((item) => item.normalized);
  }

  step(
    requestedActions: ThrusterActions,
    probabilities: ThrusterProbabilities = {
      main: requestedActions.main,
      left: requestedActions.left,
      right: requestedActions.right,
    }
  ): {
    snapshot: SimulationSnapshot;
    stepReward: number;
    done: boolean;
    eventMessage: string | null;
    eventKind: 'approach' | 'landed' | 'crash' | 'oob' | null;
  } {
    if (
      this.status === 'landed' ||
      this.status === 'crashed' ||
      this.status === 'out_of_bounds' ||
      this.status === 'timeout'
    ) {
      return {
        snapshot: this.getSnapshot(),
        stepReward: 0,
        done: true,
        eventMessage: null,
        eventKind: null,
      };
    }

    this.status = 'flying';
    this.statusDetail = 'In flight';
    this.stepCount += 1;

    const mainActive: 0 | 1 = requestedActions.main && this.drone.fuel > 0 ? 1 : 0;
    const leftActive: 0 | 1 = requestedActions.left && this.drone.fuel > 0 ? 1 : 0;
    const rightActive: 0 | 1 = requestedActions.right && this.drone.fuel > 0 ? 1 : 0;

    const effectiveActions: ThrusterActions = {
      main: mainActive,
      left: leftActive,
      right: rightActive,
    };
    this.lastActions = effectiveActions;
    this.lastProbabilities = probabilities;

    const prevY = this.drone.y;

    let ax = 0;
    let ay = GRAVITY;

    if (mainActive) {
      ax += Math.sin(this.drone.angle) * MAIN_THRUST;
      ay -= Math.cos(this.drone.angle) * MAIN_THRUST;
      this.drone.fuel = Math.max(0, this.drone.fuel - 1.0);
    }

    if (leftActive) {
      this.drone.angVel -= SIDE_TORQUE;
      ax -= SIDE_LATERAL_THRUST;
      this.drone.fuel = Math.max(0, this.drone.fuel - 0.45);
    }

    if (rightActive) {
      this.drone.angVel += SIDE_TORQUE;
      ax += SIDE_LATERAL_THRUST;
      this.drone.fuel = Math.max(0, this.drone.fuel - 0.45);
    }

    // Subtle flight-controller roll damping keeps manual and RL flight controllable
    this.drone.angVel -= this.drone.angle * 0.0022;

    this.drone.vx = (this.drone.vx + ax) * LINEAR_DAMPING_X;
    this.drone.vy = (this.drone.vy + ay) * LINEAR_DAMPING_Y;
    this.drone.angVel *= ANGULAR_DAMPING;

    this.drone.x += this.drone.vx;
    this.drone.y += this.drone.vy;
    this.drone.angle += this.drone.angVel;

    if (this.drone.angle > Math.PI) this.drone.angle -= 2 * Math.PI;
    if (this.drone.angle < -Math.PI) this.drone.angle += 2 * Math.PI;

    if (this.stepCount % 2 === 0) {
      this.trail.push({x: this.drone.x, y: this.drone.y, main: mainActive === 1});
      if (this.trail.length > 90) this.trail.shift();
    }

    const speed = this.getSpeed();
    const dist = this.getDistanceToPad();
    const halfPad = this.platform.width * 0.5;
    const dxPad = Math.abs(this.drone.x - this.platform.x);

    let done = false;
    let padImpact = false;
    let eventMessage: string | null = null;
    let eventKind: 'approach' | 'landed' | 'crash' | 'oob' | null = null;

    const crossedTopDeck =
      prevY + DRONE_RADIUS <= this.platform.y + 5 &&
      this.drone.y + DRONE_RADIUS >= this.platform.y &&
      dxPad <= halfPad - 6;

    const hitPlatformStructure =
      !crossedTopDeck &&
      this.drone.y + DRONE_RADIUS > this.platform.y + 3 &&
      this.drone.y - DRONE_RADIUS < this.platform.y + this.platform.height &&
      dxPad < halfPad + DRONE_RADIUS * 0.7;

    if (crossedTopDeck) {
      this.drone.y = this.platform.y - DRONE_RADIUS;
      const vxOk = Math.abs(this.drone.vx) <= SAFE_VX;
      const vyOk = Math.abs(this.drone.vy) <= SAFE_VY;
      const speedOk = speed <= SAFE_SPEED;
      const angleOk = Math.abs(this.drone.angle) <= SAFE_ANGLE;

      if (vxOk && vyOk && speedOk && angleOk) {
        this.status = 'landed';
        this.statusDetail = 'Landed safely on platform';
        this.drone.vx = 0;
        this.drone.vy = 0;
        this.drone.angVel = 0;
        done = true;
        eventKind = 'landed';
        eventMessage = `Landed safely (speed ${speed.toFixed(2)}, tilt ${((this.drone.angle * 180) / Math.PI).toFixed(1)}°)`;
      } else {
        this.status = 'crashed';
        padImpact = true;
        if (!angleOk) {
          this.statusDetail = 'crashed: tilted too steeply at touchdown';
        } else if (!vxOk) {
          this.statusDetail = 'crashed: too much horizontal speed';
        } else if (!vyOk) {
          this.statusDetail = 'crashed: vertical descent too fast';
        } else {
          this.statusDetail = 'crashed: total landing speed exceeded limit';
        }
        done = true;
        eventKind = 'crash';
        eventMessage = `${this.statusDetail} (v=${speed.toFixed(2)})`;
      }
    } else if (hitPlatformStructure) {
      this.status = 'crashed';
      this.statusDetail = 'crashed: struck side or underside of platform';
      done = true;
      eventKind = 'crash';
      eventMessage = this.statusDetail;
    } else if (
      this.drone.x < DRONE_RADIUS ||
      this.drone.x > WORLD_WIDTH - DRONE_RADIUS ||
      this.drone.y < DRONE_RADIUS
    ) {
      this.status = 'out_of_bounds';
      this.statusDetail =
        this.drone.y < DRONE_RADIUS
          ? 'out of bounds: climbed past ceiling'
          : 'out of bounds: drifted past bay perimeter';
      done = true;
      eventKind = 'oob';
      eventMessage = this.statusDetail;
    } else if (this.drone.y + DRONE_RADIUS >= GROUND_Y) {
      this.drone.y = GROUND_Y - DRONE_RADIUS;
      this.status = 'crashed';
      this.statusDetail = 'crashed: hit ground off-platform';
      done = true;
      eventKind = 'crash';
      eventMessage = this.statusDetail;
    } else if (this.stepCount >= MAX_STEPS) {
      this.status = 'timeout';
      this.statusDetail = 'timed out: did not land in time';
      done = true;
      eventKind = 'crash';
      eventMessage = this.statusDetail;
    }

    const abovePlatform = this.isAbovePlatform();
    const absAngle = Math.abs(this.drone.angle);
    let rApproach = 0;
    let rSlow = 0;
    let rUpright = 0;
    let rFuel = 0;
    let rBelow = 0;
    let rOutcome = 0;

    if (!done) {
      if (abovePlatform) {
        // Pure potential difference for approaching the platform above deck (cannot farm by hovering)
        const distDelta = this.prevDist - dist;
        rApproach = distDelta * 0.34;

        // Potential-based speed reduction near the pad + penalty for excessive speed
        if (dist < 170) {
          const prevExcess = Math.max(0, this.prevSpeed - SAFE_SPEED * 0.8);
          const currExcess = Math.max(0, speed - SAFE_SPEED * 0.8);
          rSlow = (prevExcess - currExcess) * 2.4;
          if (speed > SAFE_SPEED) {
            rSlow -= 0.08;
          }
        }

        // Potential-based upright correction reward minus tilt penalty
        rUpright = (this.prevAbsAngle - absAngle) * 3.0 - absAngle * 0.08;
      } else {
        // Explicit penalty below platform deck so hovering underneath is never profitable
        rBelow = -0.6;
        rUpright = -0.15;
      }

      // Small thruster fuel cost + step time penalty to prevent idling
      rFuel = -(mainActive * 0.015 + (leftActive + rightActive) * 0.008) - 0.12;

      if (!this.loggedApproach && abovePlatform && dist < 130 && dxPad < halfPad + 25) {
        this.loggedApproach = true;
        eventMessage = 'Approaching platform within alignment corridor';
        eventKind = 'approach';
      }
    } else {
      if (this.status === 'landed') {
        rOutcome = 150;
        rSlow += 20 * (1 - speed / SAFE_SPEED);
        rUpright += 10 * (1 - absAngle / SAFE_ANGLE);
        rFuel += 25 * (this.drone.fuel / this.drone.maxFuel);
      } else if (padImpact) {
        const excessSpeed = Math.max(0, speed - SAFE_SPEED);
        const excessAngle = Math.max(0, absAngle - SAFE_ANGLE);
        rOutcome = -40 - Math.min(40, excessSpeed * 14 + excessAngle * 40);
      } else if (this.status === 'crashed') {
        rOutcome = -100 - Math.min(25, speed * 4);
      } else if (this.status === 'out_of_bounds') {
        rOutcome = -105;
      } else if (this.status === 'timeout') {
        rOutcome = -95;
      }
    }

    const stepReward = rApproach + rSlow + rUpright + rFuel + rBelow + rOutcome;

    this.breakdown.approach += rApproach;
    this.breakdown.slowApproach += rSlow;
    this.breakdown.upright += rUpright;
    this.breakdown.fuel += rFuel;
    this.breakdown.belowPlatform += rBelow;
    this.breakdown.outcome += rOutcome;
    this.breakdown.total += stepReward;
    this.episodeReward += stepReward;

    this.prevDist = dist;
    this.prevSpeed = speed;
    this.prevAbsAngle = absAngle;

    return {
      snapshot: this.getSnapshot(),
      stepReward,
      done,
      eventMessage,
      eventKind,
    };
  }

  getSnapshot(): SimulationSnapshot {
    const stateItems = this.getStateItems();
    return {
      drone: {...this.drone},
      platform: {...this.platform},
      actions: {...this.lastActions},
      probabilities: {...this.lastProbabilities},
      status: this.status,
      statusDetail: this.statusDetail,
      step: this.stepCount,
      maxSteps: MAX_STEPS,
      episodeReward: this.episodeReward,
      breakdown: {...this.breakdown},
      stateVector: stateItems.map((i) => i.normalized),
      stateItems,
      trail: [...this.trail],
      isAbovePlatform: this.isAbovePlatform(),
      speed: this.getSpeed(),
      distanceToPad: this.getDistanceToPad(),
    };
  }
}
