import { AppShell } from "@/components/layout/app-shell";
import { SectionCard, StatCard } from "@/components/ui";
import { getIngestionOverview } from "@/lib/queries/ingestion";

export const dynamic = "force-dynamic";

export default async function IngestionPage() {
  const data = await getIngestionOverview();

  return (
    <AppShell
      currentPath="/ingestion"
      title="数据录入台"
      subtitle="面向学校历史考试、作业、练习与基础档案数据的导入入口。当前 demo 先提供样例模板与已载入数据概况。"
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StatCard label="学校" value={String(data.summary.schoolCount)} />
          <StatCard label="班级" value={String(data.summary.classCount)} />
          <StatCard label="学生" value={String(data.summary.studentCount)} />
          <StatCard label="考试记录" value={String(data.summary.assessmentCount)} />
          <StatCard label="作业记录" value={String(data.summary.homeworkCount)} />
          <StatCard label="教学进度记录" value={String(data.summary.progressCount)} />
        </div>

        <SectionCard title="导入模板" description="后续真实导入时，按模板填充即可。">
          <div className="grid gap-4 md:grid-cols-2">
            {data.templates.map((template) => (
              <a
                key={template.href}
                href={template.href}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:border-blue-300 hover:bg-blue-50"
              >
                <p className="font-semibold text-slate-900">{template.label}</p>
                <p className="mt-2 text-sm text-slate-500">{template.href}</p>
              </a>
            ))}
          </div>
        </SectionCard>

        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard title="最近考试数据" description="当前 demo 已载入的考试样本。">
            <div className="space-y-3">
              {data.recentAssessments.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-slate-900">{item.name}</p>
                    <span className="text-xs text-slate-500">{item.happenedAt}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {item.subject} · 第 {item.weekIndex} 周
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="最近作业 / 练习数据" description="用于补充考试之外的学习行为与掌握情况。">
            <div className="space-y-3">
              {data.recentHomework.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-slate-900">{item.name}</p>
                    <span className="text-xs text-slate-500">{item.assignedAt}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {item.className} · {item.subject} · 第 {item.weekIndex} 周
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
