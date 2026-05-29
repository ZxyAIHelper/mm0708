import { ProgressStatus } from "@prisma/client";
import { clampRate } from "@/lib/domain/scoring";

type ProgressRecord = {
  knowledgePointId: string;
  status: ProgressStatus;
  observedMasteryRate: number;
  gapRate: number;
};

export type ProgressSummary = {
  totalKnowledgePoints: number;
  taughtCount: number;
  masteredCount: number;
  reviewCount: number;
  coverageRate: number;
  masteryRate: number;
  averageGapRate: number;
};

export function summarizeProgress(
  records: ProgressRecord[],
  totalKnowledgePoints: number
): ProgressSummary {
  const taughtRecords = records.filter(
    (record) =>
      record.status === ProgressStatus.COMPLETED ||
      record.status === ProgressStatus.REVIEW
  );
  const reviewCount = records.filter(
    (record) => record.status === ProgressStatus.REVIEW
  ).length;
  const masteredCount = taughtRecords.filter(
    (record) => record.observedMasteryRate >= 0.7
  ).length;

  const averageGapRate =
    records.length === 0
      ? 0
      : records.reduce((sum, record) => sum + record.gapRate, 0) / records.length;

  return {
    totalKnowledgePoints,
    taughtCount: taughtRecords.length,
    masteredCount,
    reviewCount,
    coverageRate:
      totalKnowledgePoints === 0
        ? 0
        : clampRate(taughtRecords.length / totalKnowledgePoints),
    masteryRate:
      taughtRecords.length === 0
        ? 0
        : clampRate(masteredCount / taughtRecords.length),
    averageGapRate
  };
}
