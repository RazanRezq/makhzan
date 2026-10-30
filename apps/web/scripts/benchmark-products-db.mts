import { cpus, platform, release } from "node:os";
import { Pool } from "pg";

// This script is deliberately unusable with a developer/production database.
const connectionString = process.env.TEST_DATABASE_URL;
if (process.env.NODE_ENV !== "test" || !connectionString) {
  throw new Error("Database benchmark requires NODE_ENV=test and TEST_DATABASE_URL.");
}
const databaseUrl = new URL(connectionString);
if (
  !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
  !["127.0.0.1", "localhost", "postgres-test"].includes(databaseUrl.hostname) ||
  decodeURIComponent(databaseUrl.pathname.slice(1)) !== "makhzan_test"
) {
  throw new Error("Refusing to benchmark outside the isolated makhzan_test database.");
}

type PlanNode = {
  "Node Type": string;
  "Index Name"?: string;
  "Actual Rows": number;
  "Actual Loops": number;
  "Rows Removed by Filter"?: number;
  "Rows Removed by Index Recheck"?: number;
  "Sort Method"?: string;
  "Shared Hit Blocks"?: number;
  "Shared Read Blocks"?: number;
  Plans?: PlanNode[];
};
type ExplainResult = {
  Plan: PlanNode;
  "Planning Time": number;
  "Execution Time": number;
};
type Case = {
  name: string;
  statement: string;
  values: (string | number)[];
};
type Measurement = {
  datasetSize: number;
  otherTenantRows: number;
  name: string;
  rowsReturned: number;
  executionMedianMs: number;
  executionP95Ms: number;
  planningMedianMs: number;
  plan: ReturnType<typeof summarizePlan>;
};

function summarizePlan(plan: PlanNode): {
  type: string;
  index?: string;
  actualRows: number;
  loops: number;
  filteredRows: number;
  sort?: string;
  sharedHits: number;
  sharedReads: number;
}[] {
  return [{
    type: plan["Node Type"],
    index: plan["Index Name"],
    actualRows: plan["Actual Rows"],
    loops: plan["Actual Loops"],
    filteredRows: plan["Rows Removed by Filter"] ?? 0,
    sort: plan["Sort Method"],
    sharedHits: plan["Shared Hit Blocks"] ?? 0,
    sharedReads: plan["Shared Read Blocks"] ?? 0,
  }, ...(plan.Plans ?? []).flatMap(summarizePlan)];
}

function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]!.toFixed(3));
}

