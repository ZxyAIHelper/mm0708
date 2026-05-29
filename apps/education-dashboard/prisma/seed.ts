import {
  AssessmentKind,
  AssessmentQuestionType,
  HomeworkKind,
  PrismaClient,
  ProgressStatus,
  RiskLevel,
  SubjectCode,
  TeacherRole
} from "@prisma/client";
import {
  DEMO_CONFIG,
  DEMO_CURRICULUM,
  type DemoSubjectCode
} from "../src/lib/demo-config";
import {
  SeededRandom,
  clamp,
  createDeterministicIdFactory,
  range,
  roundTo
} from "../src/lib/seed-random";

const prisma = new PrismaClient();
const randomUUID = createDeterministicIdFactory(
  "education-dashboard-demo-task-2:ids"
);
const semesterStart = new Date(`${DEMO_CONFIG.semesterStartDate}T08:00:00.000Z`);

const STUDENT_SURNAMES = [
  "李",
  "王",
  "张",
  "刘",
  "陈",
  "杨",
  "赵",
  "黄",
  "吴",
  "周",
  "徐",
  "孙",
  "马",
  "朱",
  "胡",
  "郭",
  "何",
  "高",
  "林",
  "罗"
] as const;

const STUDENT_GIVEN_NAMES = [
  "宇桐",
  "子轩",
  "嘉怡",
  "雨涵",
  "铭睿",
  "一诺",
  "浩然",
  "诗雨",
  "梓涵",
  "欣彤",
  "奕辰",
  "俊熙",
  "可欣",
  "雨洁",
  "芊伊",
  "天宇",
  "悦宁",
  "晨宇",
  "睿涵",
  "子墨"
] as const;

const TEACHER_NAMES = [
  "林倩",
  "赵明",
  "孙睿",
  "陈嘉",
  "王鹤",
  "徐楠",
  "刘瑶",
  "郭静",
  "杨帆",
  "何欣",
  "秦宇",
  "邓伟",
  "韩青",
  "方磊",
  "江乔",
  "彭源",
  "陶欣",
  "郑然",
  "谢彤",
  "曹玥"
] as const;

const ASSESSMENT_SCORE_DISTRIBUTIONS: Record<number, number[]> = {
  8: [10, 10, 10, 12, 12, 14, 14, 18],
  9: [8, 8, 10, 10, 10, 12, 12, 14, 16],
  10: [6, 8, 8, 10, 10, 10, 12, 12, 12, 12]
};

const HOMEWORK_SCORE_DISTRIBUTION = [8, 10, 10, 10, 12];

type SubjectRecord = {
  id: string;
  schoolId: string;
  code: SubjectCode;
  name: string;
  sortOrder: number;
};

type ChapterRecord = {
  id: string;
  subjectId: string;
  subjectCode: SubjectCode;
  code: string;
  name: string;
  sequence: number;
};

type KnowledgePointRecord = {
  id: string;
  subjectId: string;
  subjectCode: SubjectCode;
  chapterId: string;
  chapterCode: string;
  code: string;
  name: string;
  sequence: number;
  chapterSequence: number;
  difficulty: number;
};

type ClassProfile = (typeof DEMO_CONFIG.classProfiles)[number];

type StudentProfile = {
  id: string;
  classId: string;
  classCode: string;
  classIndex: number;
  name: string;
  studentNo: string;
  sortNumber: number;
  baseBias: number;
  subjectBias: Record<SubjectCode, number>;
  homeworkBias: number;
  trendBoost: number;
  persistentWeakPointCodes: string[];
};

type QuestionBlueprint = {
  id: string;
  code: string;
  prompt: string;
  sequence: number;
  fullScore: number;
  difficulty: number;
  knowledgePointCodes: string[];
};

type AssessmentBlueprint = {
  id: string;
  subjectCode: SubjectCode;
  subjectId: string;
  seriesKey: string;
  name: string;
  kind: AssessmentKind;
  weekIndex: number;
  happenedAt: Date;
  fullScore: number;
  windowOrder: number;
  questions: QuestionBlueprint[];
};

type HomeworkBlueprint = {
  id: string;
  classId: string;
  classCode: string;
  subjectCode: SubjectCode;
  subjectId: string;
  teacherId: string;
  name: string;
  kind: HomeworkKind;
  weekIndex: number;
  assignedAt: Date;
  dueAt: Date;
  fullScore: number;
  questions: QuestionBlueprint[];
};

type MasteryAggregate = {
  scoreSum: number;
  fullScoreSum: number;
  questionCount: number;
  assessmentIds: Set<string>;
};

type StudentSubjectSummary = {
  totalNormalized: number;
  count: number;
  firstWindowScore: number;
  lastWindowScore: number;
  firstWindowOrder: number;
  lastWindowOrder: number;
};

type HomeworkSummary = {
  overdueCount: number;
};

type ProgressPayload = {
  classId: string;
  classCode: string;
  subjectId: string;
  subjectCode: SubjectCode;
  chapterId: string;
  chapterCode: string;
  knowledgePointId: string;
  knowledgePointCode: string;
  knowledgePointName: string;
  chapterName: string;
  difficulty: number;
  sequence: number;
  chapterSequence: number;
};

