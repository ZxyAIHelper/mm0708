import { SubjectCode } from "@prisma/client";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import {
  KnowledgePointTable,
  Meter,
  RiskPill,
  SectionCard,
  StatCard,
  SuggestionList
} from "@/components/ui";
import { formatPercent, formatScore } from "@/lib/domain/scoring";
import { getPrincipalDashboard } from "@/lib/queries/principal";

export const dynamic = "force-dynamic";

type PrincipalPageProps = {
  searchParams?: Promise<{ subject?: SubjectCode }>;
};

export default async function PrincipalPage({ searchParams }: PrincipalPageProps) {
  const params = (await searchParams) ?? {};
  const data = await getPrincipalDashboard(params.subject);

  return (
    <AppShell
      currentPath="/principal"
      title="校长 / 教育局总览"
      subtitle="聚焦全校学科均值、中位数、班级强弱分布和重点风险班级，快速识别需要干预的教学区域。"
    >
      <div className="space-y-6">
        <SectionCard title="学科视角" description="切换不同学科看全校总览。">
          <form className="flex flex-wrap items-end gap-3">
            <label className="space-y-2">
              <span className="text-sm text-slate-600">学科</span>
              <select
                name="subject"
                defaultValue={data.selectedSubject.code}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                {data.subjectOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-2xl bg-slate-900 px-4 py-3 font-medium text-white"
            >
              更新总览
            </button>
          </form>
        </SectionCard>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StatCard label="学科" value={data.selectedSubject.label} />
          <StatCard label="全校均分" value={formatScore(data.summary.averageScore)} />
          <StatCard label="全校中位分" value={formatScore(data.summary.medianScore)} />
          <StatCard label="平均得分率" value={formatPercent(data.summary.averageNormalizedScore)} />
          <StatCard label="风险知识点" value={String(data.summary.weakKnowledgePointCount)} />
          <StatCard label="覆盖知识点" value={String(data.summary.curriculumKnowledgePointCount)} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
          <SectionCard title="班级强弱分布" description="低均分、高风险和进度落后的班级会优先暴露出来。">
            <div className="space-y-3">
              {data.classDistribution.map((row) => (
                <div key={row.classId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          className="font-semibold text-slate-900 hover:text-blue-600"
                          href={`/teacher?classId=${row.classId}&subject=${data.selectedSubject.code}`}
                        >
                          {row.className}
                        </Link>
                        <RiskPill riskLevel={row.riskLevel} />
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        当前最弱知识点：{row.weakestKnowledgePointName}
                      </p>
                    </div>
                    <div className="grid min-w-[320px] gap-3 md:grid-cols-3">
                      <div>
                        <p className="text-xs text-slate-500">平均分</p>
                        <p className="text-lg font-semibold text-slate-900">
                          {formatScore(row.averageScore)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">掌握度</p>
                        <p className="text-lg font-semibold text-slate-900">
                          {formatPercent(row.masteryRate)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">教学进度</p>
                        <p className="text-lg font-semibold text-slate-900">
                          {formatPercent(row.progressRate)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs text-slate-500">掌握度</p>
                      <Meter value={row.masteryRate} tone="blue" />
                    </div>
                    <div>
                      <p className="mb-2 text-xs text-slate-500">教学进度</p>
                      <Meter value={row.progressRate} tone="emerald" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="全校干预建议" description="面向管理者的轻量建议，突出优先级。">
            <SuggestionList items={data.suggestions} />
          </SectionCard>
        </div>

        <SectionCard title="全校薄弱知识点热区" description="按学科看全校最弱知识点，便于集中组织教研。">
          <KnowledgePointTable
            rows={data.weakKnowledgePoints.map((row) => ({
              name: row.knowledgePointName,
              chapterName: row.chapterName,
              masteryRate: row.masteryRate,
              trendDelta: row.trendDelta,
              riskLevel: row.riskLevel
            }))}
          />
        </SectionCard>
      </div>
    </AppShell>
  );
}
