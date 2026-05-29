# Education Quality Dashboard Design

## Overview

This project is a demo system for schools and education bureaus. It focuses on two connected goals:

1. Collect and organize school learning data, including exams, homework, classes, teachers, students, and knowledge-point mappings.
2. Analyze that data from principal, teacher, and student perspectives to support targeted teaching and learning intervention.

The first demo will use simulated data for one school, Grade 9, with 500 students across 10 classes, covering Mathematics and Physics.

## Product Goals

The demo should prove four things clearly:

1. The system can ingest structured historical learning data.
2. The system can map scores to knowledge points, not just totals.
3. The system can explain weak areas for classes and individual students.
4. The system can show both learning progress and mastery status.

## Core Product Structure

The system is organized into three capability layers.

### 1. Curriculum Knowledge System

This defines what should be learned during the semester.

For each subject, the system stores:

- Subject
- Semester
- Chapter
- Knowledge point
- Suggested sequence
- Difficulty

This layer is required so the system can answer both:

- What has been taught?
- What has actually been learned well?

### 2. Data Ingestion

This stores what actually happened in the school.

The first demo includes:

- School information
- Grade information
- Class information
- Teacher information
- Student information
- Exams
- Homework and practice records
- Questions under each exam or homework set
- Knowledge-point mapping for each question
- Student answer results and scores
- Teaching progress records

The first version does not need a heavy real-world ETL pipeline. It does need:

- An upload/import entry
- Example import templates
- Simulated data that looks realistic

### 3. Multi-Perspective Analysis

This combines curriculum structure and historical performance data.

The system supports three perspectives:

#### Principal Perspective

Used to understand school-wide and grade-wide status.

Key outputs:

- Subject average and median
- Distribution across classes
- Knowledge-point risk heatmap
- Class comparison
- Semester progress distribution
- Priority classes needing intervention

#### Teacher Perspective

This is the primary demo scenario.

Key outputs:

- Class average status
- Weakest knowledge points
- Knowledge-point mastery heatmap
- Student groups needing attention
- Lightweight teaching suggestions
- Progress vs mastery gap

#### Student Perspective

Used to understand one student in detail.

Key outputs:

- Knowledge-point mastery map
- Persistently weak knowledge points
- Recent trend
- Lightweight individualized suggestions

## Demo Scope

The first version is intentionally narrow.

Included:

- One school
- Grade 9 only
- 10 classes
- 500 students
- Mathematics and Physics
- Multiple exams
- Multiple homework/practice records
- Knowledge-point tree for both subjects
- Single-exam analysis
- Multi-exam aggregate analysis
- Simulated import flow

Excluded from first version:

- Real Excel cleaning pipeline
- Multi-school tenancy
- Authentication and permissions
- AI-generated exercise sheets
- Automatic lesson planning
- Parent-facing features

## Data Model

The demo needs these main entities.

### Organization

- School
- Grade
- Class
- Teacher
- Student
- ClassTeacherAssignment

### Curriculum

- Subject
- Chapter
- KnowledgePoint
- SemesterCurriculumPlan
- TeachingProgressRecord

### Assessment

- Assessment
- AssessmentQuestion
- QuestionKnowledgePointMap
- StudentAssessmentResult
- StudentQuestionScore

### Practice

- HomeworkSet
- HomeworkQuestion
- StudentHomeworkResult

### Analytics

- KnowledgePointMasterySnapshot
- ClassAnalysisSnapshot
- StudentAnalysisSnapshot
- SuggestionSnapshot

## Simulated Data Design

The demo data must be deliberately realistic enough to support storytelling.

### Student and Class Scale

- 1 school
- 1 grade level: Grade 9
- 10 classes
- 50 students per class
- Total 500 students

### Subjects

- Mathematics
- Physics

### Curriculum Structure

Both subjects should include a configurable semester knowledge-point catalog.

Examples:

Mathematics:

- Linear functions
- Quadratic functions
- Function graphs
- Geometry proof
- Similar triangles
- Statistics and probability

Physics:

- Motion basics
- Force and pressure
- Work and power
- Electricity basics
- Circuit analysis
- Ohm's law application