async function main() {
  await resetDatabase();

  const schoolId = randomUUID();
  const gradeId = randomUUID();

  await prisma.school.create({
    data: {
      id: schoolId,
      code: DEMO_CONFIG.schoolCode,
      name: DEMO_CONFIG.schoolName
    }
  });

  await prisma.gradeLevel.create({
    data: {
      id: gradeId,
      schoolId,
      code: DEMO_CONFIG.gradeCode,
      name: DEMO_CONFIG.gradeName,
      sortOrder: 9
    }
  });

  const classProfiles = new Map<number, ClassProfile>(
    DEMO_CONFIG.classProfiles.map((profile) => [profile.classIndex, profile])
  );

  const classRecords = range(DEMO_CONFIG.classCount).map((classIndex) => ({
    id: randomUUID(),
    gradeId,
    code: `G9-C${String(classIndex).padStart(2, "0")}`,
    name: `初三（${classIndex}）班`,
    sortOrder: classIndex
  }));

  await prisma.schoolClass.createMany({ data: classRecords });

  const subjectRecords: SubjectRecord[] = DEMO_CONFIG.subjects.map(
    (subject, index) => ({
      id: randomUUID(),
      code: subject.code as SubjectCode,
      name: subject.name,
      schoolId,
      sortOrder: index + 1
    })
  );

  await prisma.subject.createMany({ data: subjectRecords });

  const subjectByCode = new Map(
    subjectRecords.map((subject) => [subject.code, subject])
  );

  const chapterRecords: ChapterRecord[] = [];
  const knowledgePointRecords: KnowledgePointRecord[] = [];

  (
    Object.entries(DEMO_CURRICULUM) as [
      DemoSubjectCode,
      (typeof DEMO_CURRICULUM)[DemoSubjectCode]
    ][]
  ).forEach(([subjectCode, chapters]) => {
    const subject = subjectByCode.get(subjectCode as SubjectCode);
    if (!subject) {
      throw new Error(`Missing subject for ${subjectCode}`);
    }

    let globalSequence = 1;
    chapters.forEach((chapter) => {
      const chapterId = randomUUID();
      chapterRecords.push({
        id: chapterId,
        subjectId: subject.id,
        subjectCode: subject.code,
        code: chapter.code,
        name: chapter.name,
        sequence: chapter.sequence
      });

      chapter.knowledgePoints.forEach((knowledgePoint) => {
        knowledgePointRecords.push({
          id: randomUUID(),
          subjectId: subject.id,
          subjectCode: subject.code,
          chapterId,
          chapterCode: chapter.code,
          code: knowledgePoint.code,
          name: knowledgePoint.name,
          sequence: globalSequence,
          chapterSequence: chapter.sequence,
          difficulty: knowledgePoint.difficulty
        });
        globalSequence += 1;
      });
    });
  });

  await prisma.curriculumChapter.createMany({
    data: chapterRecords.map((chapter) => ({
      id: chapter.id,
      subjectId: chapter.subjectId,
      code: chapter.code,
      name: chapter.name,
      sequence: chapter.sequence
    }))
  });

  await prisma.knowledgePoint.createMany({
    data: knowledgePointRecords.map((knowledgePoint) => ({
      id: knowledgePoint.id,
      subjectId: knowledgePoint.subjectId,
      chapterId: knowledgePoint.chapterId,
      code: knowledgePoint.code,
      name: knowledgePoint.name,
      sequence: knowledgePoint.sequence,
      difficulty: knowledgePoint.difficulty
    }))
  });

  const knowledgePointsByCode = new Map(
    knowledgePointRecords.map((knowledgePoint) => [knowledgePoint.code, knowledgePoint])
  );
  const knowledgePointsBySubject = new Map<SubjectCode, KnowledgePointRecord[]>();

  for (const subject of subjectRecords) {
    knowledgePointsBySubject.set(
      subject.code,
      knowledgePointRecords.filter(
        (knowledgePoint) => knowledgePoint.subjectCode === subject.code
      )
    );
  }

  const teacherPayloads = buildTeachers(schoolId);
  await prisma.teacher.createMany({
    data: teacherPayloads.map((teacher) => ({
      id: teacher.id,
      schoolId: teacher.schoolId,
      teacherNo: teacher.teacherNo,
      name: teacher.name,
      primarySubject: teacher.primarySubject
    }))
  });

  const teacherByRole = {
    homeroom: teacherPayloads.filter((teacher) => teacher.primarySubject === null),
    math: teacherPayloads.filter(
      (teacher) => teacher.primarySubject === SubjectCode.MATHEMATICS
    ),
    physics: teacherPayloads.filter(
      (teacher) => teacher.primarySubject === SubjectCode.PHYSICS
    )
  };

  const classTeacherAssignments = classRecords.flatMap((schoolClass, index) => [
    {
      id: randomUUID(),
      classId: schoolClass.id,
      teacherId: teacherByRole.homeroom[index].id,
      role: TeacherRole.HOMEROOM,
      assignmentKey: "HOMEROOM",
      subjectCode: null
    },
    {
      id: randomUUID(),
      classId: schoolClass.id,
      teacherId: teacherByRole.math[index % teacherByRole.math.length].id,
      role: TeacherRole.SUBJECT,
      assignmentKey: "SUBJECT_MATHEMATICS",
      subjectCode: SubjectCode.MATHEMATICS
    },
    {
      id: randomUUID(),
      classId: schoolClass.id,
      teacherId: teacherByRole.physics[index % teacherByRole.physics.length].id,
      role: TeacherRole.SUBJECT,
      assignmentKey: "SUBJECT_PHYSICS",
      subjectCode: SubjectCode.PHYSICS
    }
  ]);

  await prisma.classTeacherAssignment.createMany({
    data: classTeacherAssignments
  });

  const classMathTeacher = new Map<string, string>(
    classTeacherAssignments
      .filter((assignment) => assignment.subjectCode === SubjectCode.MATHEMATICS)
      .map((assignment) => [assignment.classId, assignment.teacherId])
  );
  const classPhysicsTeacher = new Map<string, string>(
    classTeacherAssignments
      .filter((assignment) => assignment.subjectCode === SubjectCode.PHYSICS)
      .map((assignment) => [assignment.classId, assignment.teacherId])
  );

  const students = classRecords.flatMap((schoolClass, classOffset) =>
    buildStudents(schoolClass, classOffset + 1)
  );

  await createManyInChunks(students, 250, (chunk) =>
    prisma.student.createMany({
      data: chunk.map((student) => ({
        id: student.id,
        classId: student.classId,
        studentNo: student.studentNo,
        name: student.name,
        sortNumber: student.sortNumber
      }))
    })
  );

  const assessments = buildAssessments(subjectRecords, knowledgePointsBySubject);

  await prisma.assessment.createMany({
    data: assessments.map((assessment) => ({
      id: assessment.id,
      schoolId,
      gradeId,
      subjectId: assessment.subjectId,
      seriesKey: assessment.seriesKey,
      name: assessment.name,
      kind: assessment.kind,
      semesterLabel: DEMO_CONFIG.semesterLabel,
      weekIndex: assessment.weekIndex,
      happenedAt: assessment.happenedAt,
      fullScore: assessment.fullScore
    }))
  });

  const assessmentQuestions = assessments.flatMap((assessment) =>
    assessment.questions.map((question) => ({
      id: question.id,
      assessmentId: assessment.id,
      code: question.code,
      prompt: question.prompt,
      sequence: question.sequence,
      fullScore: question.fullScore,
      difficulty: question.difficulty,
      questionType:
        question.knowledgePointCodes.length > 1
          ? AssessmentQuestionType.COMPREHENSIVE
          : AssessmentQuestionType.SINGLE_KNOWLEDGE_POINT
    }))
  );

  await prisma.assessmentQuestion.createMany({ data: assessmentQuestions });

  const assessmentQuestionMaps = assessments.flatMap((assessment) =>
    assessment.questions.flatMap((question) => {
      const weight = roundTo(1 / question.knowledgePointCodes.length, 4);
      return question.knowledgePointCodes.map((knowledgePointCode) => {
        const knowledgePoint = knowledgePointsByCode.get(knowledgePointCode);
        if (!knowledgePoint) {
          throw new Error(`Unknown knowledge point ${knowledgePointCode}`);
        }

        return {
          id: randomUUID(),
          questionId: question.id,
          knowledgePointId: knowledgePoint.id,
          weight
        };
      });
    })
  );

  await prisma.assessmentQuestionKnowledgePointMap.createMany({
    data: assessmentQuestionMaps
  });

  const schoolWideWeakPointCodes = new Set(DEMO_CONFIG.schoolWideWeakPointCodes);
  const assessmentAggregates = {
    school: new Map<string, MasteryAggregate>(),
    class: new Map<string, MasteryAggregate>(),
    student: new Map<string, MasteryAggregate>()
  };
  const studentSubjectSummaries = new Map<string, StudentSubjectSummary>();
  const classAssessmentScoreBuckets = new Map<string, number[]>();

  const assessmentResults: {
    id: string;
    assessmentId: string;
    studentId: string;
    classId: string;
    totalScore: number;
    normalizedScore: number;
    rankInClass: number | null;
    percentile: number | null;
    absent: boolean;
  }[] = [];
  const assessmentQuestionScores: {
    id: string;
    resultId: string;
    questionId: string;
    assessmentId: string;
    score: number;
    fullScore: number;
    scoreRate: number;
  }[] = [];

  for (const assessment of assessments) {
    for (const student of students) {
      const resultId = randomUUID();
      const classProfile = classProfiles.get(student.classIndex);
      if (!classProfile) {
        throw new Error(`Missing class profile for class ${student.classIndex}`);
      }

      const questionScores = assessment.questions.map((question) => {
        const questionScore = scoreAssessmentQuestion({
          assessment,
          classProfile,
          student,
          question,
          schoolWideWeakPointCodes
        });

        question.knowledgePointCodes.forEach((knowledgePointCode) => {
          const knowledgePoint = knowledgePointsByCode.get(knowledgePointCode);
          if (!knowledgePoint) {
            throw new Error(`Missing knowledge point ${knowledgePointCode}`);
          }

          const weight = 1 / question.knowledgePointCodes.length;
          updateAggregate(
            assessmentAggregates.school,
            `${assessment.subjectCode}:${knowledgePoint.id}`,
            questionScore.score * weight,
            question.fullScore * weight,
            assessment.id
          );
          updateAggregate(
            assessmentAggregates.class,
            `${student.classId}:${assessment.subjectCode}:${knowledgePoint.id}`,
            questionScore.score * weight,
            question.fullScore * weight,
            assessment.id
          );
          updateAggregate(
            assessmentAggregates.student,
            `${student.id}:${assessment.subjectCode}:${knowledgePoint.id}`,
            questionScore.score * weight,
            question.fullScore * weight,
            assessment.id
          );
        });

        return {
          id: randomUUID(),
          resultId,
          questionId: question.id,
          assessmentId: assessment.id,
          score: questionScore.score,
          fullScore: question.fullScore,
          scoreRate: questionScore.scoreRate
        };
      });

      const totalScore = roundTo(
        questionScores.reduce((sum, score) => sum + score.score, 0)
      );
      const normalizedScore = roundTo(totalScore / assessment.fullScore, 4);

      assessmentResults.push({
        id: resultId,
        assessmentId: assessment.id,
        studentId: student.id,
        classId: student.classId,
        totalScore,
        normalizedScore,
        rankInClass: null,
        percentile: null,
        absent: false
      });

      assessmentQuestionScores.push(...questionScores);
      pushToBucket(
        classAssessmentScoreBuckets,
        `${student.classId}:${assessment.subjectCode}`,
        normalizedScore
      );
      updateStudentSubjectSummary(
        studentSubjectSummaries,
        `${student.id}:${assessment.subjectCode}`,
        normalizedScore,
        assessment.windowOrder
      );
    }
  }

  rankAssessmentResults(assessmentResults, students, assessments);

  await createManyInChunks(assessmentResults, 250, (chunk) =>
    prisma.studentAssessmentResult.createMany({
      data: chunk.map((result) => ({
        id: result.id,
        assessmentId: result.assessmentId,
        studentId: result.studentId,
        totalScore: result.totalScore,
        normalizedScore: result.normalizedScore,
        rankInClass: result.rankInClass,
        percentile: result.percentile,
        absent: result.absent
      }))
    })
  );

  await createManyInChunks(assessmentQuestionScores, 1000, (chunk) =>
    prisma.studentAssessmentQuestionScore.createMany({
      data: chunk
    })
  );

  const homeworkSets = buildHomeworkSets(
    classRecords,
    subjectRecords,
    knowledgePointsBySubject,
    classMathTeacher,
    classPhysicsTeacher
  );

  await createManyInChunks(homeworkSets, 100, (chunk) =>
    prisma.homeworkSet.createMany({
      data: chunk.map((homeworkSet) => ({
        id: homeworkSet.id,
        schoolId,
        classId: homeworkSet.classId,
        teacherId: homeworkSet.teacherId,
        subjectId: homeworkSet.subjectId,
        name: homeworkSet.name,
        kind: homeworkSet.kind,
        weekIndex: homeworkSet.weekIndex,
        assignedAt: homeworkSet.assignedAt,
        dueAt: homeworkSet.dueAt,
        fullScore: homeworkSet.fullScore
      }))
    })
  );

  const homeworkQuestions = homeworkSets.flatMap((homeworkSet) =>
    homeworkSet.questions.map((question) => ({
      id: question.id,
      homeworkSetId: homeworkSet.id,
      code: question.code,
      prompt: question.prompt,
      sequence: question.sequence,
      fullScore: question.fullScore,
      difficulty: question.difficulty
    }))
  );

  await prisma.homeworkQuestion.createMany({ data: homeworkQuestions });

  const homeworkQuestionMaps = homeworkSets.flatMap((homeworkSet) =>
    homeworkSet.questions.flatMap((question) => {
      const weight = roundTo(1 / question.knowledgePointCodes.length, 4);
      return question.knowledgePointCodes.map((knowledgePointCode) => {
        const knowledgePoint = knowledgePointsByCode.get(knowledgePointCode);
        if (!knowledgePoint) {
          throw new Error(`Unknown knowledge point ${knowledgePointCode}`);
        }

        return {
          id: randomUUID(),
          questionId: question.id,
          knowledgePointId: knowledgePoint.id,
          weight
        };
      });
    })
  );

  await prisma.homeworkQuestionKnowledgePointMap.createMany({
    data: homeworkQuestionMaps
  });

  const studentHomeworkSummaries = new Map<string, HomeworkSummary>();
  const homeworkResults: {
    id: string;
    homeworkSetId: string;
    studentId: string;
    classId: string;
    totalScore: number;
    completionRate: number;
    submittedAt: Date | null;
    isLate: boolean;
  }[] = [];
  const homeworkQuestionScores: {
    id: string;
    resultId: string;
    questionId: string;
    homeworkSetId: string;
    score: number;
    fullScore: number;
    scoreRate: number;
  }[] = [];

  const studentsByClassId = new Map<string, StudentProfile[]>();
  for (const student of students) {
    const classStudents = studentsByClassId.get(student.classId) ?? [];
    classStudents.push(student);
    studentsByClassId.set(student.classId, classStudents);
  }

  for (const homeworkSet of homeworkSets) {
    const classStudents = studentsByClassId.get(homeworkSet.classId) ?? [];
    const classProfile = classProfiles.get(
      Number(homeworkSet.classCode.slice(-2))
    );
    if (!classProfile) {
      throw new Error(`Missing class profile for ${homeworkSet.classCode}`);
    }

    for (const student of classStudents) {
      const resultId = randomUUID();
      const resultSeed = new SeededRandom(
        `homework:${homeworkSet.id}:${student.id}`
      );
      const completionRate = clamp(
        0.9 +
          classProfile.homeworkBias +
          student.homeworkBias +
          resultSeed.normal(0, 0.04),
        0.55,
        1
      );
      const isLate =
        completionRate < 0.78 ||
        resultSeed.bool(clamp(0.06 - classProfile.homeworkBias, 0.02, 0.16));
      const submittedAt =
        completionRate < 0.62 && resultSeed.bool(0.35)
          ? null
          : addHours(
              homeworkSet.dueAt,
              isLate ? resultSeed.int(4, 36) : -resultSeed.int(2, 16)
            );

      const questionScores = homeworkSet.questions.map((question) => {
        const scoreRate = scoreHomeworkQuestion({
          classProfile,
          completionRate,
          homeworkSet,
          question,
          student,
          schoolWideWeakPointCodes
        });
        const score = roundTo(question.fullScore * scoreRate);

        return {
          id: randomUUID(),
          resultId,
          questionId: question.id,
          homeworkSetId: homeworkSet.id,
          score,
          fullScore: question.fullScore,
          scoreRate: roundTo(score / question.fullScore, 4)
        };
      });

      homeworkQuestionScores.push(...questionScores);

      const totalScore = roundTo(
        questionScores.reduce((sum, score) => sum + score.score, 0)
      );
      homeworkResults.push({
        id: resultId,
        homeworkSetId: homeworkSet.id,
        studentId: student.id,
        classId: student.classId,
        totalScore,
        completionRate: roundTo(completionRate, 4),
        submittedAt,
        isLate
      });

      const homeworkSummaryKey = `${student.id}:${homeworkSet.subjectCode}`;
      const summary = studentHomeworkSummaries.get(homeworkSummaryKey) ?? {
        overdueCount: 0
      };
      if (isLate || submittedAt === null) {
        summary.overdueCount += 1;
      }
      studentHomeworkSummaries.set(homeworkSummaryKey, summary);
    }
  }

  await createManyInChunks(homeworkResults, 250, (chunk) =>
    prisma.studentHomeworkResult.createMany({
      data: chunk.map((result) => ({
        id: result.id,
        homeworkSetId: result.homeworkSetId,
        studentId: result.studentId,
        totalScore: result.totalScore,
        completionRate: result.completionRate,
        submittedAt: result.submittedAt,
        isLate: result.isLate
      }))
    })
  );

  await createManyInChunks(homeworkQuestionScores, 1000, (chunk) =>
    prisma.studentHomeworkQuestionScore.createMany({ data: chunk })
  );

  const teachingProgressPayloads = knowledgePointRecords.flatMap(
    (knowledgePoint): ProgressPayload[] =>
      classRecords.map((schoolClass) => ({
        classId: schoolClass.id,
        classCode: schoolClass.code,
        subjectId: knowledgePoint.subjectId,
        subjectCode: knowledgePoint.subjectCode,
        chapterId: knowledgePoint.chapterId,
        chapterCode: knowledgePoint.chapterCode,
        knowledgePointId: knowledgePoint.id,
        knowledgePointCode: knowledgePoint.code,
        knowledgePointName: knowledgePoint.name,
        chapterName:
          chapterRecords.find((chapter) => chapter.id === knowledgePoint.chapterId)
            ?.name ?? "未命名章节",
        difficulty: knowledgePoint.difficulty,
        sequence: knowledgePoint.sequence,
        chapterSequence: knowledgePoint.chapterSequence
      }))
  );

  const teachingProgressRecords = teachingProgressPayloads.map((payload) => {
    const classIndex = Number(payload.classCode.slice(-2));
    const classProfile = classProfiles.get(classIndex);
    if (!classProfile) {
      throw new Error(`Missing class profile for ${payload.classCode}`);
    }

    const weekIndex = Math.min(
      DEMO_CONFIG.semesterWeeks,
      payload.sequence + classProfile.progressOffsetWeeks + 1
    );
    const masteryAggregate = assessmentAggregates.class.get(
      `${payload.classId}:${payload.subjectCode}:${payload.knowledgePointId}`
    );
    const observedMasteryRate = masteryAggregate
      ? roundTo(masteryAggregate.scoreSum / masteryAggregate.fullScoreSum, 4)
      : 0;
    const expectedMasteryRate = roundTo(
      clamp(
        0.82 -
          payload.difficulty * 0.04 -
          classProfile.progressOffsetWeeks * 0.03,
        0.48,
        0.86
      ),
      4
    );
    const gapRate = roundTo(observedMasteryRate - expectedMasteryRate, 4);
    const status =
      weekIndex <= DEMO_CONFIG.semesterWeeks - 2
        ? ProgressStatus.COMPLETED
        : weekIndex === DEMO_CONFIG.semesterWeeks - 1
          ? ProgressStatus.IN_PROGRESS
          : ProgressStatus.NOT_STARTED;

    return {
      id: randomUUID(),
      classId: payload.classId,
      subjectId: payload.subjectId,
      chapterId: payload.chapterId,
      knowledgePointId: payload.knowledgePointId,
      teacherId: requireMapValue(
        payload.subjectCode === SubjectCode.MATHEMATICS
          ? classMathTeacher
          : classPhysicsTeacher,
        payload.classId,
        `teacher for ${payload.classCode} ${payload.subjectCode}`
      ),
      lessonTitle: `${payload.chapterName} - ${payload.knowledgePointName}`,
      weekIndex,
      taughtAt: addDays(semesterStart, weekIndex * 7),
      status,
      coverageRate: roundTo(
        clamp(
          status === ProgressStatus.COMPLETED
            ? 1
            : status === ProgressStatus.IN_PROGRESS
              ? 0.7
              : 0.2,
          0,
          1
        ),
        4
      ),
      expectedMasteryRate,
      observedMasteryRate,
      gapRate,
      notes:
        status === ProgressStatus.COMPLETED && gapRate < -0.12
          ? "已按进度完成教学，但掌握度仍然偏弱。"
          : status === ProgressStatus.IN_PROGRESS
            ? "当前仍在授课推进中。"
            : "计划安排在最后一轮复习阶段。"
    };
  });

  await createManyInChunks(teachingProgressRecords, 250, (chunk) =>
    prisma.teachingProgressRecord.createMany({
      data: chunk.map((record) => ({
        id: record.id,
        classId: record.classId,
        knowledgePointId: record.knowledgePointId,
        teacherId: record.teacherId,
        lessonTitle: record.lessonTitle,
        weekIndex: record.weekIndex,
        taughtAt: record.taughtAt,
        status: record.status,
        coverageRate: record.coverageRate,
        expectedMasteryRate: record.expectedMasteryRate,
        observedMasteryRate: record.observedMasteryRate,
        gapRate: record.gapRate,
        notes: record.notes
      }))
    })
  );

  const schoolKnowledgeSnapshots = knowledgePointRecords.map((knowledgePoint) => {
    const aggregate = assessmentAggregates.school.get(
      `${knowledgePoint.subjectCode}:${knowledgePoint.id}`
    );
    const masteryRate = aggregate
      ? roundTo(aggregate.scoreSum / aggregate.fullScoreSum, 4)
      : 0;

    return {
      id: randomUUID(),
      schoolId,
      gradeId,
      subjectId: knowledgePoint.subjectId,
      knowledgePointId: knowledgePoint.id,
      capturedAt: addDays(semesterStart, 120),
      sourceLabel: `${DEMO_CONFIG.semesterLabel}知识点掌握快照`,
      assessmentCount: aggregate?.assessmentIds.size ?? 0,
      questionCount: aggregate?.questionCount ?? 0,
      averageScoreRate: masteryRate,
      masteryRate,
      trendDelta: roundTo(masteryRate - 0.72, 4),
      riskLevel: getRiskLevel(masteryRate)
    };
  });

  const classKnowledgeSnapshots = classRecords.flatMap((schoolClass) => {
    const classIndex = Number(schoolClass.code.slice(-2));
    return knowledgePointRecords.map((knowledgePoint) => {
      const aggregate = assessmentAggregates.class.get(
        `${schoolClass.id}:${knowledgePoint.subjectCode}:${knowledgePoint.id}`
      );
      const masteryRate = aggregate
        ? roundTo(aggregate.scoreSum / aggregate.fullScoreSum, 4)
        : 0;

      return {
        id: randomUUID(),
        schoolId,
        gradeId,
        classId: schoolClass.id,
        subjectId: knowledgePoint.subjectId,
        knowledgePointId: knowledgePoint.id,
        capturedAt: addDays(semesterStart, 120 + classIndex),
        sourceLabel: `${schoolClass.name}知识点掌握快照`,
        assessmentCount: aggregate?.assessmentIds.size ?? 0,
        questionCount: aggregate?.questionCount ?? 0,
        averageScoreRate: masteryRate,
        masteryRate,
        trendDelta: roundTo(masteryRate - 0.7, 4),
        riskLevel: getRiskLevel(masteryRate)
      };
    });
  });

  await createManyInChunks(
    schoolKnowledgeSnapshots,
    500,
    (chunk) => prisma.schoolKnowledgePointSnapshot.createMany({ data: chunk })
  );

  await createManyInChunks(
    classKnowledgeSnapshots,
    500,
    (chunk) => prisma.classKnowledgePointSnapshot.createMany({ data: chunk })
  );

  const classAnalysisSnapshots = classRecords.flatMap((schoolClass) =>
    subjectRecords.map((subject) => {
      const normalizedScores =
        classAssessmentScoreBuckets.get(`${schoolClass.id}:${subject.code}`) ?? [];
      const averageNormalized = average(normalizedScores);
      const passRate = normalizedScores.filter((score) => score >= 0.6).length /
        Math.max(normalizedScores.length, 1);
      const excellenceRate =
        normalizedScores.filter((score) => score >= 0.85).length /
        Math.max(normalizedScores.length, 1);
      const classProgress = teachingProgressRecords.filter(
        (record) =>
          record.classId === schoolClass.id && record.subjectId === subject.id
      );
      const completedCount = classProgress.filter(
        (record) => record.status === ProgressStatus.COMPLETED
      ).length;
      const masteredCompletedCount = classProgress.filter(
        (record) =>
          record.status === ProgressStatus.COMPLETED &&
          record.observedMasteryRate >= 0.72
      ).length;
      const weakestSnapshot = classKnowledgeSnapshots
        .filter(
          (snapshot) =>
            snapshot.classId === schoolClass.id && snapshot.subjectId === subject.id
        )
        .sort((left, right) => left.masteryRate - right.masteryRate)[0];
      const weakestKnowledgePoint = knowledgePointRecords.find(
        (knowledgePoint) => knowledgePoint.id === weakestSnapshot?.knowledgePointId
      );

      return {
        id: randomUUID(),
        schoolId,
        gradeId,
        classId: schoolClass.id,
        subjectId: subject.id,
        capturedAt: addDays(semesterStart, 125),
        sourceLabel: `${DEMO_CONFIG.semesterLabel}班级分析快照`,
        assessmentCount: assessments.filter(
          (assessment) => assessment.subjectCode === subject.code
        ).length,
        averageScore: roundTo(averageNormalized * 100, 2),
        passRate: roundTo(passRate, 4),
        excellenceRate: roundTo(excellenceRate, 4),
        masteryRate: roundTo(
          average(
            classKnowledgeSnapshots
              .filter(
                (snapshot) =>
                  snapshot.classId === schoolClass.id &&
                  snapshot.subjectId === subject.id
              )
              .map((snapshot) => snapshot.masteryRate)
          ),
          4
        ),
        progressRate: roundTo(completedCount / Math.max(classProgress.length, 1), 4),
        taughtCount: completedCount,
        taughtMasteredCount: masteredCompletedCount,
        weakestKnowledgePointCode: weakestKnowledgePoint?.code ?? null,
        weakestKnowledgePointName: weakestKnowledgePoint?.name ?? null,
        riskLevel: getRiskLevel(averageNormalized)
      };
    })
  );

  await prisma.classAnalysisSnapshot.createMany({
    data: classAnalysisSnapshots
  });

  const studentAnalysisSnapshots = students.flatMap((student) =>
    subjectRecords.map((subject) => {
      const summary = studentSubjectSummaries.get(`${student.id}:${subject.code}`);
      const masteryValues = knowledgePointRecords
        .filter((knowledgePoint) => knowledgePoint.subjectId === subject.id)
        .map((knowledgePoint) => {
          const aggregate = assessmentAggregates.student.get(
            `${student.id}:${subject.code}:${knowledgePoint.id}`
          );

          if (!aggregate || aggregate.fullScoreSum === 0) {
            return 0;
          }

          return aggregate.scoreSum / aggregate.fullScoreSum;
        });
      const masteryRate = average(masteryValues);
      const persistentWeakPointCount = masteryValues.filter(
        (value) => value < 0.6
      ).length;
      const overdueHomeworkCount =
        studentHomeworkSummaries.get(`${student.id}:${subject.code}`)?.overdueCount ?? 0;

      return {
        id: randomUUID(),
        schoolId,
        gradeId,
        classId: student.classId,
        studentId: student.id,
        subjectId: subject.id,
        capturedAt: addDays(semesterStart, 126),
        sourceLabel: `${DEMO_CONFIG.semesterLabel}学生分析快照`,
        averageScore: roundTo((summary?.totalNormalized ?? 0) / Math.max(summary?.count ?? 1, 1) * 100, 2),
        masteryRate: roundTo(masteryRate, 4),
        trendDelta: roundTo(
          (summary?.lastWindowScore ?? 0) - (summary?.firstWindowScore ?? 0),
          4
        ),
        persistentWeakPointCount,
        overdueHomeworkCount,
        riskLevel: getStudentRiskLevel({
          averageScore: (summary?.totalNormalized ?? 0) / Math.max(summary?.count ?? 1, 1),
          masteryRate,
          persistentWeakPointCount,
          overdueHomeworkCount
        })
      };
    })
  );

  await createManyInChunks(studentAnalysisSnapshots, 500, (chunk) =>
    prisma.studentAnalysisSnapshot.createMany({ data: chunk })
  );

  const suggestionSnapshots = buildSuggestionSnapshots({
    schoolId,
    gradeId,
    classAnalysisSnapshots,
    classRecords,
    schoolKnowledgeSnapshots,
    studentAnalysisSnapshots,
    students,
    subjectRecords
  });

  await prisma.schoolSuggestionSnapshot.createMany({
    data: suggestionSnapshots.schoolSuggestions
  });

  await prisma.classSuggestionSnapshot.createMany({
    data: suggestionSnapshots.classSuggestions
  });

  await prisma.studentSuggestionSnapshot.createMany({
    data: suggestionSnapshots.studentSuggestions
  });

  console.log(
    [
      `Seeded ${DEMO_CONFIG.schoolName} ${DEMO_CONFIG.gradeName}`,
      `${classRecords.length} classes`,
      `${students.length} students`,
      `${assessments.length} assessments`,
      `${homeworkSets.length} homework sets`,
      `${teachingProgressRecords.length} progress records`
    ].join(" | ")
  );
}

