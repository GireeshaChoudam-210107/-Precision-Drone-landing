import type {ThrusterActions, ThrusterProbabilities} from './types';

export interface PolicyStepRecord {
  state: Float64Array;
  hidden: Float64Array;
  probs: [number, number, number];
  actions: [0 | 1, 0 | 1, 0 | 1];
  reward: number;
}

/**
 * Small 2-layer Policy Gradient network trained with REINFORCE:
 *   Input (15) -> Hidden (32, tanh) -> Output (3, sigmoid)
 *
 * Each output unit represents the independent Bernoulli probability of firing:
 *   [P(main), P(left), P(right)]
 */
export class ReinforcePolicy {
  readonly inputDim = 15;
  readonly hiddenDim = 48;
  readonly outputDim = 3;

  // Network parameters
  private w1: Float64Array;
  private b1: Float64Array;
  private w2: Float64Array;
  private b2: Float64Array;

  // Adam optimizer moments
  private mw1: Float64Array;
  private vw1: Float64Array;
  private mb1: Float64Array;
  private vb1: Float64Array;
  private mw2: Float64Array;
  private vw2: Float64Array;
  private mb2: Float64Array;
  private vb2: Float64Array;
  private adamStep = 0;

  // Hyperparameters
  private readonly gamma = 0.992;
  private readonly lr = 0.008;
  private readonly entropyCoeff = 0.01;

  // Rollout buffer for batch updates (stabilizes policy gradient variance)
  private pendingEpisodes: PolicyStepRecord[][] = [];
  private currentEpisodeSteps: PolicyStepRecord[] = [];
  private runningBaseline = 0;
  private episodesSeen = 0;

  constructor() {
    this.w1 = new Float64Array(this.inputDim * this.hiddenDim);
    this.b1 = new Float64Array(this.hiddenDim);
    this.w2 = new Float64Array(this.hiddenDim * this.outputDim);
    this.b2 = new Float64Array(this.outputDim);

    this.mw1 = new Float64Array(this.w1.length);
    this.vw1 = new Float64Array(this.w1.length);
    this.mb1 = new Float64Array(this.b1.length);
    this.vb1 = new Float64Array(this.b1.length);
    this.mw2 = new Float64Array(this.w2.length);
    this.vw2 = new Float64Array(this.w2.length);
    this.mb2 = new Float64Array(this.b2.length);
    this.vb2 = new Float64Array(this.b2.length);

    this.resetWeights();
  }

  resetWeights(): void {
    // Xavier initialization for tanh hidden layer and sigmoid output layer
    const scale1 = Math.sqrt(1 / this.inputDim);
    for (let i = 0; i < this.w1.length; i++) {
      this.w1[i] = (Math.random() * 2 - 1) * scale1;
    }
    this.b1.fill(0);

    const scale2 = Math.sqrt(1 / this.hiddenDim);
    for (let i = 0; i < this.w2.length; i++) {
      this.w2[i] = (Math.random() * 2 - 1) * scale2;
    }
    // Slight initial prior on main thruster (~50%), side thrusters (~35%) for exploration
    this.b2[0] = 0.0;
    this.b2[1] = -0.5;
    this.b2[2] = -0.5;

    this.mw1.fill(0);
    this.vw1.fill(0);
    this.mb1.fill(0);
    this.vb1.fill(0);
    this.mw2.fill(0);
    this.vw2.fill(0);
    this.mb2.fill(0);
    this.vb2.fill(0);
    this.adamStep = 0;
    this.pendingEpisodes = [];
    this.currentEpisodeSteps = [];
    this.runningBaseline = 0;
    this.episodesSeen = 0;
  }

  private sigmoid(x: number): number {
    if (x >= 0) {
      const z = Math.exp(-x);
      return 1 / (1 + z);
    } else {
      const z = Math.exp(x);
      return z / (1 + z);
    }
  }

