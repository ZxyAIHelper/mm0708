import { RiskLevel, SubjectCode } from "@prisma/client";
import { getDbAsync } from "@/lib/db";
import {
  buildKnowledgePointRows,
  buildTrendSeries,
  type KnowledgePointRow
} from "@/lib/domain/analytics";
import {
  getCurriculumKnowledgePointCount,
  getSubjectLabel
} from "@/lib/domain/curriculum";
import { summarizeProgress } from "@/lib/domain/progress";
import { sortSuggestions } from "@/lib/domain/suggestions";
import { average, riskLevelWeight } from "@/lib/domain/scoring";

export type TeacherDashboardParams = {
  classId?: string;
  subject?: SubjectCode;
  window?: "aggregate" | "latest";
};

export async function getTeacherDashboard(params: TeacherDashboardParams = {}) {
  const db = await getDbAsync();
  const subjects = await db.subject.findMany({
    orderBy: { sortOrder: "asc" }
  });
  const classes = await db.schoolClass.findMany({
    orderBy: { sortOrder: "asc" }
  });

  const subject = params.subject ?? SubjectCode.PHYSICS;

  const defaultClassSnapshots = await db.classAnalysisSnapshot.findMany({
    where: { subject: { code: subject } },
    orderBy: [{ capturedAt: "desc" }]
  });
  const latestDefaultSnapshotAt = defaultClassSnapshots[0]?.capturedAt;
  const defaultClassSnapshot = defaultClassSnapshots
    .filter(
      (snapshot) =>
        latestDefaultSnapshotAt &&
        snapshot.capturedAt.getTime() === latestDefaultSnapshotAt.getTime()
    )
    .sort((left, right) => {
      const riskDifference =
        riskLevelWeight(right.riskLevel) - riskLevelWeight(left.riskLevel);

      if (riskDifference !== 0) {
        return riskDifference;
      }

      return left.averageScore - right.averageScore;
    })[0];

  const selectedClassId = params.classId ?? defaultClassSnapshot?.classId ?? classes[0]?.id;
  const selectedClass = classes.find((item) => item.id === selectedClassId) ?? classes[0];

  const window = params.window ?? "aggregate";

  const classSnapshot = await db.classAnalysisSnapshot.findFirst({
    where: {
      classId: selectedClass.id,
      subject: { code: subject }
    },
    orderBy: { capturedAt: "desc" }
  });

  const subjectRecord = subjects.find((item) => item.code === subject)!;

  const knowledgePointSnapshots = await db.classKnowledgePointSnapshot.findMany({
    where: {
      classId: selectedClass.id,
      subjectId: subjectRecord.id
    },
    include: {
      knowledgePoint: {
        include: {
          chapter: true
        }
      }
    },
    orderBy: [{ capturedAt: "desc" }, { masteryRate: "asc" }]
  });

  const latestCapturedAt = knowledgePointSnapshots[0]?.capturedAt;
  const latestKnowledgePointSnapshots = knowledgePointSnapshots.filter(
    (snapshot) =>
      latestCapturedAt && snapshot.capturedAt.getTime() === latestCapturedAt.getTime()
  );

  const studentSnapshots = await db.studentAnalysisSnapshot.findMany({
    where: {
      classId: selectedClass.id,
      subjectId: subjectRecord.id
    },
    include: {
      student: true
    },
    orderBy: [{ capturedAt: "desc" }, { averageScore: "asc" }]
  });
  const latestStudentCapturedAt = studentSnapshots[0]?.capturedAt;
  const latestStudentSnapshots = studentSnapshots
    .filter(
      (snapshot) =>
        latestStudentCapturedAt &&
        snapshot.capturedAt.getTime() === latestStudentCapturedAt.getTime()
    )
    .slice(0, 12);

  const suggestionSnapshots = await db.classSuggestionSnapshot.findMany({
    where: {
      classId: selectedClass.id,
      subjectId: subjectRecord.id
    },
    orderBy: [{ capturedAt: "desc" }, { priority: "asc" }]
  });
  const latestSuggestionAt = suggestionSnapshots[0]?.capturedAt;
  const suggestions = sortSuggestions(
    suggestionSnapshots
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
  );

  const progressRecords = await db.teachingProgressRecord.findMany({
    where: {
      classId: selectedClass.id,
      knowledgePoint: {
        subjectId: subjectRecord.id
      }
    },
    include: {
      knowledgePoint: {
        include: {
          chapter: true
        }
      }
    },
    orderBy: [{ weekIndex: "asc" }, { taughtAt: "asc" }]
  });

  const progressSummary = summarizeProgress(
    progressRecords.map((record) => ({
      knowledgePointId: record.knowledgePointId,
      status: record.status,
      observedMasteryRate: record.observedMasteryRate,
      gapRate: record.gapRate
    })),
    getCurriculumKnowledgePointCount(subject)
  );

  const assessmentResults = await db.studentAssessmentResult.findMany({
    where: {
      student: { classId: selectedClass.id },
      assessment: { subjectId: subjectRecord.id }
    },
    include: {
      assessment: true,
      student: true,
      questionScores: {
        include: {
          question: {
            include: {
              knowledgePointMaps: {
                include: {
                  knowledgePoint: {
                    include: { chapter: true }
                  }
                }
              }
            }
          }
        }
      }
    },
    orderBy: [{ assessment: { happenedAt: "asc" } }, { totalScore: "asc" }]
  });

  const groupedAssessmentScores = new Map<
    string,
    { label: string; averageScore: number; assessmentId: string; count: number }
  >();

  for (const result of assessmentResults) {
    const key = result.assessmentId;
    const existing = groupedAssessmentScores.get(key);
    if (!existing) {
      groupedAssessmentScores.set(key, {
        label: result.assessment.name,
        averageScore: result.normalizedScore,
        assessmentId: result.assessmentId,
        count: 1
      });
      continue;
    }

    existing.averageScore =
      (existing.averageScore * existing.count + result.normalizedScore) /
      (existing.count + 1);
    existing.count += 1;
  }

  const trendSeries = buildTrendSeries([...groupedAssessmentScores.values()]);

  let weakKnowledgePoints: KnowledgePointRow[] = latestKnowledgePointSnapshots.map((snapshot) => ({
    knowledgePointId: snapshot.knowledgePointId,
    code: snapshot.knowledgePoint.code,
    name: snapshot.knowledgePoint.name,
    chapterName: snapshot.knowledgePoint.chapter.name,
    difficulty: snapshot.knowledgePoint.difficulty,
    masteryRate: snapshot.masteryRate,
    averageScoreRate: snapshot.averageScoreRate,
    questionCount: snapshot.questionCount,
    riskLevel: snapshot.riskLevel,
    trendDelta: snapshot.trendDelta
  }));

  let riskStudents: {
    id: string;
    name: string;
    averageScore: number;
    masteryRate: number;
    persistentWeakPointCount: number;
    overdueHomeworkCount: number;
    riskLevel: RiskLevel;
  }[] = latestStudentSnapshots.map((snapshot) => ({
    id: snapshot.student.id,
    name: snapshot.student.name,
    averageScore: snapshot.averageScore / 100,
    masteryRate: snapshot.masteryRate,
    persistentWeakPointCount: snapshot.persistentWeakPointCount,
    overdueHomeworkCount: snapshot.overdueHomeworkCount,
    riskLevel: snapshot.riskLevel
  }));

  let currentWindowLabel = "阶段汇总";

  if (window === "latest") {
    const latestAssessment = assessmentResults[assessmentResults.length - 1]?.assessment;

    if (latestAssessment) {
      currentWindowLabel = `最近考试：${latestAssessment.name}`;

      const latestResults = assessmentResults.filter(
        (item) => item.assessmentId === latestAssessment.id
      );

      weakKnowledgePoints = buildKnowledgePointRows(
        latestResults.flatMap((result) =>
          result.questionScores.flatMap((questionScore) =>
            questionScore.question.knowledgePointMaps.map((map) => ({
              knowledgePointId: map.knowledgePoint.id,
              knowledgePointCode: map.knowledgePoint.code,
              knowledgePointName: map.knowledgePoint.name,
              chapterName: map.knowledgePoint.chapter.name,
              difficulty: map.knowledgePoint.difficulty,
              scoreRate: questionScore.scoreRate
            }))
          )
        )
      );

      riskStudents = latestResults
        .map((result) => ({
          id: result.student.id,
          name: result.student.name,
          averageScore: result.normalizedScore,
          masteryRate: average(result.questionScores.map((item) => item.scoreRate)),
          persistentWeakPointCount: 0,
          overdueHomeworkCount: 0,
          riskLevel:
            result.normalizedScore < 0.55
              ? RiskLevel.CRITICAL
              : result.normalizedScore < 0.68
                ? RiskLevel.HIGH
                : result.normalizedScore < 0.8
                  ? RiskLevel.MEDIUM
                  : RiskLevel.LOW
        }))
        .sort((left, right) => left.averageScore - right.averageScore)
        .slice(0, 12);
    }
  }

  const teacherAssignment = await db.classTeacherAssignment.findFirst({
    where: {
      classId: selectedClass.id,
      assignmentKey: `SUBJECT_${subject}`
    },
    include: {
      teacher: true
    }
  });

  return {
    subjectOptions: subjects.map((item) => ({
      code: item.code,
      label: item.name
    })),
    classOptions: classes.map((item) => ({
      id: item.id,
      label: item.name
    })),
    selectedClass: {
      id: selectedClass.id,
      label: selectedClass.name
    },
    selectedSubject: {
      code: subject,
      label: getSubjectLabel(subject)
    },
    selectedTeacher: teacherAssignment?.teacher.name ?? "未分配",
    currentWindowLabel,
    summary: {
      averageScore: classSnapshot?.averageScore ?? 0,
      passRate: classSnapshot?.passRate ?? 0,
      excellenceRate: classSnapshot?.excellenceRate ?? 0,
      masteryRate: classSnapshot?.masteryRate ?? 0,
      progressRate: classSnapshot?.progressRate ?? 0,
      taughtCount: classSnapshot?.taughtCount ?? 0,
      weakestKnowledgePointName: classSnapshot?.weakestKnowledgePointName ?? "暂无"
    },
    weakKnowledgePoints: weakKnowledgePoints.slice(0, 8),
    riskStudents,
    suggestions,
    trendSeries,
    progressSummary,
    progressRecords: progressRecords.slice(-8).map((record) => ({
      id: record.id,
      weekIndex: record.weekIndex,
      knowledgePointName: record.knowledgePoint.name,
      chapterName: record.knowledgePoint.chapter.name,
      observedMasteryRate: record.observedMasteryRate,
      gapRate: record.gapRate
    }))
  };
}