function buildTeachers(schoolId: string) {
  const homeroomTeachers = range(DEMO_CONFIG.classCount).map((index) => ({
    id: randomUUID(),
    schoolId,
    teacherNo: `T-HR-${String(index).padStart(3, "0")}`,
    name: TEACHER_NAMES[index - 1],
    primarySubject: null as SubjectCode | null
  }));

  const mathTeachers = range(5).map((index) => ({
    id: randomUUID(),
    schoolId,
    teacherNo: `T-MATH-${String(index).padStart(3, "0")}`,
    name: TEACHER_NAMES[DEMO_CONFIG.classCount + index - 1],
    primarySubject: SubjectCode.MATHEMATICS
  }));

  const physicsTeachers = range(5).map((index) => ({
    id: randomUUID(),
    schoolId,
    teacherNo: `T-PHYS-${String(index).padStart(3, "0")}`,
    name: TEACHER_NAMES[DEMO_CONFIG.classCount + 5 + index - 1],
    primarySubject: SubjectCode.PHYSICS
  }));

  return [...homeroomTeachers, ...mathTeachers, ...physicsTeachers];
}

function buildStudents(
  schoolClass: {
    id: string;
    code: string;
    name: string;
  },
  classIndex: number
) {
  return range(DEMO_CONFIG.studentsPerClass).map((seatNumber) => {
    const studentSeed = new SeededRandom(`student:${classIndex}:${seatNumber}`);
    const name = buildStudentName(classIndex, seatNumber);
    const isPersistentWeak = DEMO_CONFIG.persistentWeakStudentSeatNumbers.includes(
      seatNumber as (typeof DEMO_CONFIG.persistentWeakStudentSeatNumbers)[number]
    );
    const isTopStudent = seatNumber % 14 === 0;
    const isRecoveringStudent = seatNumber % 11 === 0;

    const subjectBias: Record<SubjectCode, number> = {
      [SubjectCode.MATHEMATICS]: roundTo(studentSeed.normal(0, 0.04), 4),
      [SubjectCode.PHYSICS]: roundTo(studentSeed.normal(0, 0.04), 4)
    };

    if (isPersistentWeak) {
      subjectBias.MATHEMATICS -= 0.08;
      subjectBias.PHYSICS -= 0.08;
    }

    if (isTopStudent) {
      subjectBias.MATHEMATICS += 0.08;
      subjectBias.PHYSICS += 0.07;
    }

    if (classIndex === 2) {
      subjectBias.MATHEMATICS += 0.03;
    }
    if (classIndex === 4 || classIndex === 9) {
      subjectBias.PHYSICS += 0.03;
    }

    const persistentWeakPointCodes = isPersistentWeak
      ? studentSeed.shuffle([...DEMO_CONFIG.schoolWideWeakPointCodes]).slice(0, 2)
      : seatNumber % 7 === 0
        ? [studentSeed.pick([...DEMO_CONFIG.schoolWideWeakPointCodes])]
        : [];

    return {
      id: randomUUID(),
      classId: schoolClass.id,
      classCode: schoolClass.code,
      classIndex,
      name,
      studentNo: `G9${String(classIndex).padStart(2, "0")}${String(
        seatNumber
      ).padStart(2, "0")}`,
      sortNumber: seatNumber,
      baseBias: roundTo(
        studentSeed.normal(
          isTopStudent ? 0.12 : isPersistentWeak ? -0.16 : 0,
          0.05
        ),
        4
      ),
      subjectBias,
      homeworkBias: roundTo(
        studentSeed.normal(
          isRecoveringStudent ? 0.04 : isPersistentWeak ? -0.08 : 0,
          0.03
        ),
        4
      ),
      trendBoost: roundTo(isRecoveringStudent ? 0.06 : studentSeed.normal(0.01, 0.02), 4),
      persistentWeakPointCodes
    } satisfies StudentProfile;
  });
}

