# Education Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a demo web dashboard for one school that ingests simulated Grade 9 Mathematics and Physics data and supports principal, teacher, and student analysis views with knowledge-point mastery and semester progress.

**Architecture:** Use a single Next.js TypeScript application as the UI shell and API host, with a local SQLite database managed through Prisma. Seed scripts generate realistic demo data for school structure, curriculum, assessments, homework, teaching progress, and derived analytics. The UI consumes internal API routes that expose dashboard-ready query shapes.

**Tech Stack:** Next.js 15, React, TypeScript, Tailwind CSS, Prisma, SQLite, Zod, Recharts, date-fns

---

## File Structure

### Application shell

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.js`
- Create: `tailwind.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`

### Routes and pages

- Create: `src/app/ingestion/page.tsx`
- Create: `src/app/principal/page.tsx`
- Create: `src/app/teacher/page.tsx`
- Create: `src/app/students/[studentId]/page.tsx`

### API routes

- Create: `src/app/api/overview/route.ts`
- Create: `src/app/api/principal/route.ts`
- Create: `src/app/api/teacher/route.ts`
- Create: `src/app/api/students/[studentId]/route.ts`
- Create: `src/app/api/ingestion/route.ts`

### Data and database

- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Create: `src/lib/db.ts`
- Create: `src/lib/demo-config.ts`
- Create: `src/lib/seed-random.ts`

### Domain modules

- Create: `src/lib/domain/curriculum.ts`
- Create: `src/lib/domain/scoring.ts`
- Create: `src/lib/domain/progress.ts`
- Create: `src/lib/domain/suggestions.ts`
- Create: `src/lib/domain/analytics.ts`
- Create: `src/lib/domain/ingestion.ts`

### Query and transform modules

- Create: `src/lib/queries/principal.ts`
- Create: `src/lib/queries/teacher.ts`
- Create: `src/lib/queries/student.ts`
- Create: `src/lib/queries/ingestion.ts`
- Create: `src/lib/transforms/charts.ts`

### UI components

- Create: `src/components/layout/app-shell.tsx`
- Create: `src/components/layout/top-nav.tsx`
- Create: `src/components/filters/subject-filter.tsx`
- Create: `src/components/filters/class-filter.tsx`
- Create: `src/components/filters/date-range-filter.tsx`
- Create: `src/components/cards/stat-card.tsx`
- Create: `src/components/charts/heatmap.tsx`
- Create: `src/components/charts/bar-comparison.tsx`
- Create: `src/components/charts/trend-line.tsx`
- Create: `src/components/tables/risk-student-table.tsx`
- Create: `src/components/tables/data-source-table.tsx`
- Create: `src/components/sections/suggestion-panel.tsx`
- Create: `src/components/sections/mastery-grid.tsx`
- Create: `src/components/sections/progress-summary.tsx`

### Static templates and docs

- Create: `public/templates/exam-import-template.csv`
- Create: `public/templates/homework-import-template.csv`
- Create: `README.md`

## Task 1: Bootstrap the Next.js demo application

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.js`
- Create: `tailwind.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `README.md`

- [ ] **Step 1: Create the package manifest with app dependencies**

```json
{
  "name": "education-dashboard-demo",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "db:push": "prisma db push",
    "db:seed": "tsx prisma/seed.ts",
    "setup:demo": "pnpm db:push && pnpm db:seed"
  }
}
```

- [ ] **Step 2: Add base Next.js app structure**

```tsx
export default function HomePage() {
  redirect("/teacher");
}
```

- [ ] **Step 3: Add base layout and global visual tokens**

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Run dependency install**

Run: `pnpm install`
Expected: dependencies install successfully and lockfile is created

- [ ] **Step 5: Start the dev server once**

Run: `pnpm dev`
Expected: Next.js starts without configuration errors

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json next.config.ts postcss.config.js tailwind.config.ts src/app README.md pnpm-lock.yaml
git commit -m "feat: bootstrap education dashboard app"
```

## Task 2: Define the database schema and seed realistic demo data

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Create: `src/lib/db.ts`
- Create: `src/lib/demo-config.ts`
- Create: `src/lib/seed-random.ts`
- Create: `public/templates/exam-import-template.csv`
- Create: `public/templates/homework-import-template.csv`

- [ ] **Step 1: Define Prisma models for organization, curriculum, assessment, homework, progress, and snapshots**

```prisma
model Student {
  id        String   @id @default(cuid())
  name      String
  classId   String
  class     SchoolClass @relation(fields: [classId], references: [id])
  results   StudentAssessmentResult[]
}

model KnowledgePoint {
  id         String   @id @default(cuid())
  subject    Subject
  chapter    String
  name       String
  sequence   Int
  difficulty Int
}
```

