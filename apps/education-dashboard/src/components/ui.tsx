import Link from "next/link";
import { ReactNode } from "react";
import { RiskLevel } from "@prisma/client";
import { formatPercent, riskLevelLabel } from "@/lib/domain/scoring";

export function SectionCard({
  title,
  description,
  children,
  action
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function StatCard({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-2 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function RiskPill({ riskLevel }: { riskLevel: RiskLevel }) {
  const palette: Record<RiskLevel, string> = {
    LOW: "bg-emerald-100 text-emerald-700",
    MEDIUM: "bg-amber-100 text-amber-800",
    HIGH: "bg-orange-100 text-orange-800",
    CRITICAL: "bg-rose-100 text-rose-700"
  };

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${palette[riskLevel]}`}>
      {riskLevelLabel(riskLevel)}
    </span>
  );
}

export function Meter({
  value,
  tone = "blue"
}: {
  value: number;
  tone?: "blue" | "emerald" | "amber" | "rose";
}) {
  const colorMap = {
    blue: "bg-blue-500",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500"
  } as const;

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full ${colorMap[tone]}`}
        style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}

export function SuggestionList({
  items
}: {
  items: {
    id: string;
    title: string;
    summary: string;
    rationale: string;
  }[];
}) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-semibold text-slate-900">{item.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{item.summary}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{item.rationale}</p>
        </div>
      ))}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
          当前没有额外建议。
        </div>
      ) : null}
    </div>
  );
}

export function KnowledgePointTable({
  rows,
  showGap = false
}: {
  rows: {
    knowledgePointId?: string;
    name: string;
    chapterName: string;
    masteryRate: number;
    trendDelta?: number;
    questionCount?: number;
    gapRate?: number;
    riskLevel: RiskLevel;
  }[];
  showGap?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-slate-500">
          <tr className="border-b border-slate-200">
            <th className="pb-3 font-medium">知识点</th>
            <th className="pb-3 font-medium">章节</th>
            <th className="pb-3 font-medium">掌握度</th>
            <th className="pb-3 font-medium">趋势</th>
            {showGap ? <th className="pb-3 font-medium">与班级差值</th> : null}
            <th className="pb-3 font-medium">风险</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.chapterName}-${row.name}`} className="border-b border-slate-100 align-top">
              <td className="py-3 font-medium text-slate-900">{row.name}</td>
              <td className="py-3 text-slate-600">{row.chapterName}</td>
              <td className="py-3">
                <div className="space-y-2">
                  <p className="text-slate-900">{formatPercent(row.masteryRate)}</p>
                  <Meter
                    value={row.masteryRate}
                    tone={row.masteryRate < 0.55 ? "rose" : row.masteryRate < 0.7 ? "amber" : "blue"}
                  />
                </div>
              </td>
              <td className="py-3 text-slate-600">
                {row.trendDelta === undefined
                  ? "—"
                  : `${row.trendDelta > 0 ? "+" : ""}${formatPercent(Math.abs(row.trendDelta))}`}
              </td>
              {showGap ? (
                <td className="py-3 text-slate-600">
                  {row.gapRate === undefined
                    ? "—"
                    : `${row.gapRate > 0 ? "+" : ""}${formatPercent(Math.abs(row.gapRate))}`}
                </td>
              ) : null}
              <td className="py-3">
                <RiskPill riskLevel={row.riskLevel} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StudentRiskTable({
  rows
}: {
  rows: {
    id: string;
    name: string;
    averageScore: number;
    masteryRate: number;
    persistentWeakPointCount: number;
    overdueHomeworkCount: number;
    riskLevel: RiskLevel;
  }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-slate-500">
          <tr className="border-b border-slate-200">
            <th className="pb-3 font-medium">学生</th>
            <th className="pb-3 font-medium">平均分率</th>
            <th className="pb-3 font-medium">知识点掌握度</th>
            <th className="pb-3 font-medium">持续薄弱点</th>
            <th className="pb-3 font-medium">逾期作业</th>
            <th className="pb-3 font-medium">风险</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-100">
              <td className="py-3 font-medium text-slate-900">
                <Link className="text-blue-600 hover:underline" href={`/students/${row.id}`}>
                  {row.name}
                </Link>
              </td>
              <td className="py-3 text-slate-700">{formatPercent(row.averageScore)}</td>
              <td className="py-3 text-slate-700">{formatPercent(row.masteryRate)}</td>
              <td className="py-3 text-slate-700">{row.persistentWeakPointCount}</td>
              <td className="py-3 text-slate-700">{row.overdueHomeworkCount}</td>
              <td className="py-3">
                <RiskPill riskLevel={row.riskLevel} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