function buildStudentName(classIndex: number, seatNumber: number) {
  const surname = STUDENT_SURNAMES[(classIndex * 3 + seatNumber) % STUDENT_SURNAMES.length];
  const givenName =
    STUDENT_GIVEN_NAMES[(classIndex * 5 + seatNumber * 2) % STUDENT_GIVEN_NAMES.length];
  return `${surname}${givenName}`;
}

function buildAssessments(
  subjects: SubjectRecord[],
  knowledgePointsBySubject: Map<SubjectCode, KnowledgePointRecord[]>
) {
  const assessments: AssessmentBlueprint[] = [];

  DEMO_CONFIG.assessmentWindows.forEach((window, windowIndex) => {
    subjects.forEach((subject) => {
      const knowledgePoints = knowledgePointsBySubject.get(subject.code) ?? [];
      const coveredCount = Math.min(knowledgePoints.length, 4 + windowIndex * 3);
      const coveredKnowledgePoints = knowledgePoints.slice(0, coveredCount);
      const selectedKnowledgePoints = selectQuestionKnowledgePoints(
        coveredKnowledgePoints,
        window.questionsPerSubject,
        `assessment:${window.seriesKey}:${subject.code}`
      );
      const scoreDistribution =
        ASSESSMENT_SCORE_DISTRIBUTIONS[window.questionsPerSubject];
      const questions = selectedKnowledgePoints.map((knowledgePointCodes, questionIndex) => {
        const primaryPoint = knowledgePointsByCodeFromList(
          knowledgePoints,
          knowledgePointCodes[0]
        );

        return {
          id: randomUUID(),
          code: `Q${String(questionIndex + 1).padStart(2, "0")}`,
          prompt: buildQuestionPrompt(subject.code, primaryPoint?.name ?? "综合题"),
          sequence: questionIndex + 1,
          fullScore: scoreDistribution[questionIndex],
          difficulty: Math.max(
            ...knowledgePointCodes.map(
              (knowledgePointCode) =>
                knowledgePoints.find(
                  (knowledgePoint) => knowledgePoint.code === knowledgePointCode
                )?.difficulty ?? 3
            )
          ),
          knowledgePointCodes
        };
      });

      assessments.push({
        id: randomUUID(),
        subjectCode: subject.code,
        subjectId: subject.id,
        seriesKey: window.seriesKey,
        name: `${window.label}·${subject.name}`,
        kind: window.kind as AssessmentKind,
        weekIndex: window.weekIndex,
        happenedAt: new Date(`${window.happenedOn}T08:00:00.000Z`),
        fullScore: scoreDistribution.reduce((sum, score) => sum + score, 0),
        windowOrder: windowIndex,
        questions
      });
    });
  });

  return assessments;
}

