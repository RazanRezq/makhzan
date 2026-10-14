# Blueprint for Building a Deployable and Maintainable Software Project

> A reusable template. Complete it gradually; do not turn it into a requirement to write extensive documentation before experimenting.
> Purpose: a limited-scope product with sound foundations, deployed and supported by decisions you can explain and test.
> This template cannot guarantee that you will anticipate every problem. It helps you identify risks, document assumptions, verify behavior, and recover from failures.

## How to Use This Template

- Copy this template for each new project and replace the fields in brackets.
- Classify each item as: undecided / assumption to test / approved / deferred with a reason.
- Test high-risk assumptions with a small experiment before building many other components on top of them.
- Security, testing, documentation, and operations accompany every feature; they are not stages postponed until the end of the project.
- Progress between stages depends on practical evidence, not the number of days spent or lines of code written.
- The Makhzan examples below are learning-oriented proposals, not approved changes to AGENTS.md.

---

# 1. Define the Project and Success

**Project name:** [ ]

**The problem in one sentence:** [ ]

**Primary user:** [ ]

**How does the user solve this problem today?** [ ]

**What outcome does the user want?** [ ]

**The simplest journey that delivers this outcome:** [ ]

**Product objective:** [ ]

**Learning objective:** [ ]

**Portfolio objective:** [What can a reviewer try and verify?]

**Implementation constraints:** [Solo developer/team, available time, monthly cost ceiling, devices, hosting, sensitive data]

**First measure of success:** [A testable outcome; do not settle for “a professional project.”]

## Scope

| Required in the first release | Deferred | Reason for deferral or condition for inclusion |
|---|---|---|
| [ ] | [ ] | [ ] |

**Explicitly out of scope:** [ ]

**Exit criterion:** I can describe one user and a complete journey, and explain what I will not build now and why.

---

# 2. Fundamentals and Learning Objectives

Before relying on a tool, check that you understand the concept it manages:

| Area | What do I need to understand? | Suggested evidence of understanding |
|---|---|---|
| Programming language | Types, promises, errors, modules, package management | Write a small component, explain it, and modify it without copying |
| The web | HTTP, cookies, sessions, browser and server, CORS, TLS | Trace a request from the interface to the database and back |
| Databases | SQL, relationships, constraints, transactions, indexes | A query, an integration test, and an execution plan before and after optimization |
| Full stack | UI form, validation, API, permissions, persistence, errors | A complete deployed journey, including failure cases |
| System design | Component boundaries, source of truth, concurrency, partial failure | A documented decision and an experiment that demonstrates the design's limits |
| DSA | Data structures, algorithm correctness, time and space analysis | An independent solution with edge cases and complexity analysis |
| Testing | Unit, integration, and interface tests; behavior under failure | A test that fails when a deliberate bug is introduced in an experimental branch |
| Deployment | Configuration, secrets, builds, data migrations, deployment | A clean redeployment from the repository without undocumented steps |
| Operations | Logs, metrics, alerts, backups, restoration | Detect a failure and document a recovery exercise |

**Learning rule:** Keep a production track for the project and a lab track for experiments. Do not introduce a technology into the product simply to demonstrate that you have heard of it.

---

# 3. User Journeys and Business Rules

## User Journey Card

**Name:** [ ]

**User and permissions:** [ ]

**Preconditions:** [ ]

**Inputs:** [ ]

**Steps:** [ ]

**Visible outcome:** [ ]

**Effect on data:** [ ]

**Alternative scenarios:** [Unavailable resource, invalid input, duplicate request, insufficient permissions]

**Failure scenarios:** [Network interruption, timeout, database failure, unavailable external service]

**Acceptance criteria:** [Given / When / Then, or an equivalent description]

## Rules That Must Never Be Broken — Invariants

