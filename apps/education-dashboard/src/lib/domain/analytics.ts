import { RiskLevel } from "@prisma/client";
import { average, deriveRiskLevel } from "@/lib/domain/scoring";

type KnowledgePointSourceRow = {
  knowledgePointId: string;
  knowledgePointCode: string;
  knowledgePointName: string;
  chapterName: string;
  difficulty: number;
  scoreRate: number;
};

export type KnowledgePointRow = {
  knowledgePointId: string;
  code: string;
  name: string;
  chapterName: string;
  difficulty: number;
  masteryRate: number;
  averageScoreRate: number;
  questionCount: number;
  riskLevel: RiskLevel;
  trendDelta?: number;
  classMasteryRate?: number;
  gapRate?: number;
};

export function buildKnowledgePointRows(
  rows: KnowledgePointSourceRow[],
  options?: {
    trendByKnowledgePoint?: Map<string, number>;
    classMasteryByKnowledgePoint?: Map<string, number>;
  }
) {
  const grouped = new Map<string, KnowledgePointSourceRow[]>();

  for (const row of rows) {
    const current = grouped.get(row.knowledgePointId) ?? [];
    current.push(row);
    grouped.set(row.knowledgePointId, current);
  }

  return [...grouped.entries()]
    .map(([knowledgePointId, group]) => {
      const first = group[0];
      const masteryRate = average(group.map((item) => item.scoreRate));
      const trendDelta =
        options?.trendByKnowledgePoint?.get(knowledgePointId) ?? undefined;
      const classMasteryRate =
        options?.classMasteryByKnowledgePoint?.get(knowledgePointId) ?? undefined;

      return {
        knowledgePointId,
        code: first.knowledgePointCode,
        name: first.knowledgePointName,
        chapterName: first.chapterName,
        difficulty: first.difficulty,
        masteryRate,
        averageScoreRate: masteryRate,
        questionCount: group.length,
        riskLevel: deriveRiskLevel(masteryRate, trendDelta ?? 0),
        trendDelta,
        classMasteryRate,
        gapRate:
          classMasteryRate === undefined ? undefined : masteryRate - classMasteryRate
      } satisfies KnowledgePointRow;
    })
    .sort((left, right) => left.masteryRate - right.masteryRate);
}

export function buildTrendSeries<
  T extends { label: string; averageScore?: number; normalizedScore?: number }
>(rows: T[]) {
  return rows.map((row) => ({
    label: row.label,
    value: row.averageScore ?? row.normalizedScore ?? 0
  }));
}