function buildHomeworkSets(
  classes: {
    id: string;
    code: string;
    name: string;
  }[],
  subjects: SubjectRecord[],
  knowledgePointsBySubject: Map<SubjectCode, KnowledgePointRecord[]>,
  classMathTeacher: Map<string, string>,
  classPhysicsTeacher: Map<string, string>
) {
  const homeworkSets: HomeworkBlueprint[] = [];

  classes.forEach((schoolClass) => {
    subjects.forEach((subject) => {
      DEMO_CONFIG.homeworkWeeks.forEach((weekIndex, homeworkIndex) => {
        const subjectKnowledgePoints = knowledgePointsBySubject.get(subject.code) ?? [];
        const sliceStart = Math.max(0, Math.min(subjectKnowledgePoints.length - 3, homeworkIndex * 2));
        const recentKnowledgePoints = subjectKnowledgePoints.slice(
          sliceStart,
          sliceStart + 4
        );
        const selectedKnowledgePoints = selectQuestionKnowledgePoints(
          recentKnowledgePoints,
          HOMEWORK_SCORE_DISTRIBUTION.length,
          `homework:${schoolClass.code}:${subject.code}:${weekIndex}`
        );
        const teacherId =
          subject.code === SubjectCode.MATHEMATICS
            ? classMathTeacher.get(schoolClass.id)
            : classPhysicsTeacher.get(schoolClass.id);

        if (!teacherId) {
          throw new Error(`Missing teacher for ${schoolClass.code} ${subject.code}`);
        }

        const questions = selectedKnowledgePoints.map((knowledgePointCodes, questionIndex) => {
          const primaryPoint = knowledgePointsByCodeFromList(
            subjectKnowledgePoints,
            knowledgePointCodes[0]
          );

          return {
            id: randomUUID(),
            code: `H${String(questionIndex + 1).padStart(2, "0")}`,
            prompt: `练习：${primaryPoint?.name ?? "综合复习"}`,
            sequence: questionIndex + 1,
            fullScore: HOMEWORK_SCORE_DISTRIBUTION[questionIndex],
            difficulty: Math.max(
              ...knowledgePointCodes.map(
                (knowledgePointCode) =>
                  subjectKnowledgePoints.find(
                    (knowledgePoint) => knowledgePoint.code === knowledgePointCode
                  )?.difficulty ?? 3
              )
            ),
            knowledgePointCodes
          };
        });

        homeworkSets.push({
          id: randomUUID(),
          classId: schoolClass.id,
          classCode: schoolClass.code,
          subjectCode: subject.code,
          subjectId: subject.id,
          teacherId,
          name: `第${weekIndex}周${subject.name}巩固练习`,
          kind:
            homeworkIndex % 2 === 0 ? HomeworkKind.HOMEWORK : HomeworkKind.PRACTICE,
          weekIndex,
          assignedAt: addDays(semesterStart, weekIndex * 7 - 2),
          dueAt: addDays(semesterStart, weekIndex * 7),
          fullScore: HOMEWORK_SCORE_DISTRIBUTION.reduce(
            (sum, score) => sum + score,
            0
          ),
          questions
        });
      });
    });
  });

  return homeworkSets;
}