- [ ] **Step 2: Add deterministic seed helpers and demo constants**

```ts
export const DEMO_CONFIG = {
  schoolName: "示范中学",
  gradeName: "初三",
  classCount: 10,
  studentsPerClass: 50,
  subjects: ["MATH", "PHYSICS"] as const,
};
```

- [ ] **Step 3: Seed curriculum, classes, teachers, students, exams, homework, and progress records**

```ts
for (const classIndex of range(1, 10)) {
  await prisma.schoolClass.create({
    data: {
      name: `${classIndex}班`,
    },
  });
}
```

- [ ] **Step 4: Seed per-question scores and map each question to knowledge points**

```ts
await prisma.assessmentQuestion.create({
  data: {
    assessmentId,
    subject: "PHYSICS",
    prompt: "欧姆定律综合应用",
    knowledgePointMaps: {
      create: [{ knowledgePointId }],
    },
  },
});
```

- [ ] **Step 5: Add import template files for future real data onboarding**

```csv
assessment_name,subject,class_name,student_name,question_id,question_score,full_score,knowledge_point_code
```

- [ ] **Step 6: Materialize demo database**

Run: `pnpm db:push && pnpm db:seed`
Expected: SQLite file is created and seed completes with summary output

- [ ] **Step 7: Commit**

```bash
git add prisma src/lib public/templates
git commit -m "feat: add demo data schema and seed pipeline"
```

## Task 3: Implement analytics and suggestion logic

**Files:**
- Create: `src/lib/domain/curriculum.ts`
- Create: `src/lib/domain/scoring.ts`
- Create: `src/lib/domain/progress.ts`
- Create: `src/lib/domain/suggestions.ts`
- Create: `src/lib/domain/analytics.ts`

- [ ] **Step 1: Implement mastery aggregation helpers**

```ts
export function calculateMastery(score: number, fullScore: number) {
  if (fullScore <= 0) return 0;
  return Number((score / fullScore).toFixed(4));
}
```

- [ ] **Step 2: Aggregate student mastery by knowledge point across assessments**

```ts
export function buildStudentKnowledgePointMastery(records: StudentQuestionRecord[]) {
  return groupByKnowledgePoint(records).map(toMasterySummary);
}
```

- [ ] **Step 3: Aggregate class-level weakness signals**

```ts
export function classifyClassRisk(signal: {
  averageMastery: number;
  belowMedian: boolean;
  lowStudentCount: number;
  recentTrend: "down" | "flat" | "up";
}) {
  // return "high" | "medium" | "low"
}
```

- [ ] **Step 4: Compute semester progress against configured curriculum**

```ts
export function buildProgressSummary(taughtCount: number, totalCount: number) {
  return {
    taughtCount,
    totalCount,
    coverageRate: totalCount === 0 ? 0 : taughtCount / totalCount,
  };
}
```

- [ ] **Step 5: Implement lightweight suggestion generation**

```ts
export function buildTeacherSuggestion(input: TeacherSuggestionInput) {
  return `本班在${input.knowledgePointName}连续偏弱，建议优先安排专题复习，并重点关注${input.focusStudentCount}名学生。`;
}
```

- [ ] **Step 6: Add focused unit coverage for analytics helpers**

Run: `pnpm test` or `pnpm exec vitest run`
Expected: core analytics helpers pass deterministic cases

- [ ] **Step 7: Commit**

```bash
git add src/lib/domain package.json
git commit -m "feat: add mastery and suggestion analysis modules"
```

## Task 4: Build dashboard query layer and API routes

**Files:**
- Create: `src/lib/queries/principal.ts`
- Create: `src/lib/queries/teacher.ts`
- Create: `src/lib/queries/student.ts`
- Create: `src/lib/queries/ingestion.ts`
- Create: `src/lib/transforms/charts.ts`
- Create: `src/app/api/overview/route.ts`
- Create: `src/app/api/principal/route.ts`
- Create: `src/app/api/teacher/route.ts`
- Create: `src/app/api/students/[studentId]/route.ts`
- Create: `src/app/api/ingestion/route.ts`

- [ ] **Step 1: Define query functions that return dashboard-shaped payloads**

```ts
export async function getTeacherDashboard(params: TeacherDashboardParams) {
  return {
    summary: {},
    weakKnowledgePoints: [],
    riskStudents: [],
    suggestions: [],
  };
}
```

- [ ] **Step 2: Expose ingestion overview data**

```ts
export async function GET() {
  return Response.json(await getIngestionOverview());
}
```

- [ ] **Step 3: Expose teacher dashboard API**

```ts
export async function GET(request: NextRequest) {
  const params = teacherParamsSchema.parse(fromSearchParams(request.nextUrl.searchParams));
  return Response.json(await getTeacherDashboard(params));
}
```

