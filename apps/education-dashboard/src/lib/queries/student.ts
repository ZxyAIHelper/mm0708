import { SubjectCode } from "@prisma/client";
import { notFound } from "next/navigation";
import { getDbAsync } from "@/lib/db";
import { buildKnowledgePointRows, buildTrendSeries } from "@/lib/domain/analytics";
import { getCurriculumKnowledgePointCount, getSubjectLabel } from "@/lib/domain/curriculum";
import { summarizeProgress } from "@/lib/domain/progress";
import { sortSuggestions } from "@/lib/domain/suggestions";

export async function getStudentDashboard(
  studentId: string,
  subject: SubjectCode = SubjectCode.PHYSICS
) {
  const db = await getDbAsync();
  const student = await db.student.findUnique({
    where: { id: studentId },
    include: {
      schoolClass: true
    }
  });

  if (!student) {
    notFound();
  }

  const subjects = await db.subject.findMany({ orderBy: { sortOrder: "asc" } });
  const subjectRecord = subjects.find((item) => item.code === subject)!;

  const studentSnapshot = await db.studentAnalysisSnapshot.findFirst({
    where: {
      studentId,
      subjectId: subjectRecord.id
    },
    orderBy: { capturedAt: "desc" }
  });

  const classSnapshot = await db.classAnalysisSnapshot.findFirst({
    where: {
      classId: student.classId,
      subjectId: subjectRecord.id
    },
    orderBy: { capturedAt: "desc" }
  });

  const classKnowledgeSnapshots = await db.classKnowledgePointSnapshot.findMany({
    where: {
      classId: student.classId,
      subjectId: subjectRecord.id
    }
  });
  const latestClassKpAt = classKnowledgeSnapshots[0]?.capturedAt;
  const classKnowledgePointMap = new Map(
    classKnowledgeSnapshots
      .filter(
        (snapshot) =>
          latestClassKpAt &&
          snapshot.capturedAt.getTime() === latestClassKpAt.getTime()
      )
      .map((snapshot) => [snapshot.knowledgePointId, snapshot.masteryRate])
  );

  const assessmentResults = await db.studentAssessmentResult.findMany({
    where: {
      studentId,
      assessment: { subjectId: subjectRecord.id }
    },
    include: {
      assessment: true,
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
    orderBy: { assessment: { happenedAt: "asc" } }
  });

  const homeworkResults = await db.studentHomeworkResult.findMany({
    where: {
      studentId,
      homeworkSet: { subjectId: subjectRecord.id }
    },
    include: {
      homeworkSet: true,
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
    orderBy: { homeworkSet: { assignedAt: "asc" } }
  });

  const knowledgePointRows = buildKnowledgePointRows(
    [
      ...assessmentResults.flatMap((result) =>
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
      ),
      ...homeworkResults.flatMap((result) =>
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
    ],
    { classMasteryByKnowledgePoint: classKnowledgePointMap }
  );

  const progressRecords = await db.teachingProgressRecord.findMany({
    where: {
      classId: student.classId,
      knowledgePoint: { subjectId: subjectRecord.id }
    }
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

  const suggestions = await db.studentSuggestionSnapshot.findMany({
    where: {
      studentId,
      subjectId: subjectRecord.id
    },
    orderBy: [{ capturedAt: "desc" }, { priority: "asc" }]
  });
  const latestSuggestionAt = suggestions[0]?.capturedAt;

  return {
    student: {
      id: student.id,
      name: student.name,
      className: student.schoolClass.name
    },
    subjectOptions: subjects.map((item) => ({
      code: item.code,
      label: item.name
    })),
    selectedSubject: {
      code: subject,
      label: getSubjectLabel(subject)
    },
    summary: {
      averageScore: studentSnapshot?.averageScore ?? 0,
      masteryRate: studentSnapshot?.masteryRate ?? 0,
      trendDelta: studentSnapshot?.trendDelta ?? 0,
      persistentWeakPointCount: studentSnapshot?.persistentWeakPointCount ?? 0,
      overdueHomeworkCount: studentSnapshot?.overdueHomeworkCount ?? 0,
      classAverageScore: classSnapshot?.averageScore ?? 0,
      classMasteryRate: classSnapshot?.masteryRate ?? 0
    },
    knowledgePointRows,
    progressSummary,
    trendSeries: buildTrendSeries(
      assessmentResults.map((result) => ({
        label: result.assessment.name,
        normalizedScore: result.normalizedScore
      }))
    ),
    suggestions: sortSuggestions(
      suggestions
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