Each knowledge point should include:

- ID
- Name
- Subject
- Chapter
- Sequence order
- Difficulty level

### Historical Records

The simulated dataset should contain:

- Several exams across the semester
- Several homework/practice records per subject
- Per-question scores for each student
- Knowledge-point mapping on each question
- Progress records showing what each class has already covered

### Required Realism Patterns

The synthetic data should intentionally include:

- Strong and weak classes
- Subject imbalance by class
- School-wide weak knowledge points
- Students with persistent weak areas
- Cases where content has been taught but not mastered
- Slight progress differences between classes

These patterns are important because the demo needs credible stories to show during presentation.

## Analysis Logic

The first version should use transparent rule-based analysis, not opaque AI scoring.

### Knowledge-Point Mastery

Mastery is calculated by aggregating question-level performance under each knowledge point.

Suggested approach:

- Use score rate at the question level
- Aggregate by student and knowledge point
- Aggregate by class and knowledge point
- Aggregate across multiple assessments for trend

### Weak Knowledge Points for a Class

A class knowledge point is considered weak when several of these signals appear:

- Low average mastery
- Below grade median
- Low performance across recent assessments
- Large number of students under threshold

### Weak Knowledge Points for a Student

A student knowledge point is considered weak when:

- Personal mastery is low
- Performance stays low across recent records
- Performance is meaningfully below class average

### Learning Progress

Progress is calculated against the semester knowledge-point plan.

The system should show:

- Total planned knowledge points
- Knowledge points already taught
- Knowledge points not yet taught
- Coverage percentage by class and subject
- Knowledge points taught but not yet mastered

### Lightweight Suggestions

Suggestions should be generated from explicit rules.

Examples:

- "Class 3 has remained weak in circuit analysis across the last 3 assessments. Prioritize a focused review this week."
- "Student Li Ming shows repeated weakness in quadratic function graph interpretation and application. Start with graph recognition before mixed problem practice."

This keeps the output explainable and presentation-safe.

## UI Structure

The demo should have four pages.

### 1. Data Ingestion Workspace

Purpose:

- Show what data has been loaded
- Show import entry points
- Show sample file templates
- Show imported exam/homework records

Main modules:

- Overview cards
- Import buttons
- Dataset list
- Sample schema preview

### 2. Teacher Dashboard

This should be the default landing page.

Main modules:

- Filters for class, subject, and date range
- Class overview cards
- Weak knowledge-point ranking
- Mastery heatmap
- Student risk list
- Teaching suggestions
- Progress vs mastery summary

### 3. Principal Dashboard

Main modules:

- School subject overview
- Class distribution chart
- School average vs median
- Risk class list
- Progress distribution by class
- Knowledge-point heatmap

### 4. Student Profile

Main modules:

- Student summary
- Knowledge-point mastery map
- Persistent weak points
- Recent trend
- Personalized suggestions

## Demo Narrative

The demo should be easy to present in three minutes.

Recommended story flow:

1. Enter teacher dashboard as the main page.
2. Show a class with several weak knowledge points.
3. Show which students are affected most.
4. Open one student profile and show detailed weak areas.
5. Switch to principal dashboard to show school-wide distribution.
6. Show data ingestion page to prove the system is designed for historical data import.

## Future-Ready Extension Points

The architecture should leave room for:

- Real CSV/Excel import
- More grades and subjects
- Multi-school deployment
- More learning data sources
- Large-language-model narrative explanations
- Recommendation engines for exercises

These should be visible in the design, but not implemented in first version.

## Recommended First Implementation Strategy

Build the system as a lightweight front-end plus back-end demo:

- Front end for dashboard and interactions
- Back end for simulated data, analysis logic, and APIs

This balances credibility and delivery speed better than a front-end-only mockup.

## Success Criteria

The first demo is successful if a viewer can understand all of the following:

1. The system can store and display school historical learning data.
2. The system can connect question scores to knowledge points.
3. A teacher can quickly find weak class knowledge points and target students.
4. A principal can compare classes at the school level.
5. A student profile can show concrete weak knowledge points.
6. The system can describe both semester progress and mastery outcomes.
