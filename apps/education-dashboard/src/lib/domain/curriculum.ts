import { SubjectCode } from "@prisma/client";
import { DEMO_CONFIG, DEMO_CURRICULUM } from "@/lib/demo-config";

export function getSubjectLabel(subjectCode: SubjectCode) {
  const subject = DEMO_CONFIG.subjects.find((item) => item.code === subjectCode);
  return subject?.name ?? subjectCode;
}

export function getSubjectShortLabel(subjectCode: SubjectCode) {
  const subject = DEMO_CONFIG.subjects.find((item) => item.code === subjectCode);
  return subject?.shortName ?? subjectCode;
}

export function getCurriculumChapterCount(subjectCode: SubjectCode) {
  return DEMO_CURRICULUM[subjectCode].length;
}

export function getCurriculumKnowledgePointCount(subjectCode: SubjectCode) {
  return DEMO_CURRICULUM[subjectCode].reduce(
    (sum, chapter) => sum + chapter.knowledgePoints.length,
    0
  );
}
