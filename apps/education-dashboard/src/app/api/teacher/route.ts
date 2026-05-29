import { NextRequest } from "next/server";
import { SubjectCode } from "@prisma/client";
import { getTeacherDashboard } from "@/lib/queries/teacher";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const subjectParam = searchParams.get("subject");
  const windowParam = searchParams.get("window");

  const data = await getTeacherDashboard({
    classId: searchParams.get("classId") ?? undefined,
    subject:
      subjectParam === SubjectCode.MATHEMATICS || subjectParam === SubjectCode.PHYSICS
        ? subjectParam
        : undefined,
    window: windowParam === "latest" || windowParam === "aggregate" ? windowParam : undefined
  });

  return Response.json(data);
}