  /**
   * Forward pass: maps 15-value observation state -> hidden activations + 3 thruster probabilities.
   */
  forward(stateVec: number[]): {
    state: Float64Array;
    hidden: Float64Array;
    probs: [number, number, number];
  } {
    const state = Float64Array.from(stateVec);
    const hidden = new Float64Array(this.hiddenDim);

    // Layer 1: tanh(W1 * s + b1)
    for (let h = 0; h < this.hiddenDim; h++) {
      let sum = this.b1[h];
      const offset = h * this.inputDim;
      for (let i = 0; i < this.inputDim; i++) {
        sum += this.w1[offset + i] * state[i];
      }
      hidden[h] = Math.tanh(sum);
    }

    // Layer 2: sigmoid(W2 * h + b2)
    const probs: [number, number, number] = [0.5, 0.5, 0.5];
    for (let o = 0; o < this.outputDim; o++) {
      let sum = this.b2[o];
      const offset = o * this.hiddenDim;
      for (let h = 0; h < this.hiddenDim; h++) {
        sum += this.w2[offset + h] * hidden[h];
      }
      probs[o] = this.sigmoid(sum);
    }

    return {state, hidden, probs};
  }

  /**
   * Samples three independent binary Bernoulli actions from the policy probabilities.
   */
  selectAction(
    stateVec: number[],
    recordStep = true
  ): {
    actions: ThrusterActions;
    probabilities: ThrusterProbabilities;
  } {
    const {state, hidden, probs} = this.forward(stateVec);

    const a0: 0 | 1 = Math.random() < probs[0] ? 1 : 0;
    const a1: 0 | 1 = Math.random() < probs[1] ? 1 : 0;
    const a2: 0 | 1 = Math.random() < probs[2] ? 1 : 0;

    if (recordStep) {
      this.currentEpisodeSteps.push({
        state,
        hidden,
        probs,
        actions: [a0, a1, a2],
        reward: 0,
      });
    }

    return {
      actions: {main: a0, left: a1, right: a2},
      probabilities: {main: probs[0], left: probs[1], right: probs[2]},
    };
  }

  recordReward(reward: number): void {
    const last = this.currentEpisodeSteps[this.currentEpisodeSteps.length - 1];
    if (last) {
      last.reward = reward;
    }
  }

  /**
   * Completes the current episode and performs a REINFORCE policy-gradient update
   * once `batchSize` episodes have been collected (defaults to 4 for stability,
   * or 1 when watching single-episode updates).
   */
  finishEpisode(batchSize = 4): {
    updated: boolean;
    meanReturn: number;
    baselineUsed: number;
  } {
    if (this.currentEpisodeSteps.length > 0) {
      this.pendingEpisodes.push(this.currentEpisodeSteps);
      this.currentEpisodeSteps = [];
      this.episodesSeen += 1;
    }

    if (this.pendingEpisodes.length < batchSize) {
      return {
        updated: false,
        meanReturn: this.runningBaseline,
        baselineUsed: this.runningBaseline,
      };
    }

    const result = this.trainOnBatch(this.pendingEpisodes);
    this.pendingEpisodes = [];
    return {
      updated: true,
      ...result,
    };
  }

  discardCurrentEpisode(): void {
    this.currentEpisodeSteps = [];
  }