const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();
const measurements: Measurement[] = [];
try {
  const runtime = await client.query<{ version: string }>("select version()");
  const initial = await client.query<{ tenants: number; products: number }>(
    "select (select count(*)::int from tenants) as tenants, (select count(*)::int from products) as products",
  );
  for (const count of [1_000, 10_000]) {
    await client.query("begin");
    try {
      const tenant = await client.query<{ id: string }>(
        "insert into tenants(name,base_currency) values ('Isolated benchmark tenant','AED') returning id",
      );
      const otherTenant = await client.query<{ id: string }>(
        "insert into tenants(name,base_currency) values ('Isolated benchmark foreign tenant','SAR') returning id",
      );
      const tenantId = tenant.rows[0]!.id;
      for (const id of [tenantId, otherTenant.rows[0]!.id]) {
        await client.query(
          `insert into products(tenant_id,sku,name,category_code,unit_code,status,created_at,updated_at)
           select $1, 'PERF-'||lpad(n::text,6,'0'), 'Product '||lpad(n::text,6,'0'),
             case when n%3=0 then 'FOOD' else 'GENERAL' end, 'UNIT',
             case when n%5=0 then 'INACTIVE' else 'ACTIVE' end,
             timestamptz '2025-01-01T00:00:00Z' + n * interval '1 minute',
             timestamptz '2025-01-01T00:00:00Z' + n * interval '1 minute'
           from generate_series(1,$2::int) n`,
          [id, count],
        );
      }
      await client.query("analyze products");
      const columns = "id,tenant_id,sku,name,category_code,unit_code,status,created_at,updated_at";
      const cases: Case[] = [
        {
          name: "tenant_first_page_created",
          statement: `select ${columns} from products where tenant_id=$1 order by created_at desc nulls last,id asc limit 25 offset 0`,
          values: [tenantId],
        },
        {
          name: "tenant_sku_sort",
          statement: `select ${columns} from products where tenant_id=$1 order by sku asc,id asc limit 25 offset 0`,
          values: [tenantId],
        },
        {
          name: "tenant_name_sort",
          statement: `select ${columns} from products where tenant_id=$1 order by name asc,id asc limit 25 offset 0`,
          values: [tenantId],
        },
        {
          name: "tenant_substring_search",
          statement: `select ${columns} from products where tenant_id=$1 and (sku ilike $2 or name ilike $2) order by created_at desc nulls last,id asc limit 25 offset 0`,
          values: [tenantId, "%Product 000%"],
        },
        {
          name: "tenant_search_category_status",
          statement: `select ${columns} from products where tenant_id=$1 and category_code=$2 and status=$3 and (sku ilike $4 or name ilike $4) order by name asc,id asc limit 25 offset 0`,
          values: [tenantId, "FOOD", "ACTIVE", "%Product%"],
        },
        {
          name: "tenant_deep_offset_created",
          statement: `select ${columns} from products where tenant_id=$1 order by created_at desc nulls last,id asc limit 25 offset $2`,
          values: [tenantId, count - 25],
        },
        {
          name: "tenant_total_count",
          statement: "select count(*) from products where tenant_id=$1",
          values: [tenantId],
        },
        {
          name: "tenant_matching_count",
          statement: "select count(*) from products where tenant_id=$1 and category_code=$2 and status=$3 and (sku ilike $4 or name ilike $4)",
          values: [tenantId, "FOOD", "ACTIVE", "%Product%"],
        },
      ];
      for (const item of cases) {
        // One warm-up followed by five measured PostgreSQL executions, not JS timings.
        const explain = `explain (analyze,buffers,format json) ${item.statement}`;
        await client.query(explain, item.values);
        const samples: ExplainResult[] = [];
        for (let sample = 0; sample < 5; sample++) {
          const result = await client.query<{ "QUERY PLAN": ExplainResult[] }>(explain, item.values);
          samples.push(result.rows[0]!["QUERY PLAN"][0]!);
        }
        const representative = samples[2]!;
        measurements.push({
          datasetSize: count,
          otherTenantRows: count,
          name: item.name,
          rowsReturned: representative.Plan["Actual Rows"],
          executionMedianMs: percentile(samples.map((sample) => sample["Execution Time"]), 0.5),
          executionP95Ms: percentile(samples.map((sample) => sample["Execution Time"]), 0.95),
          planningMedianMs: percentile(samples.map((sample) => sample["Planning Time"]), 0.5),
          plan: summarizePlan(representative.Plan),
        });
      }
    } finally {
      // Every synthetic row remains uncommitted and is removed even on failure.
      await client.query("rollback");
    }
  }
  const retained = await client.query<{ tenants: number; products: number }>(
    "select (select count(*)::int from tenants) as tenants, (select count(*)::int from products) as products",
  );
  if (JSON.stringify(initial.rows) !== JSON.stringify(retained.rows)) {
    throw new Error("Benchmark fixture rollback did not preserve existing test records.");
  }
  process.stdout.write(`${JSON.stringify({
    environment: {
      node: process.version,
      os: `${platform()} ${release()}`,
      cpu: cpus()[0]?.model ?? "unknown",
      postgres: runtime.rows[0]!.version,
      connection: "single PostgreSQL client on the local Compose network",
      samples: 5,
      cacheCondition: "warm after insert/ANALYZE and one EXPLAIN warm-up",
      notes: "PostgreSQL execution/planning times only, not HTTP latency or a load test. No extra indexes or planner settings. Fixtures rolled back.",
      fixturePreservation: "PASS",
    },
    measurements,
  }, null, 2)}\n`);
} finally {
  client.release();
  await pool.end();
}
