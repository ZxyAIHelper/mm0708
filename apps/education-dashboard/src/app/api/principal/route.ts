import { NextRequest } from "next/server";
import { SubjectCode } from "@prisma/client";
import { getPrincipalDashboard } from "@/lib/queries/principal";

export async function GET(request: NextRequest) {
  const subjectParam = request.nextUrl.searchParams.get("subject");

  const data = await getPrincipalDashboard(
    subjectParam === SubjectCode.MATHEMATICS || subjectParam === SubjectCode.PHYSICS
      ? subjectParam
      : undefined
  );

  return Response.json(data);
}