- [ ] **Step 4: Expose principal and student APIs**

```ts
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ studentId: string }> }
) {
  const { studentId } = await context.params;
  return Response.json(await getStudentProfile(studentId));
}
```

- [ ] **Step 5: Add Zod validation for route inputs**

```ts
const teacherParamsSchema = z.object({
  classId: z.string().optional(),
  subject: z.enum(["MATH", "PHYSICS"]).default("PHYSICS"),
  window: z.enum(["single", "aggregate"]).default("aggregate"),
});
```

- [ ] **Step 6: Smoke test API responses locally**

Run: `pnpm dev` then open `/api/teacher?subject=PHYSICS`
Expected: JSON payload returns seeded teacher dashboard data

- [ ] **Step 7: Commit**

```bash
git add src/app/api src/lib/queries src/lib/transforms
git commit -m "feat: add dashboard query and api layer"
```

## Task 5: Build the data ingestion and dashboard pages

**Files:**
- Create: `src/components/layout/app-shell.tsx`
- Create: `src/components/layout/top-nav.tsx`
- Create: `src/components/filters/subject-filter.tsx`
- Create: `src/components/filters/class-filter.tsx`
- Create: `src/components/filters/date-range-filter.tsx`
- Create: `src/components/cards/stat-card.tsx`
- Create: `src/components/charts/heatmap.tsx`
- Create: `src/components/charts/bar-comparison.tsx`
- Create: `src/components/charts/trend-line.tsx`
- Create: `src/components/tables/risk-student-table.tsx`
- Create: `src/components/tables/data-source-table.tsx`
- Create: `src/components/sections/suggestion-panel.tsx`
- Create: `src/components/sections/mastery-grid.tsx`
- Create: `src/components/sections/progress-summary.tsx`
- Create: `src/app/ingestion/page.tsx`
- Create: `src/app/principal/page.tsx`
- Create: `src/app/teacher/page.tsx`
- Create: `src/app/students/[studentId]/page.tsx`

- [ ] **Step 1: Build the shared shell and navigation**

```tsx
<AppShell current="teacher">
  <TopNav />
</AppShell>
```

- [ ] **Step 2: Build the ingestion page**

```tsx
export default async function IngestionPage() {
  const data = await getIngestionOverview();
  return <DataSourceTable rows={data.sources} />;
}
```

- [ ] **Step 3: Build the teacher dashboard as the primary story page**

```tsx
export default async function TeacherPage() {
  const data = await getTeacherDashboard({ subject: "PHYSICS", window: "aggregate" });
  return <SuggestionPanel suggestions={data.suggestions} />;
}
```

- [ ] **Step 4: Build principal and student pages**

```tsx
export default async function PrincipalPage() {
  const data = await getPrincipalDashboard();
  return <BarComparison data={data.classDistribution} />;
}
```

- [ ] **Step 5: Add clear visual states for progress, weakness, and risk**

```tsx
<StatCard label="已覆盖知识点" value={`${data.progress.coverageRate * 100}%`} />
```

- [ ] **Step 6: Verify the main flows manually**

Run: `pnpm dev`
Expected:
- `/teacher` loads seeded class analysis
- `/principal` loads school comparison
- `/students/<id>` loads a student profile
- `/ingestion` shows import templates and source counts

- [ ] **Step 7: Commit**

```bash
git add src/app src/components
git commit -m "feat: add ingestion and analysis dashboards"
```

## Task 6: Polish demo storytelling and delivery readiness

**Files:**
- Modify: `prisma/seed.ts`
- Modify: `src/app/teacher/page.tsx`
- Modify: `src/app/principal/page.tsx`
- Modify: `src/app/students/[studentId]/page.tsx`
- Modify: `README.md`

- [ ] **Step 1: Tune seed data to include obvious story cases**

```ts
const storyCases = [
  { className: "3班", subject: "PHYSICS", knowledgePoint: "电路分析", weakness: "high" },
  { studentName: "李明", subject: "MATH", knowledgePoint: "二次函数图像", weakness: "high" },
];
```

- [ ] **Step 2: Surface one-click highlighted examples in the UI**

```tsx
<a href="/students/demo-student-id">查看典型学生案例</a>
```

- [ ] **Step 3: Document local setup and demo script**

```md
1. pnpm install
2. pnpm db:push
3. pnpm db:seed
4. pnpm dev
5. Open /teacher first
```

- [ ] **Step 4: Run final verification**

Run:
- `pnpm install`
- `pnpm db:push`
- `pnpm db:seed`
- `pnpm build`

Expected:
- seed completes
- production build succeeds
- all pages render with seeded data

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts src/app README.md
git commit -m "feat: polish education demo storytelling"
```