function selectQuestionKnowledgePoints(
  knowledgePoints: KnowledgePointRecord[],
  questionCount: number,
  seed: string
) {
  const questionRandom = new SeededRandom(seed);
  const prioritized = questionRandom.shuffle(
    knowledgePoints.filter((knowledgePoint) =>
      DEMO_CONFIG.schoolWideWeakPointCodes.includes(
        knowledgePoint.code as (typeof DEMO_CONFIG.schoolWideWeakPointCodes)[number]
      )
    )
  );
  const regular = questionRandom.shuffle(
    knowledgePoints.filter(
      (knowledgePoint) =>
        !DEMO_CONFIG.schoolWideWeakPointCodes.includes(
          knowledgePoint.code as (typeof DEMO_CONFIG.schoolWideWeakPointCodes)[number]
        )
    )
  );
  const pool = [...prioritized, ...regular];

  return range(questionCount).map((questionIndex) => {
    const primary =
      pool[questionIndex % Math.max(pool.length, 1)] ?? knowledgePoints[0];
    const isComprehensive =
      knowledgePoints.length > 2 && questionIndex % 4 === 3 && questionIndex > 0;

    if (!isComprehensive) {
      return [primary.code];
    }

    const secondary =
      knowledgePoints[(questionIndex + 1) % knowledgePoints.length] ?? primary;
    if (secondary.code === primary.code) {
      return [primary.code];
    }

    return [primary.code, secondary.code];
  });
}

