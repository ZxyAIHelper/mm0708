import { getIngestionOverview } from "@/lib/queries/ingestion";

export async function GET() {
  return Response.json(await getIngestionOverview());
}
