type WeightedChoice<T> = {
  item: T;
  weight: number;
};

function xmur3(seed: string) {
  let hash = 1779033703 ^ seed.length;

  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  };
}

function mulberry32(seed: number) {
  let state = seed >>> 0;

  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export class SeededRandom {
  private readonly nextValue: () => number;

  constructor(seed: string | number) {
    if (typeof seed === "number") {
      this.nextValue = mulberry32(seed);
      return;
    }

    const hash = xmur3(seed);
    this.nextValue = mulberry32(hash());
  }

  next() {
    return this.nextValue();
  }

  float(min = 0, max = 1) {
    return min + (max - min) * this.next();
  }

  int(min: number, max: number) {
    return Math.floor(this.float(min, max + 1));
  }

  bool(probability = 0.5) {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]) {
    return items[this.int(0, items.length - 1)];
  }

  shuffle<T>(items: readonly T[]) {
    const copy = [...items];

    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = this.int(0, index);
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }

    return copy;
  }

  weightedPick<T>(choices: readonly WeightedChoice<T>[]) {
    const totalWeight = choices.reduce((sum, choice) => sum + choice.weight, 0);
    let cursor = this.float(0, totalWeight);

    for (const choice of choices) {
      cursor -= choice.weight;
      if (cursor <= 0) {
        return choice.item;
      }
    }

    return choices[choices.length - 1].item;
  }

  normal(mean = 0, standardDeviation = 1) {
    const first = Math.max(this.next(), Number.EPSILON);
    const second = this.next();
    const gaussian =
      Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
    return mean + gaussian * standardDeviation;
  }

  fork(label: string) {
    return new SeededRandom(`${label}:${this.int(0, 1_000_000_000)}`);
  }
}

export function createDeterministicIdFactory(seed: string) {
  const random = new SeededRandom(seed);
  let counter = 0;

  return () => {
    const left = counter.toString(36).padStart(6, "0");
    const right = random.int(0, 0xffffffff).toString(16).padStart(8, "0");
    counter += 1;
    return `id_${left}_${right}`;
  };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function roundTo(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function range(count: number, startAt = 1) {
  return Array.from({ length: count }, (_, index) => startAt + index);
}
