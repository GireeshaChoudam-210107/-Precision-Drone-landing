export type ControlMode = 'manual' | 'ai';

export type EpisodeStatus =
  | 'ready'
  | 'flying'
  | 'landed'
  | 'crashed'
  | 'out_of_bounds'
  | 'timeout';

export interface ThrusterActions {
  main: 0 | 1;
  left: 0 | 1;
  right: 0 | 1;
}

export interface ThrusterProbabilities {
  main: number;
  left: number;
  right: number;
}

export interface PlatformState {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DroneState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angVel: number;
  fuel: number;
  maxFuel: number;
}

export interface RewardBreakdown {
  approach: number;
  slowApproach: number;
  upright: number;
  fuel: number;
  belowPlatform: number;
  outcome: number;
  total: number;
}

export interface RewardReasonItem {
  key: keyof Omit<RewardBreakdown, 'total'>;
  label: string;
  value: number;
  explanation: string;
}

export interface StateVectorItem {
  index: number;
  key: string;
  label: string;
  normalized: number;
  rawDisplay: string;
}

export interface TrailPoint {
  x: number;
  y: number;
  main: boolean;
}

export interface SimulationSnapshot {
  drone: DroneState;
  platform: PlatformState;
  actions: ThrusterActions;
  probabilities: ThrusterProbabilities;
  status: EpisodeStatus;
  statusDetail: string;
  step: number;
  maxSteps: number;
  episodeReward: number;
  breakdown: RewardBreakdown;
  stateVector: number[];
  stateItems: StateVectorItem[];
  trail: TrailPoint[];
  isAbovePlatform: boolean;
  speed: number;
  distanceToPad: number;
}

export interface EpisodeSummary {
  episode: number;
  totalReward: number;
  landed: boolean;
  status: EpisodeStatus;
  reason: string;
  steps: number;
  fuelRemainingPct: number;
  breakdown: RewardBreakdown;
  reasonItems: RewardReasonItem[];
}

export interface TrainingLogEntry {
  id: number;
  episode: number;
  kind: 'info' | 'approach' | 'landed' | 'crash' | 'oob' | 'train';
  message: string;
}
