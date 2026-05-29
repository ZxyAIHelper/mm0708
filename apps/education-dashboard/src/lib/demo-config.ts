export const DEMO_CONFIG = {
  schoolCode: "HCZX",
  schoolName: "海川实验学校",
  gradeCode: "GRADE_9",
  gradeName: "初三",
  classCount: 10,
  studentsPerClass: 50,
  semesterLabel: "2025-2026学年下学期",
  semesterStartDate: "2026-02-16",
  semesterWeeks: 16,
  schoolInterventionThreshold: 0.68,
  subjects: [
    { code: "MATHEMATICS", name: "数学", shortName: "数学" },
    { code: "PHYSICS", name: "物理", shortName: "物理" }
  ] as const,
  assessmentWindows: [
    {
      seriesKey: "diagnostic",
      label: "开学诊断测验",
      kind: "DIAGNOSTIC",
      weekIndex: 2,
      happenedOn: "2026-02-27",
      questionsPerSubject: 8
    },
    {
      seriesKey: "monthly-1",
      label: "三月月考",
      kind: "MONTHLY",
      weekIndex: 5,
      happenedOn: "2026-03-20",
      questionsPerSubject: 9
    },
    {
      seriesKey: "midterm",
      label: "期中考试",
      kind: "MIDTERM",
      weekIndex: 9,
      happenedOn: "2026-04-17",
      questionsPerSubject: 10
    },
    {
      seriesKey: "final-mock",
      label: "期末模拟考",
      kind: "FINAL",
      weekIndex: 15,
      happenedOn: "2026-05-29",
      questionsPerSubject: 10
    }
  ] as const,
  homeworkWeeks: [2, 4, 7, 10, 13] as const,
  classProfiles: [
    {
      classIndex: 1,
      label: "均衡领先班",
      mathBias: 0.14,
      physicsBias: 0.11,
      homeworkBias: 0.08,
      progressOffsetWeeks: 0
    },
    {
      classIndex: 2,
      label: "数学优势班",
      mathBias: 0.16,
      physicsBias: -0.03,
      homeworkBias: 0.05,
      progressOffsetWeeks: 0
    },
    {
      classIndex: 3,
      label: "稳定中上班",
      mathBias: 0.08,
      physicsBias: 0.04,
      homeworkBias: 0.04,
      progressOffsetWeeks: 0
    },
    {
      classIndex: 4,
      label: "物理优势班",
      mathBias: -0.02,
      physicsBias: 0.13,
      homeworkBias: 0.02,
      progressOffsetWeeks: 0
    },
    {
      classIndex: 5,
      label: "基础一般但粗心班",
      mathBias: 0.02,
      physicsBias: -0.05,
      homeworkBias: -0.03,
      progressOffsetWeeks: 1
    },
    {
      classIndex: 6,
      label: "持续帮扶班",
      mathBias: -0.16,
      physicsBias: -0.13,
      homeworkBias: -0.08,
      progressOffsetWeeks: 1
    },
    {
      classIndex: 7,
      label: "数学偏弱但勤奋班",
      mathBias: -0.11,
      physicsBias: 0.02,
      homeworkBias: 0.03,
      progressOffsetWeeks: 0
    },
    {
      classIndex: 8,
      label: "持续进步班",
      mathBias: -0.05,
      physicsBias: -0.02,
      homeworkBias: 0.01,
      progressOffsetWeeks: 1
    },
    {
      classIndex: 9,
      label: "物理上升班",
      mathBias: 0.01,
      physicsBias: 0.08,
      homeworkBias: 0.02,
      progressOffsetWeeks: 0
    },
    {
      classIndex: 10,
      label: "基础薄弱波动班",
      mathBias: -0.13,
      physicsBias: -0.07,
      homeworkBias: -0.05,
      progressOffsetWeeks: 1
    }
  ] as const,
  schoolWideWeakPointCodes: [
    "MATH-QF-APPLICATION",
    "MATH-GEO-PROOF",
    "PHYS-ELEC-FAULT",
    "PHYS-ELEC-OHM-APP"
  ] as const,
  persistentWeakStudentSeatNumbers: [9, 17, 33] as const
} as const;

