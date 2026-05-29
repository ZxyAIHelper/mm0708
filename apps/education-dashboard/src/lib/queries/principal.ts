import { SubjectCode } from "@prisma/client";
import { getDbAsync } from "@/lib/db";
import { getCurriculumKnowledgePointCount, getSubjectLabel } from "@/lib/domain/curriculum";
import { sortSuggestions } from "@/lib/domain/suggestions";
import { average, median } from "@/lib/domain/scoring";

export async function getPrincipalDashboard(subject: SubjectCode = SubjectCode.PHYSICS) {
  const db = await getDbAsync();
  const subjects = await db.subject.findMany({ orderBy: { sortOrder: "asc" } });
  const subjectRecord = subjects.find((item) => item.code === subject)!;

  const classSnapshots = await db.classAnalysisSnapshot.findMany({
    where: {
      subjectId: subjectRecord.id
    },
    include: {
      schoolClass: true
    },
    orderBy: [{ capturedAt: "desc" }, { averageScore: "asc" }]
  });
  const latestCapturedAt = classSnapshots[0]?.capturedAt;
  const latestClassSnapshots = classSnapshots.filter(
    (snapshot) =>
      latestCapturedAt && snapshot.capturedAt.getTime() === latestCapturedAt.getTime()
  );

  const schoolKnowledgeSnapshots = await db.schoolKnowledgePointSnapshot.findMany({
    where: { subjectId: subjectRecord.id },
    include: {
      knowledgePoint: {
        include: { chapter: true }
      }
    },
    orderBy: [{ capturedAt: "desc" }, { masteryRate: "asc" }]
  });
  const latestSchoolSnapshotAt = schoolKnowledgeSnapshots[0]?.capturedAt;
  const latestSchoolKnowledgeSnapshots = schoolKnowledgeSnapshots.filter(
    (snapshot) =>
      latestSchoolSnapshotAt &&
      snapshot.capturedAt.getTime() === latestSchoolSnapshotAt.getTime()
  );

  const schoolSuggestions = await db.schoolSuggestionSnapshot.findMany({
    where: { subjectId: subjectRecord.id },
    orderBy: [{ capturedAt: "desc" }, { priority: "asc" }]
  });
  const latestSuggestionAt = schoolSuggestions[0]?.capturedAt;

  const assessmentResults = await db.studentAssessmentResult.findMany({
    where: {
      assessment: { subjectId: subjectRecord.id }
    },
    select: {
      totalScore: true,
      normalizedScore: true
    }
  });

  const scores = assessmentResults.map((item) => item.totalScore);
  const normalizedScores = assessmentResults.map((item) => item.normalizedScore);

  return {
    subjectOptions: subjects.map((item) => ({
      code: item.code,
      label: item.name
    })),
    selectedSubject: {
      code: subject,
      label: getSubjectLabel(subject)
    },
    summary: {
      averageScore: average(scores),
      medianScore: median(scores),
      averageNormalizedScore: average(normalizedScores),
      classCount: latestClassSnapshots.length,
      weakKnowledgePointCount: latestSchoolKnowledgeSnapshots.filter(
        (snapshot) => snapshot.masteryRate < 0.68
      ).length,
      curriculumKnowledgePointCount: getCurriculumKnowledgePointCount(subject)
    },
    classDistribution: latestClassSnapshots
      .map((snapshot) => ({
        classId: snapshot.classId,
        className: snapshot.schoolClass.name,
        averageScore: snapshot.averageScore,
        masteryRate: snapshot.masteryRate,
        progressRate: snapshot.progressRate,
        riskLevel: snapshot.riskLevel,
        weakestKnowledgePointName: snapshot.weakestKnowledgePointName ?? "暂无"
      }))
      .sort((left, right) => left.averageScore - right.averageScore),
    weakKnowledgePoints: latestSchoolKnowledgeSnapshots.slice(0, 10).map((snapshot) => ({
      id: snapshot.id,
      chapterName: snapshot.knowledgePoint.chapter.name,
      knowledgePointName: snapshot.knowledgePoint.name,
      masteryRate: snapshot.masteryRate,
      trendDelta: snapshot.trendDelta,
      riskLevel: snapshot.riskLevel
    })),
    suggestions: sortSuggestions(
      schoolSuggestions
        .filter(
          (snapshot) =>
            latestSuggestionAt &&
            snapshot.capturedAt.getTime() === latestSuggestionAt.getTime()
        )
        .map((snapshot) => ({
          id: snapshot.id,
          priority: snapshot.priority,
          title: snapshot.title,
          summary: snapshot.summary,
          rationale: snapshot.rationale
        }))
    )
  };
}
