import { RiskLevel } from "@prisma/client";

export function clampRate(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function formatPercent(value: number, digits = 1) {
  return `${(clampRate(value) * 100).toFixed(digits)}%`;
}

export function formatScore(value: number, digits = 1) {
  return value.toFixed(digits);
}

export function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

export function riskLevelWeight(riskLevel: RiskLevel) {
  switch (riskLevel) {
    case RiskLevel.CRITICAL:
      return 4;
    case RiskLevel.HIGH:
      return 3;
    case RiskLevel.MEDIUM:
      return 2;
    case RiskLevel.LOW:
    default:
      return 1;
  }
}

export function deriveRiskLevel(masteryRate: number, trendDelta = 0) {
  if (masteryRate < 0.5 || trendDelta < -0.22) {
    return RiskLevel.CRITICAL;
  }

  if (masteryRate < 0.65 || trendDelta < -0.12) {
    return RiskLevel.HIGH;
  }

  if (masteryRate < 0.78 || trendDelta < -0.04) {
    return RiskLevel.MEDIUM;
  }

  return RiskLevel.LOW;
}

export function riskLevelLabel(riskLevel: RiskLevel) {
  switch (riskLevel) {
    case RiskLevel.CRITICAL:
      return "严重预警";
    case RiskLevel.HIGH:
      return "高风险";
    case RiskLevel.MEDIUM:
      return "需关注";
    case RiskLevel.LOW:
    default:
      return "稳定";
  }
}
