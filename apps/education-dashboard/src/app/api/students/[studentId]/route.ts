import { NextRequest } from "next/server";
import { SubjectCode } from "@prisma/client";
import { getStudentDashboard } from "@/lib/queries/student";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ studentId: string }> }
) {
  const { studentId } = await context.params;
  const subjectParam = request.nextUrl.searchParams.get("subject");

  const data = await getStudentDashboard(
    studentId,
    subjectParam === SubjectCode.MATHEMATICS || subjectParam === SubjectCode.PHYSICS
      ? subjectParam
      : undefined
  );

  return Response.json(data);
}