| Rule | Where it is enforced | Test that proves it |
|---|---|---|
| [Example: one tenant cannot read another tenant's data] | [Server / database / file storage] | [A test deliberately using another tenant's identifier] |
| [Example: every stock balance change has a corresponding movement entry] | [Database transaction] | [Failure of either write does not leave the other committed on its own] |

## Document States

**Allowed states:** [ ]

**Allowed transitions:** [ ]

**Who can perform each transition?** [ ]

**When does inventory or a financial balance change?** [ ]

**What happens when a document is cancelled or corrected after execution?** [ ]

**Exit criterion:** Business rules and acceptance criteria are written for the first journey, including failures. They are not merely a list of screens.

---

# 4. Assumptions and Quality Requirements

Write measurable numbers or constraints. Any unverified number is an assumption, not a claim about the system's capacity.

| Item | Assumption or target | How will I verify it? | When will I reassess it? |
|---|---|---|---|
| Number of tenants and users | [ ] | [ ] | [ ] |
| Data volume per tenant | [ ] | [ ] | [ ] |
| Concurrent requests and arrival rate | [ ] | [A defined load test] | [ ] |
| Response time for a specific operation | [p95 under a described load and environment] | [ ] | [ ] |
| Monthly cost ceiling | [ ] | [Measure bills and consumption] | [ ] |
| Target service recovery time | [RTO] | [Recovery exercise] | [ ] |
| Acceptable amount of data loss | [RPO] | [Review and test the backup mechanism] | [ ] |
| Data privacy and retention | [ ] | [Review read, delete, and export operations] | [ ] |
| Arabic, mobile, and accessibility | [ ] | [Automated tests and manual checks] | [ ] |

Do not set a target such as “supports one million users” without defining the usage, data, infrastructure, and cost.

---

# 5. Data, Architecture, and Decisions

## Data Model

**Entities and relationships:** [ ]

**Identifiers, keys, and unique constraints:** [ ]

**Tenant isolation:** [How is it verified across reads, writes, relationships, files, jobs, and caches?]

**Financial fields, quantities, and rounding:** [ ]

**Timestamps and time zones:** [ ]

**Deletion versus archiving:** [ ]

**Operational records and audit logs:** [ ]

**Initial indexes and the queries that justify them:** [ ]

**Data migration plan when the schema changes:** [ ]

## Component Boundaries

**Frontend:** [ ]

**Backend and business modules:** [ ]

**Database and source of truth:** [ ]

**Background jobs:** [What actually requires them?]

**Storage and external services:** [ ]

**What must succeed or fail as one unit?** [ ]

**What can be deferred without compromising the operation's correctness?** [ ]

## Architectural Decision Record — ADR Template

**Title, date, and status:** [ ]

**Problem and context:** [ ]

**Constraints and assumptions:** [ ]

**Serious alternatives:** [Two or three alternatives, not a list of every technology]

**Decision:** [ ]

**Why did we choose it?** [ ]

**What do we give up or accept in return?** [Cost, complexity, provider dependency, performance limits]

**Experiment or evidence:** [ ]

**When will we reconsider?** [An observable signal, not just “when the project grows.”]

**Exit criterion:** I can trace requests and data, explain transaction boundaries, and justify the main choices. High-risk unknowns have experiments, not hidden guesses.

---

# 6. Risks and Failure Scenarios

For each journey, ask: What are we building? What could go wrong? What will we do about it? How will we verify that the solution is sufficient?