function buildQuestionPrompt(subjectCode: SubjectCode, knowledgePointName: string) {
  return `${
    subjectCode === SubjectCode.MATHEMATICS ? "数学" : "物理"
  }知识点练习：${knowledgePointName}`;
}

function knowledgePointsByCodeFromList(
  knowledgePoints: KnowledgePointRecord[],
  code: string
) {
  return knowledgePoints.find((knowledgePoint) => knowledgePoint.code === code);
}

function scoreAssessmentQuestion({
  assessment,
  classProfile,
  student,
  question,
  schoolWideWeakPointCodes
}: {
  assessment: AssessmentBlueprint;
  classProfile: ClassProfile;
  student: StudentProfile;
  question: QuestionBlueprint;
  schoolWideWeakPointCodes: Set<string>;
}) {
  const scoreSeed = new SeededRandom(
    `assessment-score:${assessment.id}:${student.id}:${question.id}`
  );
  const classBias =
    assessment.subjectCode === SubjectCode.MATHEMATICS
      ? classProfile.mathBias
      : classProfile.physicsBias;
  const weakPointPenalty = question.knowledgePointCodes.reduce((penalty, code) => {
    let nextPenalty = penalty;
    if (schoolWideWeakPointCodes.has(code)) {
      nextPenalty += 0.08;
    }
    if (student.persistentWeakPointCodes.includes(code)) {
      nextPenalty += 0.11;
    }
    return nextPenalty;
  }, 0);
  const progressBonus = assessment.windowOrder * student.trendBoost;
  const baseRate =
    0.74 +
    classBias +
    student.baseBias +
    student.subjectBias[assessment.subjectCode] +
    progressBonus -
    (question.difficulty - 2) * 0.045 -
    weakPointPenalty +
    scoreSeed.normal(0, 0.045);

  const scoreRate = clamp(baseRate, 0.12, 0.99);
  const score = roundTo(question.fullScore * scoreRate);
  return {
    score,
    scoreRate: roundTo(score / question.fullScore, 4)
  };
}

function scoreHomeworkQuestion({
  classProfile,
  completionRate,
  homeworkSet,
  question,
  student,
  schoolWideWeakPointCodes
}: {
  classProfile: ClassProfile;
  completionRate: number;
  homeworkSet: HomeworkBlueprint;
  question: QuestionBlueprint;
  student: StudentProfile;
  schoolWideWeakPointCodes: Set<string>;
}) {
  const scoreSeed = new SeededRandom(
    `homework-score:${homeworkSet.id}:${student.id}:${question.id}`
  );
  const subjectBias =
    homeworkSet.subjectCode === SubjectCode.MATHEMATICS
      ? classProfile.mathBias
      : classProfile.physicsBias;
  const weakPointPenalty = question.knowledgePointCodes.reduce((penalty, code) => {
    let nextPenalty = penalty;
    if (schoolWideWeakPointCodes.has(code)) {
      nextPenalty += 0.06;
    }
    if (student.persistentWeakPointCodes.includes(code)) {
      nextPenalty += 0.09;
    }
    return nextPenalty;
  }, 0);

  return clamp(
    0.8 +
      subjectBias * 0.7 +
      student.baseBias * 0.6 +
      student.subjectBias[homeworkSet.subjectCode] * 0.6 +
      classProfile.homeworkBias +
      student.homeworkBias +
      student.trendBoost * 0.3 -
      (question.difficulty - 2) * 0.035 -
      weakPointPenalty +
      scoreSeed.normal(0, 0.05),
    0,
    1
  ) * completionRate;
}

function rankAssessmentResults(
  results: {
    assessmentId: string;
    classId: string;
    normalizedScore: number;
    rankInClass: number | null;
    percentile: number | null;
  }[],
  students: StudentProfile[],
  assessments: AssessmentBlueprint[]
) {
  const studentsPerClass = new Map<string, number>();
  students.forEach((student) => {
    studentsPerClass.set(
      student.classId,
      (studentsPerClass.get(student.classId) ?? 0) + 1
    );
  });

  assessments.forEach((assessment) => {
    const classIds = new Set(
      students
        .filter((student) => Boolean(student.classId))
        .map((student) => student.classId)
    );

    classIds.forEach((classId) => {
      const bucket = results
        .filter(
          (result) =>
            result.assessmentId === assessment.id && result.classId === classId
        )
        .sort((left, right) => right.normalizedScore - left.normalizedScore);
      const size = studentsPerClass.get(classId) ?? bucket.length;

      bucket.forEach((result, index) => {
        result.rankInClass = index + 1;
        result.percentile = roundTo((size - index - 1) / Math.max(size - 1, 1), 4);
      });
    });
  });
}

function updateAggregate(
  target: Map<string, MasteryAggregate>,
  key: string,
  score: number,
  fullScore: number,
  assessmentId: string
) {
  const aggregate = target.get(key) ?? {
    scoreSum: 0,
    fullScoreSum: 0,
    questionCount: 0,
    assessmentIds: new Set<string>()
  };
  aggregate.scoreSum += score;
  aggregate.fullScoreSum += fullScore;
  aggregate.questionCount += 1;
  aggregate.assessmentIds.add(assessmentId);
  target.set(key, aggregate);
}

function pushToBucket(
  buckets: Map<string, number[]>,
  key: string,
  value: number
) {
  const bucket = buckets.get(key) ?? [];
  bucket.push(value);
  buckets.set(key, bucket);
}

function updateStudentSubjectSummary(
  summaries: Map<string, StudentSubjectSummary>,
  key: string,
  normalizedScore: number,
  windowOrder: number
) {
  const summary = summaries.get(key) ?? {
    totalNormalized: 0,
    count: 0,
    firstWindowScore: normalizedScore,
    lastWindowScore: normalizedScore,
    firstWindowOrder: windowOrder,
    lastWindowOrder: windowOrder
  };

  summary.totalNormalized += normalizedScore;
  summary.count += 1;

  if (windowOrder <= summary.firstWindowOrder) {
    summary.firstWindowOrder = windowOrder;
    summary.firstWindowScore = normalizedScore;
  }

  if (windowOrder >= summary.lastWindowOrder) {
    summary.lastWindowOrder = windowOrder;
    summary.lastWindowScore = normalizedScore;
  }

  summaries.set(key, summary);
}

