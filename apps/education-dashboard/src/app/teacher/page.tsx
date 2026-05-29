import { SubjectCode } from "@prisma/client";
import { AppShell } from "@/components/layout/app-shell";
import {
  KnowledgePointTable,
  Meter,
  SectionCard,
  StatCard,
  StudentRiskTable,
  SuggestionList
} from "@/components/ui";
import { formatPercent, formatScore } from "@/lib/domain/scoring";
import { getTeacherDashboard } from "@/lib/queries/teacher";

export const dynamic = "force-dynamic";

type TeacherPageProps = {
  searchParams?: Promise<{
    classId?: string;
    subject?: SubjectCode;
    window?: "aggregate" | "latest";
  }>;
};

export default async function TeacherPage({ searchParams }: TeacherPageProps) {
  const params = (await searchParams) ?? {};
  const data = await getTeacherDashboard(params);

  return (
    <AppShell
      currentPath="/teacher"
      title="老师工作台"
      subtitle="围绕班级薄弱知识点、重点学生和教学建议，快速完成班级诊断与分层辅导。"
    >
      <div className="space-y-6">
        <SectionCard title="筛选条件" description="支持班级、学科与分析窗口切换。">
          <form className="grid gap-3 md:grid-cols-4">
            <label className="space-y-2">
              <span className="text-sm text-slate-600">班级</span>
              <select
                name="classId"
                defaultValue={data.selectedClass.id}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                {data.classOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm text-slate-600">学科</span>
              <select
                name="subject"
                defaultValue={data.selectedSubject.code}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                {data.subjectOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm text-slate-600">窗口</span>
              <select
                name="window"
                defaultValue={params.window ?? "aggregate"}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                <option value="aggregate">阶段汇总</option>
                <option value="latest">最近考试</option>
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full rounded-2xl bg-slate-900 px-4 py-3 font-medium text-white"
              >
                更新分析
              </button>
            </div>
          </form>
        </SectionCard>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StatCard label="班级" value={data.selectedClass.label} hint={`任课教师：${data.selectedTeacher}`} />
          <StatCard label="当前窗口" value={data.currentWindowLabel} />
          <StatCard label="平均分" value={formatScore(data.summary.averageScore)} />
          <StatCard label="掌握度" value={formatPercent(data.summary.masteryRate)} />
          <StatCard label="及格率" value={formatPercent(data.summary.passRate)} />
          <StatCard label="教学进度" value={formatPercent(data.summary.progressRate)} hint={`已覆盖 ${data.summary.taughtCount} 个知识点`} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <SectionCard
            title="班级薄弱知识点"
            description={`当前最需要优先补弱的是：${data.summary.weakestKnowledgePointName}`}
          >
            <KnowledgePointTable rows={data.weakKnowledgePoints} />
          </SectionCard>

          <SectionCard title="教学建议" description="规则化生成，便于老师直接采用。">
            <SuggestionList items={data.suggestions} />
          </SectionCard>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <SectionCard title="重点学生名单" description="优先关注低掌握度、持续薄弱点多和逾期作业多的学生。">
            <StudentRiskTable rows={data.riskStudents} />
          </SectionCard>

          <SectionCard title="学期推进情况" description="把“教到哪里”和“学会多少”放在一起看。">
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
                  <span>知识点覆盖率</span>
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
                  label="复习知识点"
                  value={String(data.progressSummary.reviewCount)}
                />
                <StatCard
                  label="平均掌握缺口"
                  value={formatPercent(Math.abs(data.progressSummary.averageGapRate))}
                />
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-700">最近 8 条教学推进记录</p>
                <div className="mt-3 space-y-3">
                  {data.progressRecords.map((record) => (
                    <div key={record.id} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-slate-900">{record.knowledgePointName}</p>
                        <span className="text-xs text-slate-500">第 {record.weekIndex} 周</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{record.chapterName}</p>
                      <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                        <span>观察掌握度 {formatPercent(record.observedMasteryRate)}</span>
                        <span>缺口 {formatPercent(Math.abs(record.gapRate))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="最近考试走势" description="阶段汇总之外，仍然保留单次考试的波动信息。">
          <div className="grid gap-3 md:grid-cols-4">
            {data.trendSeries.map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {formatPercent(item.value)}
                </p>
                <div className="mt-3">
                  <Meter value={item.value} tone="blue" />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