| Risk | Impact | Estimated likelihood | Protection | Test evidence | Accepted or deferred residual risk |
|---|---|---|---|---|---|
| [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |

## Recurring Review Questions

- What happens if the same request is repeated, sequentially or concurrently?
- What happens if the data is saved successfully but the response never reaches the user?
- What happens if two users modify the same resource?
- What happens if one part of the operation completes and another part fails?
- What happens if an external service times out or its quota is exhausted?
- What happens if a user tries to access another tenant's resource or performs an operation after their permissions are revoked?
- What happens if a file is too large, malicious, or does not match its declared type?
- How do we detect inconsistent data, a stuck job, or an unusual increase in cost?
- How do we restore service after a faulty deployment or data loss?

**Exit criterion:** The highest-impact risks have a mitigation and a test. Accepted risks are explicitly recorded, not forgotten.

---

# 7. The First Complete Deployed Path

Choose a small journey that touches the whole system, rather than building the entire frontend or backend separately.

**Initial technical example:** Sign in -> create a product -> save it under the correct tenant -> display it from the database.

**What the path includes:** Interface + validation + API + permissions + database + test + build + restricted-access deployment.

**Test data:** Synthetic data, without real customer documents or secrets.

**Suggested validation pipeline:** Reproducible installation -> typecheck -> lint -> tests -> build.

**Suggested deployment pipeline:** Successful validation -> staging deployment -> smoke test -> approval of a suitable release for public deployment.

**Exit criterion:** The journey works at a deployed URL, and another person can run it using the repository instructions. Deploying early does not mean opening public registration early.

---

# 8. The Implementation Cycle for Every Feature

1. Define what is required, what is excluded, and the acceptance criteria.
2. Outline the data flow and identify permissions, transaction boundaries, and failure scenarios.
3. Record only significant decisions, and test high-risk assumptions when necessary.
4. Write tests for important rules before or alongside implementation.
5. Implement the smallest complete slice across the interface, server, and data.
6. Review security, errors, logs, Arabic support, and mobile behavior.
7. Run the checks, deploy to a suitable environment, and verify the acceptance criteria.
8. Record what you learned, the solution's limitations, and any follow-up work.

## Testing Strategy

| Type | Purpose | Makhzan example |
|---|---|---|
| Unit | An isolated business rule or function | Reject an invalid state transition |
| Integration with a real test database | Verify constraints, transactions, and integration | A stock movement failure rolls back the entire transaction |
| API | Inputs, permissions, isolation, and responses | A VIEWER cannot receive a purchase order |
| Browser E2E | A real journey through the interface | Sign in -> purchase order -> receipt -> updated balance |
| Concurrency | Requests that genuinely overlap | Two sales competing for the last unit |
| Recovery / Failure | Application behavior when components fail | Stop the worker, then reprocess a job without duplicating its effect |
| Performance | A performance target under a described load | Product listing with specified data volume and load |

Do not rely on a database mock to prove that PostgreSQL locks work correctly. Simply starting two requests is not sufficient evidence that they overlapped; design a test that makes the overlap reproducible and verifiable.

## Definition of Done for a Feature

- [ ] Acceptance criteria and important failure scenarios have been verified.
- [ ] Permissions and tenant isolation are enforced on the server, not merely by hiding buttons.
- [ ] Data integrity is demonstrated by appropriate tests.
- [ ] A migration exists and has been tested when the schema changes.
- [ ] Loading, error, and empty states, Arabic support, and mobile behavior have been reviewed.
- [ ] Project checks pass.
- [ ] Required logs exist without secrets or unnecessary sensitive data.
- [ ] The change has been tested after deployment, and its limitations are documented.
- [ ] I can explain the code and the decision, and modify them myself.

---

# 9. Public Launch Readiness and Operations

## Deployment Model

**Where the frontend, backend, worker, database, and files run or reside:** [ ]

**Environments and how their data and secrets are separated:** [ ]

**Domain, HTTPS, cookies, and access configuration:** [ ]

**Secret management and rotation:** [ ]

**Where migrations run and the order needed for version compatibility:** [ ]

**Application version rollback procedure:** [ ]

**When a data change is incompatible:** [A forward-fix plan or a considered restoration plan; rolling back the application alone is not a data recovery plan.]

## Operations

**Core metrics:** Latency, traffic, errors, and resource saturation. Add application-specific measures such as the age of the oldest pending job and backup status.

**Logs:** Request ID, job ID, and useful operational context without secrets.

**Alerts:** [The condition that requires intervention and the expected response]

**Backups:** [What is included? Where are they stored? Frequency? Retention? Permissions?]

**Restoration exercise:** [Date, isolated environment, recovery time, most recent data available, post-restoration checks]

**Usage and cost limits:** [File sizes, request rate, AI quotas, storage, billing alerts]

**Public demo mode:** [A restricted account or isolated synthetic data with a cleanup mechanism; no shared administrator account over real data]

**Launch gate:** A critical journey has been tested after deployment, along with a failure scenario, an appropriate version rollback, and a backup restoration. Every known limitation is documented.

---

# 10. Evidence-Based Optimization and Scaling

Before any optimization, record:

**Measured problem:** [ ]

**Data volume and workload type:** [ ]

**Infrastructure and resources during measurement:** [ ]

**Metrics before the change:** [ ]

**Hypothesis about the cause:** [ ]

**Simplest suitable change:** [ ]

**Metrics after the change under comparable conditions:** [ ]

**Effect on data integrity, cost, and operations:** [ ]

Do not make microservices, Kubernetes, or sharding default requirements. You can study them in the lab and document when they might become justified without adding them to the product.

---

# 11. The Parallel DSA Track

**Suggested sequence:** Complexity analysis -> Arrays / Strings / Map / Set -> Sorting / Binary Search -> Stacks / Queues -> Trees / Heaps -> Graphs -> Dynamic Programming.

For each topic: an independent solution, edge cases, a correctness explanation, time and space analysis, and an alternative comparison when useful.

**Project-related experiments:**

- Compare ways to detect duplicate SKUs within an import file before sending it to the server; database constraints remain necessary.
- Compare ways to aggregate quantities by product in experimental data.
- Understand a product category tree if it becomes part of the scope.
- Implement a queue or heap in the lab for learning; do not replace BullMQ in the application merely for practice.

You do not need to invent a use for every algorithm in the inventory product. Independent problems cover the areas that the product does not exercise.

---

# 12. Evidence to Show in Your Portfolio

**Live demo:** [URL and a safe experience]

**README:** [Problem, user journey, local setup, environment, limitations]

**Architecture explanation:** [Components and data flow]

**Selected decisions:** [Why this solution? Why not the alternative?]

**Important runnable tests:** [Tenant isolation, concurrency, duplicate requests, transactions]

**At least one problem case study:** [Problem -> diagnosis -> solution -> test that prevents recurrence]

**Performance measurements:** [Measurement conditions and results, without claims about real users who do not exist]

**An operations and recovery exercise:** [What did you deliberately break in a test environment? How did you detect it and restore service?]

**Known limitations and future plan:** [ ]

---

# Suggested Initial Application to Makhzan

## What Comes from the Current File

AGENTS.md describes a multi-tenant inventory system in English and Arabic. It specifies TypeScript, NestJS, Next.js, PostgreSQL/Drizzle, and rules for inventory movements, transactions, isolation, permissions, jobs, and tests. This describes what the document requires; it is not evidence that the application has already been implemented or tested.

## Proposed First-Release Objective

Demonstrate a correct inventory journey from purchase to sale within an isolated tenant, with an Arabic/English interface, tests, and a secure deployment.

**Initial scope:** Authentication, tenants, and permissions; products, warehouses, and suppliers; purchase receiving; sales fulfillment; balances and a movement ledger.

**Deferred:** AI invoice extraction, commercial subscription billing, advanced reports, and large integrations. Activate background jobs when the first real need arises, without automatically replacing the technologies specified in the file.

**Not required for this objective:** Building a complete medical WMS or adding FEFO, batches, and advanced operations before deploying the core path.

## Proposed Implementation Sequence

| Phase | Outcome | Exit evidence |
|---|---|---|
| 0 | Define scope, learning objectives, and initial risks | A clear decision page |
| 1 | Data model and critical decisions | An ERD, acceptance criteria, and small experiments for high-risk unknowns |
| 2 | A deployed product-management path with authentication and isolation | Successful reads and writes, an isolation test, and automated checks |
| 3 | The first correct purchase receipt | A movement and balance within a transaction; correct behavior under retries and failure |
| 4 | Sales, concurrency, and permissions | A concurrent test for the last unit and access-denial tests |
| 5 | Public demo readiness | Monitoring, cost limits, backups and restoration, and a safe demo experience |
| 6 | Additional features and optimization experiments | A justified need, measurements, and tests before merging the change |

## Decisions to Resolve Before Expanding Inventory Functionality

1. Does confirmation reserve stock, or is stock deducted only at fulfillment? What does the system promise the user?
2. How is opening stock handled? How does the balance reconcile with the sum of movements?
3. What happens on the first movement before a stock_levels row exists? What is the strategy for concurrent creation?
4. How is Idempotency-Key handled within the tenant and operation? What happens when the same key is used with a different payload, or when two requests overlap?
5. Are the order state update, movement entry, and stock balance update part of the same transaction?
6. In what order are stock rows locked in an operation involving multiple products or warehouses? How is a transaction aborted because of a conflict handled?
7. How do we prevent linking one tenant's document to another tenant's product or warehouse, including relationships, files, and jobs?
8. How are corrections and cancellations handled after fulfillment without modifying the movement ledger?
9. What happens to associated jobs if the transaction succeeds but enqueueing fails? Do we need a reliable publication pattern, or can that be deferred?
10. When adding AI: is its output only a reviewable draft? What are the quotas, costs, and procedures for unsafe files and incorrect results?

---

# Organizing the Documentation

Start with one or two files, then separate sections when their content grows. Do not create empty files simply to follow a structure.

- README.md: Running and demonstrating the project, and its limitations.
- AGENTS.md: Rules for working in the repository; links to other documentation rather than holding every product detail.
- docs/PROJECT.md: Problem, scope, learning objectives, and assumptions.
- docs/DESIGN.md: Flows, data, architecture, and risks.
- docs/decisions/: Significant decisions only.
- docs/OPERATIONS.md: Deployment, rollback, backups, and restoration.
- Task tracker: Acceptance criteria, tests, and completion evidence for each feature.

# Using AI for Learning

Suggested working instruction: “Explain the problem, alternatives, and risks first. Do not complete a large feature in one pass. Help me implement a small part and test it, then review my ability to explain the decision and potential failures.”

Your standard is not merely that the code works: you must be able to trace the request, diagnose a fault, change the behavior, and write a test that proves the change.

---

# Methodological References

This blueprint is a proposed synthesis for the learning objective, not a certification standard or a security guarantee. The references below support the concepts used; the scope, exit criteria, and examples are practical proposals.

1. Attached AGENTS.md — Makhzan: Project definition and technologies, lines 10–47; inventory, 98–107; isolation, 113–118; implementation and checks, 207–233.
2. AWS Prescriptive Guidance — Architectural decision record process: `https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html`
3. OWASP — Threat Modeling Cheat Sheet: `https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html`
4. PostgreSQL 16 — Explicit Locking: `https://www.postgresql.org/docs/16/explicit-locking.html`
5. Software Engineering at Google — Larger Tests: `https://abseil.io/resources/swe-book/html/ch14.html`
6. GitHub Docs — Continuous Integration: `https://docs.github.com/en/actions/get-started/continuous-integration`
7. Google SRE — Monitoring Distributed Systems: `https://sre.google/sre-book/monitoring-distributed-systems/`
8. BullMQ — Idempotent jobs: `https://docs.bullmq.io/patterns/idempotent-jobs`
9. OWASP — File Upload Cheat Sheet: `https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html`
10. MIT OpenCourseWare — 6.006 Introduction to Algorithms, Syllabus: `https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/pages/syllabus/`
