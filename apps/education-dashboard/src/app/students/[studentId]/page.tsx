import { SubjectCode } from "@prisma/client";
import { AppShell } from "@/components/layout/app-shell";
import {
  KnowledgePointTable,
  Meter,
  SectionCard,
  StatCard,
  SuggestionList
} from "@/components/ui";
import { formatPercent, formatScore } from "@/lib/domain/scoring";
import { getStudentDashboard } from "@/lib/queries/student";

export const dynamic = "force-dynamic";

type StudentPageProps = {
  params: Promise<{ studentId: string }>;
  searchParams?: Promise<{ subject?: SubjectCode }>;
};

export default async function StudentPage({
  params,
  searchParams
}: StudentPageProps) {
  const { studentId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const data = await getStudentDashboard(studentId, resolvedSearchParams.subject);

  return (
    <AppShell
      currentPath="/teacher"
      title={`学生画像：${data.student.name}`}
      subtitle={`所属班级：${data.student.className}。从知识点掌握、近期趋势和个体建议三个角度看单个学生。`}
    >
      <div className="space-y-6">
        <SectionCard title="分析维度" description="切换学科查看同一学生的不同画像。">
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
              更新画像
            </button>
          </form>
        </SectionCard>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StatCard label="学生" value={data.student.name} hint={data.student.className} />
          <StatCard label="平均分" value={formatScore(data.summary.averageScore)} />
          <StatCard label="知识点掌握度" value={formatPercent(data.summary.masteryRate)} />
          <StatCard label="持续薄弱点" value={String(data.summary.persistentWeakPointCount)} />
          <StatCard label="逾期作业" value={String(data.summary.overdueHomeworkCount)} />
          <StatCard
            label="班级均分"
            value={formatScore(data.summary.classAverageScore)}
            hint={`班级掌握度 ${formatPercent(data.summary.classMasteryRate)}`}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
          <SectionCard title="知识点掌握画像" description="按知识点展开，重点看个人掌握度和相对班级差值。">
            <KnowledgePointTable rows={data.knowledgePointRows.slice(0, 12)} showGap />
          </SectionCard>
          <SectionCard title="个体建议" description="先补什么、先盯什么，一眼看清。">
            <SuggestionList items={data.suggestions} />
          </SectionCard>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <SectionCard title="最近考试走势" description="观察当前学生是否在持续改善。">
            <div className="space-y-3">
              {data.trendSeries.map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-slate-900">{item.label}</p>
                    <span className="text-sm text-slate-600">
                      {formatPercent(item.value)}
                    </span>
                  </div>
                  <div className="mt-3">
                    <Meter value={item.value} tone="blue" />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="学期进度背景" description="判断这是“未学到”还是“学过但没学会”。">
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
                  <span>班级知识点覆盖率</span>
                  <span>{formatPercent(data.progressSummary.coverageRate)}</span>
                </div>
                <Meter value={data.progressSummary.coverageRate} tone="blue" />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
                  <span>已教知识点达标率</span>
                  <span>{formatPercent(data.progressSummary.masteryRate)}</span>
                </div>
                <Meter value={data.progressSummary.masteryRate} tone="emerald" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  label="平均掌握缺口"
                  value={formatPercent(Math.abs(data.progressSummary.averageGapRate))}
                />
                <StatCard
                  label="总知识点数"
                  value={formatScore(data.progressSummary.totalKnowledgePoints, 0)}
                />
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