  /**
   * Core REINFORCE learning step:
   * 1. Compute discounted returns G_t = r_t + gamma * G_{t+1} backward for each episode
   * 2. Compute mean-return baseline across all collected steps
   * 3. Normalize advantages: A_t = (G_t - meanReturn) / (stdReturn + 1e-8)
   * 4. Accumulate policy gradients: grad log pi(a_t | s_t) * A_t (+ small entropy bonus)
   * 5. Clip gradients and apply Adam update
   */
  private trainOnBatch(episodes: PolicyStepRecord[][]): {
    meanReturn: number;
    baselineUsed: number;
  } {
    const allSteps: PolicyStepRecord[] = [];
    const allReturns: number[] = [];

    // Step 1: Discounted returns G_t per episode
    for (const ep of episodes) {
      const epReturns = new Array<number>(ep.length);
      let runningG = 0;
      for (let t = ep.length - 1; t >= 0; t--) {
        runningG = ep[t].reward + this.gamma * runningG;
        epReturns[t] = runningG;
      }
      for (let t = 0; t < ep.length; t++) {
        allSteps.push(ep[t]);
        allReturns.push(epReturns[t]);
      }
    }

    const n = allReturns.length;
    if (n === 0) {
      return {meanReturn: this.runningBaseline, baselineUsed: this.runningBaseline};
    }

    // Step 2: Mean-return baseline across the batch
    let sumG = 0;
    for (let i = 0; i < n; i++) sumG += allReturns[i];
    const batchMean = sumG / n;

    // Blend batch mean with EMA running baseline for smooth single-episode updates
    const baseline =
      this.adamStep === 0 ? batchMean : 0.7 * batchMean + 0.3 * this.runningBaseline;
    this.runningBaseline = baseline;

    // Step 3: Normalized advantages (G_t - baseline) / (std + eps)
    let sumSqDiff = 0;
    for (let i = 0; i < n; i++) {
      const diff = allReturns[i] - baseline;
      sumSqDiff += diff * diff;
    }
    const std = Math.sqrt(sumSqDiff / n) + 1e-8;

    const gw1 = new Float64Array(this.w1.length);
    const gb1 = new Float64Array(this.b1.length);
    const gw2 = new Float64Array(this.w2.length);
    const gb2 = new Float64Array(this.b2.length);

    // Gentle entropy schedule decays as agent gains experience
    const entropyWeight = this.entropyCoeff * Math.max(0.2, 1 - this.episodesSeen / 350);

    // Step 4: Backpropagate policy gradient loss
    for (let t = 0; t < n; t++) {
      const step = allSteps[t];
      const advantage = (allReturns[t] - baseline) / std;
      const dHidden = new Float64Array(this.hiddenDim);

      for (let o = 0; o < this.outputDim; o++) {
        const p = Math.min(0.999, Math.max(0.001, step.probs[o]));
        const a = step.actions[o];

        // Exact derivative of -log(Bernoulli(a | sigmoid(z))) * advantage w.r.t. logit z:
        // d(-A * log pi)/dz = -A * (a - p)
        // Plus entropy regularization term to keep exploration alive early on
        const dEntropyDz = p * (1 - p) * Math.log((1 - p) / p);
        const dLogit = -(advantage * (a - p) + entropyWeight * dEntropyDz) / n;

        gb2[o] += dLogit;
        const w2Offset = o * this.hiddenDim;
        for (let h = 0; h < this.hiddenDim; h++) {
          gw2[w2Offset + h] += dLogit * step.hidden[h];
          dHidden[h] += dLogit * this.w2[w2Offset + h];
        }
      }

      for (let h = 0; h < this.hiddenDim; h++) {
        // tanh'(z) = 1 - tanh^2(z)
        const dtanh = dHidden[h] * (1 - step.hidden[h] * step.hidden[h]);
        gb1[h] += dtanh;
        const w1Offset = h * this.inputDim;
        for (let i = 0; i < this.inputDim; i++) {
          gw1[w1Offset + i] += dtanh * step.state[i];
        }
      }
    }

    // Step 5: Global gradient norm clipping (maxNorm = 1.0) + Adam step
    this.clipAndApplyAdam(gw1, gb1, gw2, gb2);

    return {meanReturn: batchMean, baselineUsed: baseline};
  }

  private clipAndApplyAdam(
    gw1: Float64Array,
    gb1: Float64Array,
    gw2: Float64Array,
    gb2: Float64Array
  ): void {
    let normSq = 0;
    for (let i = 0; i < gw1.length; i++) normSq += gw1[i] * gw1[i];
    for (let i = 0; i < gb1.length; i++) normSq += gb1[i] * gb1[i];
    for (let i = 0; i < gw2.length; i++) normSq += gw2[i] * gw2[i];
    for (let i = 0; i < gb2.length; i++) normSq += gb2[i] * gb2[i];

    const norm = Math.sqrt(normSq);
    const maxNorm = 1.0;
    const scale = norm > maxNorm ? maxNorm / norm : 1.0;

    this.adamStep += 1;
    const beta1 = 0.9;
    const beta2 = 0.999;
    const eps = 1e-8;
    const bc1 = 1 - Math.pow(beta1, this.adamStep);
    const bc2 = 1 - Math.pow(beta2, this.adamStep);

    const updateParam = (
      param: Float64Array,
      grad: Float64Array,
      m: Float64Array,
      v: Float64Array
    ) => {
      for (let i = 0; i < param.length; i++) {
        const g = grad[i] * scale;
        m[i] = beta1 * m[i] + (1 - beta1) * g;
        v[i] = beta2 * v[i] + (1 - beta2) * g * g;
        const mHat = m[i] / bc1;
        const vHat = v[i] / bc2;
        param[i] -= (this.lr * mHat) / (Math.sqrt(vHat) + eps);
      }
    };

    updateParam(this.w1, gw1, this.mw1, this.vw1);
    updateParam(this.b1, gb1, this.mb1, this.vb1);
    updateParam(this.w2, gw2, this.mw2, this.vw2);
    updateParam(this.b2, gb2, this.mb2, this.vb2);
  }
}
