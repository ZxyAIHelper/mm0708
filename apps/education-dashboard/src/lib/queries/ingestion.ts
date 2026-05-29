import { getDbAsync } from "@/lib/db";

export async function getIngestionOverview() {
  const db = await getDbAsync();
  const [
    schoolCount,
    classCount,
    studentCount,
    assessmentCount,
    homeworkCount,
    progressCount
  ] = await Promise.all([
    db.school.count(),
    db.schoolClass.count(),
    db.student.count(),
    db.assessment.count(),
    db.homeworkSet.count(),
    db.teachingProgressRecord.count()
  ]);

  const recentAssessments = await db.assessment.findMany({
    include: {
      subject: true
    },
    orderBy: { happenedAt: "desc" },
    take: 8
  });

  const recentHomework = await db.homeworkSet.findMany({
    include: {
      schoolClass: true,
      subject: true
    },
    orderBy: { assignedAt: "desc" },
    take: 8
  });

  return {
    summary: {
      schoolCount,
      classCount,
      studentCount,
      assessmentCount,
      homeworkCount,
      progressCount
    },
    templates: [
      {
        label: "考试导入模板",
        href: "/templates/exam-import-template.csv"
      },
      {
        label: "作业导入模板",
        href: "/templates/homework-import-template.csv"
      }
    ],
    recentAssessments: recentAssessments.map((item) => ({
      id: item.id,
      name: item.name,
      subject: item.subject.name,
      weekIndex: item.weekIndex,
      happenedAt: item.happenedAt.toISOString().slice(0, 10)
    })),
    recentHomework: recentHomework.map((item) => ({
      id: item.id,
      name: item.name,
      subject: item.subject.name,
      className: item.schoolClass.name,
      weekIndex: item.weekIndex,
      assignedAt: item.assignedAt.toISOString().slice(0, 10)
    }))
  };
}