function requireMapValue(
  map: Map<string, string>,
  key: string,
  label: string
) {
  const value = map.get(key);
  if (!value) {
    throw new Error(`Missing ${label}`);
  }

  return value;
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getRiskLevel(rate: number) {
  if (rate >= 0.82) {
    return RiskLevel.LOW;
  }
  if (rate >= 0.7) {
    return RiskLevel.MEDIUM;
  }
  if (rate >= 0.56) {
    return RiskLevel.HIGH;
  }
  return RiskLevel.CRITICAL;
}

function getStudentRiskLevel({
  averageScore,
  masteryRate,
  persistentWeakPointCount,
  overdueHomeworkCount
}: {
  averageScore: number;
  masteryRate: number;
  persistentWeakPointCount: number;
  overdueHomeworkCount: number;
}) {
  if (
    averageScore < 0.56 ||
    masteryRate < 0.55 ||
    persistentWeakPointCount >= 4 ||
    overdueHomeworkCount >= 3
  ) {
    return RiskLevel.CRITICAL;
  }

  if (
    averageScore < 0.64 ||
    masteryRate < 0.62 ||
    persistentWeakPointCount >= 3 ||
    overdueHomeworkCount >= 2
  ) {
    return RiskLevel.HIGH;
  }

  if (averageScore < 0.76 || masteryRate < 0.72 || overdueHomeworkCount >= 1) {
    return RiskLevel.MEDIUM;
  }

  return RiskLevel.LOW;
}

function buildSuggestionSnapshots({
  schoolId,
  gradeId,
  classAnalysisSnapshots,
  classRecords,
  schoolKnowledgeSnapshots,
  studentAnalysisSnapshots,
  students,
  subjectRecords
}: {
  schoolId: string;
  gradeId: string;
  classAnalysisSnapshots: {
    classId: string;
    subjectId: string;
    averageScore: number;
    weakestKnowledgePointCode: string | null;
    weakestKnowledgePointName: string | null;
    riskLevel: RiskLevel;
  }[];
  classRecords: {
    id: string;
    name: string;
  }[];
  schoolKnowledgeSnapshots: {
    subjectId: string;
    knowledgePointId: string;
    masteryRate: number;
  }[];
  studentAnalysisSnapshots: {
    classId: string;
    studentId: string;
    subjectId: string;
    persistentWeakPointCount: number;
    overdueHomeworkCount: number;
    riskLevel: RiskLevel;
  }[];
  students: StudentProfile[];
  subjectRecords: SubjectRecord[];
}) {
  const schoolSuggestions: {
    id: string;
    schoolId: string;
    gradeId: string;
    subjectId: string;
    capturedAt: Date;
    priority: number;
    title: string;
    summary: string;
    rationale: string;
  }[] = [];
  const classSuggestions: {
    id: string;
    schoolId: string;
    gradeId: string;
    classId: string;
    subjectId: string;
    capturedAt: Date;
    priority: number;
    title: string;
    summary: string;
    rationale: string;
  }[] = [];
  const studentSuggestions: {
    id: string;
    schoolId: string;
    gradeId: string;
    classId: string;
    studentId: string;
    subjectId: string;
    capturedAt: Date;
    priority: number;
    title: string;
    summary: string;
    rationale: string;
  }[] = [];

  subjectRecords.forEach((subject) => {
    const weakestSchoolPoint = schoolKnowledgeSnapshots
      .filter((snapshot) => snapshot.subjectId === subject.id)
      .sort((left, right) => left.masteryRate - right.masteryRate)[0];

    if (
      weakestSchoolPoint &&
      weakestSchoolPoint.masteryRate < DEMO_CONFIG.schoolInterventionThreshold
    ) {
      schoolSuggestions.push({
        id: randomUUID(),
        schoolId,
        gradeId,
        subjectId: subject.id,
        capturedAt: addDays(semesterStart, 127),
        priority: 1,
        title: `${subject.name}学科年级统筹提升`,
        summary: `该学科在年级层面存在持续性的关键薄弱知识点，建议统一干预。`,
        rationale: `${subject.name}当前最低知识点掌握率为${(
          weakestSchoolPoint.masteryRate * 100
        ).toFixed(1)}%，低于${(
          DEMO_CONFIG.schoolInterventionThreshold * 100
        ).toFixed(0)}%的统筹干预阈值。`
      });
    }

    classAnalysisSnapshots
      .filter((snapshot) => snapshot.subjectId === subject.id)
      .sort((left, right) => left.averageScore - right.averageScore)
      .slice(0, 3)
      .forEach((snapshot, index) => {
        const schoolClass = classRecords.find((record) => record.id === snapshot.classId);
        classSuggestions.push({
          id: randomUUID(),
          schoolId,
          gradeId,
          classId: snapshot.classId,
          subjectId: subject.id,
          capturedAt: addDays(semesterStart, 127),
          priority: index + 1,
          title: `${schoolClass?.name ?? "班级"}${subject.name}重点跟进`,
          summary: `${schoolClass?.name ?? "该班级"}在“${snapshot.weakestKnowledgePointName ?? "薄弱知识点"}”上表现偏弱，建议专项补强。`,
          rationale: `当前班级均分为${snapshot.averageScore.toFixed(
            1
          )}分，最薄弱知识点编码为${snapshot.weakestKnowledgePointCode ?? "待识别"}。`
        });
      });

    studentAnalysisSnapshots
      .filter(
        (snapshot) =>
          snapshot.subjectId === subject.id &&
          (snapshot.riskLevel === RiskLevel.CRITICAL ||
            snapshot.riskLevel === RiskLevel.HIGH)
      )
      .sort((left, right) => {
        const leftScore = left.persistentWeakPointCount * 10 + left.overdueHomeworkCount;
        const rightScore =
          right.persistentWeakPointCount * 10 + right.overdueHomeworkCount;
        return rightScore - leftScore;
      })
      .slice(0, 6)
      .forEach((snapshot, index) => {
        const student = students.find((candidate) => candidate.id === snapshot.studentId);
        studentSuggestions.push({
          id: randomUUID(),
          schoolId,
          gradeId,
          classId: snapshot.classId,
          studentId: snapshot.studentId,
          subjectId: subject.id,
          capturedAt: addDays(semesterStart, 127),
          priority: index + 1,
          title: `${student?.name ?? "学生"}${subject.name}个性化帮扶`,
          summary: `${student?.name ?? "该学生"}存在重复性薄弱点，需要加强个别跟进。`,
          rationale: `当前共有${snapshot.persistentWeakPointCount}个持续薄弱知识点，另有${snapshot.overdueHomeworkCount}次逾期练习记录。`
        });
      });
  });

  return {
    schoolSuggestions,
    classSuggestions,
    studentSuggestions
  };
}

async function createManyInChunks<T>(
  rows: T[],
  chunkSize: number,
  insert: (chunk: T[]) => Promise<unknown>
) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    await insert(rows.slice(index, index + chunkSize));
  }
}

async function resetDatabase() {
  await prisma.studentAssessmentQuestionScore.deleteMany();
  await prisma.studentAssessmentResult.deleteMany();
  await prisma.assessmentQuestionKnowledgePointMap.deleteMany();
  await prisma.assessmentQuestion.deleteMany();
  await prisma.assessment.deleteMany();
  await prisma.studentHomeworkQuestionScore.deleteMany();
  await prisma.studentHomeworkResult.deleteMany();
  await prisma.homeworkQuestionKnowledgePointMap.deleteMany();
  await prisma.homeworkQuestion.deleteMany();
  await prisma.homeworkSet.deleteMany();
  await prisma.teachingProgressRecord.deleteMany();
  await prisma.classKnowledgePointSnapshot.deleteMany();
  await prisma.schoolKnowledgePointSnapshot.deleteMany();
  await prisma.classAnalysisSnapshot.deleteMany();
  await prisma.studentAnalysisSnapshot.deleteMany();
  await prisma.studentSuggestionSnapshot.deleteMany();
  await prisma.classSuggestionSnapshot.deleteMany();
  await prisma.schoolSuggestionSnapshot.deleteMany();
  await prisma.classTeacherAssignment.deleteMany();
  await prisma.student.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.knowledgePoint.deleteMany();
  await prisma.curriculumChapter.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.schoolClass.deleteMany();
  await prisma.gradeLevel.deleteMany();
  await prisma.school.deleteMany();
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