export const DEMO_CURRICULUM = {
  MATHEMATICS: [
    {
      code: "MATH-FUNC",
      name: "函数与图象",
      sequence: 1,
      knowledgePoints: [
        {
          code: "MATH-LF-MODEL",
          name: "一次函数建模",
          difficulty: 2
        },
        {
          code: "MATH-LF-GRAPH",
          name: "一次函数图象判读",
          difficulty: 2
        },
        {
          code: "MATH-QF-BASIC",
          name: "二次函数基础",
          difficulty: 3
        },
        {
          code: "MATH-QF-APPLICATION",
          name: "二次函数应用题",
          difficulty: 5
        }
      ]
    },
    {
      code: "MATH-GEO",
      name: "几何与相似",
      sequence: 2,
      knowledgePoints: [
        {
          code: "MATH-GEO-PROOF",
          name: "几何证明策略",
          difficulty: 5
        },
        {
          code: "MATH-SIM-CRITERIA",
          name: "相似三角形判定",
          difficulty: 3
        },
        {
          code: "MATH-SIM-APPLICATION",
          name: "相似三角形应用",
          difficulty: 4
        },
        {
          code: "MATH-CIRCLE-ANGLE",
          name: "圆与角关系",
          difficulty: 4
        }
      ]
    },
    {
      code: "MATH-STAT",
      name: "统计与概率",
      sequence: 3,
      knowledgePoints: [
        {
          code: "MATH-STAT-DATA",
          name: "统计图表解读",
          difficulty: 2
        },
        {
          code: "MATH-PROB-TREE",
          name: "概率树分析",
          difficulty: 3
        },
        {
          code: "MATH-STAT-MEAN",
          name: "平均数与方差分析",
          difficulty: 3
        },
        {
          code: "MATH-STAT-COMP",
          name: "综合统计问题",
          difficulty: 4
        }
      ]
    }
  ],
  PHYSICS: [
    {
      code: "PHYS-MOTION",
      name: "运动和力",
      sequence: 1,
      knowledgePoints: [
        {
          code: "PHYS-MOTION-SPEED",
          name: "速度时间图象",
          difficulty: 2
        },
        {
          code: "PHYS-FORCE-ANALYSIS",
          name: "运动中的受力分析",
          difficulty: 3
        },
        {
          code: "PHYS-PRESSURE",
          name: "压强与浮力",
          difficulty: 3
        },
        {
          code: "PHYS-MOTION-GRAPH",
          name: "运动图象判读",
          difficulty: 4
        }
      ]
    },
    {
      code: "PHYS-WORK",
      name: "功、功率与机械能",
      sequence: 2,
      knowledgePoints: [
        {
          code: "PHYS-WORK-CALC",
          name: "功的计算",
          difficulty: 2
        },
        {
          code: "PHYS-POWER-CALC",
          name: "功率计算",
          difficulty: 3
        },
        {
          code: "PHYS-MECH-EFF",
          name: "机械效率",
          difficulty: 4
        },
        {
          code: "PHYS-ENERGY-CONS",
          name: "能量守恒",
          difficulty: 4
        }
      ]
    },
    {
      code: "PHYS-ELECTRIC",
      name: "电学与电路",
      sequence: 3,
      knowledgePoints: [
        {
          code: "PHYS-ELEC-SERIES",
          name: "串并联电路",
          difficulty: 3
        },
        {
          code: "PHYS-ELEC-OHM",
          name: "欧姆定律基础",
          difficulty: 3
        },
        {
          code: "PHYS-ELEC-OHM-APP",
          name: "欧姆定律应用",
          difficulty: 5
        },
        {
          code: "PHYS-ELEC-FAULT",
          name: "电路故障分析",
          difficulty: 5
        }
      ]
    }
  ]
} as const;

export type DemoSubjectCode = (typeof DEMO_CONFIG.subjects)[number]["code"];
