> ## Documentation Index
> Fetch the complete documentation index at: https://planetscale.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Connections overview

> There are several ways to connect to Postgres databases, each with their advantages and tradeoffs.

export const PlatformAvailability = ({current, vitess, postgres}) => {
  const docsHref = path => {
    if (!path) return path;
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return normalized;
  };
  const labels = {
    vitess: 'Vitess',
    postgres: 'Postgres'
  };
  if (current === 'both') {
    return <div className="not-prose mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Platform availability">
        <span data-engine="both" data-state="current" aria-current="true" className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[13px] font-semibold leading-tight no-underline data-[engine=vitess]:data-[state=current]:border-[#ffc59b] data-[engine=vitess]:data-[state=current]:bg-[#ffe8d8] data-[engine=vitess]:data-[state=current]:text-[#672002] dark:data-[engine=vitess]:data-[state=current]:border-[#962d00] dark:data-[engine=vitess]:data-[state=current]:bg-[#3c1403] dark:data-[engine=vitess]:data-[state=current]:text-[#ffe8d8] data-[engine=vitess]:data-[state=link]:border-[#ffc59b] data-[engine=vitess]:data-[state=link]:bg-transparent data-[engine=vitess]:data-[state=link]:text-[#b83a05] dark:data-[engine=vitess]:data-[state=link]:border-[#962d00] dark:data-[engine=vitess]:data-[state=link]:bg-transparent dark:data-[engine=vitess]:data-[state=link]:text-[#ffc59b] data-[engine=postgres]:data-[state=current]:border-[#a9dffe] data-[engine=postgres]:data-[state=current]:bg-[#ddf2ff] data-[engine=postgres]:data-[state=current]:text-[#0e3682] dark:data-[engine=postgres]:data-[state=current]:border-[#144eb6] dark:data-[engine=postgres]:data-[state=current]:bg-[#08204e] dark:data-[engine=postgres]:data-[state=current]:text-[#ddf2ff] data-[engine=postgres]:data-[state=link]:border-[#a9dffe] data-[engine=postgres]:data-[state=link]:bg-transparent data-[engine=postgres]:data-[state=link]:text-[#0b6ec5] dark:data-[engine=postgres]:data-[state=link]:border-[#144eb6] dark:data-[engine=postgres]:data-[state=link]:bg-transparent dark:data-[engine=postgres]:data-[state=link]:text-[#73c7f9] data-[engine=both]:data-[state=current]:border-[#d4d4d4] data-[engine=both]:data-[state=current]:bg-[#f0f0f0] data-[engine=both]:data-[state=current]:text-[#3d3d3d] dark:data-[engine=both]:data-[state=current]:border-[#525252] dark:data-[engine=both]:data-[state=current]:bg-[#2a2a2a] dark:data-[engine=both]:data-[state=current]:text-[#e5e5e5]">
          Vitess and Postgres
        </span>
      </div>;
  }
  const hasVitess = current === 'vitess' || Boolean(vitess);
  const hasPostgres = current === 'postgres' || Boolean(postgres);
  const only = !(hasVitess && hasPostgres);
  const engines = [];
  if (current === 'vitess' || current === 'postgres') engines.push(current);
  if (hasVitess && current !== 'vitess') engines.push('vitess');
  if (hasPostgres && current !== 'postgres') engines.push('postgres');
  return <div className="not-prose mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Platform availability">
      {engines.map(engine => {
    const isCurrent = current === engine;
    const href = docsHref(engine === 'vitess' ? vitess : postgres);
    const label = only ? `${labels[engine]} only` : labels[engine];
    const state = isCurrent || !href ? 'current' : 'link';
    if (isCurrent || !href) {
      return <span key={engine} data-engine={engine} data-state={state} aria-current={isCurrent ? 'true' : undefined} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[13px] font-semibold leading-tight no-underline data-[engine=vitess]:data-[state=current]:border-[#ffc59b] data-[engine=vitess]:data-[state=current]:bg-[#ffe8d8] data-[engine=vitess]:data-[state=current]:text-[#672002] dark:data-[engine=vitess]:data-[state=current]:border-[#962d00] dark:data-[engine=vitess]:data-[state=current]:bg-[#3c1403] dark:data-[engine=vitess]:data-[state=current]:text-[#ffe8d8] data-[engine=vitess]:data-[state=link]:border-[#ffc59b] data-[engine=vitess]:data-[state=link]:bg-transparent data-[engine=vitess]:data-[state=link]:text-[#b83a05] dark:data-[engine=vitess]:data-[state=link]:border-[#962d00] dark:data-[engine=vitess]:data-[state=link]:bg-transparent dark:data-[engine=vitess]:data-[state=link]:text-[#ffc59b] data-[engine=postgres]:data-[state=current]:border-[#a9dffe] data-[engine=postgres]:data-[state=current]:bg-[#ddf2ff] data-[engine=postgres]:data-[state=current]:text-[#0e3682] dark:data-[engine=postgres]:data-[state=current]:border-[#144eb6] dark:data-[engine=postgres]:data-[state=current]:bg-[#08204e] dark:data-[engine=postgres]:data-[state=current]:text-[#ddf2ff] data-[engine=postgres]:data-[state=link]:border-[#a9dffe] data-[engine=postgres]:data-[state=link]:bg-transparent data-[engine=postgres]:data-[state=link]:text-[#0b6ec5] dark:data-[engine=postgres]:data-[state=link]:border-[#144eb6] dark:data-[engine=postgres]:data-[state=link]:bg-transparent dark:data-[engine=postgres]:data-[state=link]:text-[#73c7f9] data-[engine=both]:data-[state=current]:border-[#d4d4d4] data-[engine=both]:data-[state=current]:bg-[#f0f0f0] data-[engine=both]:data-[state=current]:text-[#3d3d3d] dark:data-[engine=both]:data-[state=current]:border-[#525252] dark:data-[engine=both]:data-[state=current]:bg-[#2a2a2a] dark:data-[engine=both]:data-[state=current]:text-[#e5e5e5]">
              {label}
            </span>;
    }
    return <a key={engine} href={href} data-engine={engine} data-state={state} title={`View ${labels[engine]} documentation`} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[13px] font-semibold leading-tight no-underline data-[engine=vitess]:data-[state=current]:border-[#ffc59b] data-[engine=vitess]:data-[state=current]:bg-[#ffe8d8] data-[engine=vitess]:data-[state=current]:text-[#672002] dark:data-[engine=vitess]:data-[state=current]:border-[#962d00] dark:data-[engine=vitess]:data-[state=current]:bg-[#3c1403] dark:data-[engine=vitess]:data-[state=current]:text-[#ffe8d8] data-[engine=vitess]:data-[state=link]:border-[#ffc59b] data-[engine=vitess]:data-[state=link]:bg-transparent data-[engine=vitess]:data-[state=link]:text-[#b83a05] dark:data-[engine=vitess]:data-[state=link]:border-[#962d00] dark:data-[engine=vitess]:data-[state=link]:bg-transparent dark:data-[engine=vitess]:data-[state=link]:text-[#ffc59b] data-[engine=postgres]:data-[state=current]:border-[#a9dffe] data-[engine=postgres]:data-[state=current]:bg-[#ddf2ff] data-[engine=postgres]:data-[state=current]:text-[#0e3682] dark:data-[engine=postgres]:data-[state=current]:border-[#144eb6] dark:data-[engine=postgres]:data-[state=current]:bg-[#08204e] dark:data-[engine=postgres]:data-[state=current]:text-[#ddf2ff] data-[engine=postgres]:data-[state=link]:border-[#a9dffe] data-[engine=postgres]:data-[state=link]:bg-transparent data-[engine=postgres]:data-[state=link]:text-[#0b6ec5] dark:data-[engine=postgres]:data-[state=link]:border-[#144eb6] dark:data-[engine=postgres]:data-[state=link]:bg-transparent dark:data-[engine=postgres]:data-[state=link]:text-[#73c7f9] data-[engine=both]:data-[state=current]:border-[#d4d4d4] data-[engine=both]:data-[state=current]:bg-[#f0f0f0] data-[engine=both]:data-[state=current]:text-[#3d3d3d] dark:data-[engine=both]:data-[state=current]:border-[#525252] dark:data-[engine=both]:data-[state=current]:bg-[#2a2a2a] dark:data-[engine=both]:data-[state=current]:text-[#e5e5e5]">
            {label}
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
              <path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>;
  })}
    </div>;
};

<PlatformAvailability current="postgres" />

## Connecting to your PlanetScale Postgres database

Connecting to your PlanetScale Postgres database involves understanding several key components. This page provides an overview of connection options — for detailed instructions, see the linked documentation below.

<Columns cols={2}>
  <Card title="Postgres">
    Create **role credentials** with [`pscale role`](/docs/cli/role), then connect using a [connection string](/docs/postgres/connecting/quickstart).

    `pscale connect` is not supported.
  </Card>

  <Card title="Vitess / MySQL">
    Create a **branch password** with [`pscale password`](/docs/cli/password), then connect with a [connection string](/docs/vitess/connecting/connection-strings) or [`pscale connect`](/docs/cli/connect).
  </Card>
</Columns>

### AI assistant integrations

You can expose read-only schema and query capabilities to tools like Claude, Cursor, or Zed through the shared [Model Context Protocol (MCP)](/docs/connect/mcp) guide. The CLI configures each tool for you via `pscale mcp install --target <claude|cursor|zed>`, and the PlanetScale MCP server streams data over a secure, read-only connection.

### Roles and credentials

PlanetScale provides two types of roles for database access:

* **Default postgres role** — A near-superuser role with extensive permissions, ideal for administrative tasks and initial database setup. This role should not be used for application connections.
* **User-defined roles** — Custom roles with specific permission sets that follow the principle of least privilege. These are recommended for all application connections and allow credential rotation without downtime.

Connection credentials include a hostname, username (formatted as `{role}.{branch_id}`), password (prefixed with `pscale_pw_`), and database name. Learn more about [managing roles and creating credentials](/docs/postgres/connecting/roles).

### Connection strings

PlanetScale databases require SSL/TLS encryption for all connections. Connection strings include parameters for the host, port, username, password, database name, and SSL configuration. The port determines the connection method:

* **Port 5432** — Direct connections to Postgres, bypassing PgBouncer
* **Port 6432** — Connections through PgBouncer for connection pooling

The [connections quickstart](/docs/postgres/connecting/quickstart) provides detailed connection string examples and explains when to use each connection method.

### Private connectivity

For enhanced security and reduced latency, PlanetScale supports private connectivity that keeps traffic within cloud provider networks:

* **AWS PrivateLink** — Establishes private connections from your AWS VPC to PlanetScale databases without exposing traffic to the public internet. See the [AWS PrivateLink documentation](/docs/postgres/connecting/private-connections/aws-privatelink).
* **GCP Private Service Connect** — Provides private connectivity from your Google Cloud VPC to PlanetScale databases. See the [GCP Private Service Connect documentation](/docs/postgres/connecting/private-connections/gcp-private-service-connect).

### Choosing a connection method for your platform

Most JavaScript and TypeScript applications should connect with a standard TCP driver such as [`pg`](/docs/postgres/tutorials/planetscale-postgres-node) through [PgBouncer](/docs/postgres/connecting/pgbouncer) on port **6432**. This applies to Vercel (with [`@vercel/functions`](https://vercel.com/guides/connection-pooling-with-functions) connection pooling), AWS Lambda, Railway, Render, and long-running servers.

For platforms without reliable TCP pooling, PlanetScale supports the [Neon serverless driver](/docs/postgres/connecting/neon-serverless-driver) over HTTP or WebSockets. Use it for [Netlify Functions](https://docs.netlify.com/functions/overview/), [Deno Deploy](https://deno.com/deploy/docs), and edge runtimes where TCP is not available. For [Cloudflare Workers](https://developers.cloudflare.com/workers/), prefer [Hyperdrive with `pg`](/docs/postgres/tutorials/planetscale-postgres-cloudflare-workers) over the serverless driver when possible.

## Understanding Postgres connections

Postgres uses a connection-per-process architecture. Each connection made to a Postgres server [spawns a new process](https://planetscale.com/blog/processes-and-threads), which consumes system resources including memory and CPU. For this reason, it's important to manage the number of direct connections to keep the system performant.

Connection pooling is the primary solution to this challenge. In the Postgres ecosystem, [PgBouncer](https://www.pgbouncer.org/) is the most widely-used connection pooler. PgBouncer instances sit between clients and the Postgres server, maintaining a small pool of connections to Postgres while accepting a much larger number of client connections. PgBouncer routes client requests through these pooled connections efficiently.

## Connection options

PlanetScale provides several ways to connect to your Postgres database:

1. **Direct primary connections** - Connect directly to your Postgres primary server on port `5432`. This provides the lowest latency and full Postgres session capabilities. Use this for administrative tasks, long-running operations, and data imports.

2. **Direct replica connections** - Connect directly to read-only replicas on port `5432` by appending `|replica` to your username. Use this for read-only queries that can tolerate replication lag.

3. **Local PgBouncer (primary only)** - All Postgres databases include a local PgBouncer running on the same host as the primary. Connect via port `6432`. This is recommended for all application connections to the primary.

4. **Dedicated replica PgBouncer** - Create dedicated PgBouncer instances that pool connections to your replicas. These run on separate nodes and are useful for read-heavy workloads. Connect via port `6432` with the PgBouncer name appended to your username.

5. **Dedicated primary PgBouncer** - Create dedicated PgBouncer instances that pool connections to your primary database. These run on separate nodes and provide improved high availability, with connections persisting through cluster resizes, upgrades, and most failover scenarios. Connect via port `6432` with the PgBouncer name appended to your username.

The following sections describe each option in detail to help you choose the right connection method for your use case.

## Direct primary connections

Direct connections provide the lowest-latency access to your Postgres primary instance.

<Frame>
  <img src="https://mintcdn.com/planetscale-2/UzFO5Pe10M0-W-uW/images/assets/docs/postgres/connecting/diagram-direct-connect.png?fit=max&auto=format&n=UzFO5Pe10M0-W-uW&q=85&s=d14a418b2ca34b52d64211181da8bd48" alt="Direct connections" style={{ maxHeight: '250px', width: 'auto' }} width="1436" height="720" data-path="images/assets/docs/postgres/connecting/diagram-direct-connect.png" />
</Frame>

However, these connections are considered *heavy-weight* since each one consumes significant resources. Direct connections are recommended only for specific scenarios:

1. Administrative tasks, like creating new databases/schemas, manual DDL commands, and installing extensions.
2. Long-running operations like `VACUUM`s and large analytical queries that are executed infrequently.
3. Importing data during a migration or other bulk-loading operations.
4. When you need features like `SET`, pub/sub, and other features not provided by PgBouncer pooled connections.

Because having too many direct connections degrades performance, PlanetScale sets `max_connections` to a conservative default value that varies depending on cluster size. To find this value, navigate to the "Clusters" page and select the "Parameters" tab.

<img src="https://mintcdn.com/planetscale-2/UzFO5Pe10M0-W-uW/images/assets/docs/postgres/connecting/cluster-configuration-parameters-darkmode.png?fit=max&auto=format&n=UzFO5Pe10M0-W-uW&q=85&s=11be7d48f5090ae0fb4442d04bae7d73" alt="Navigate to the Cluster Parameters page" width="3006" height="1296" data-path="images/assets/docs/postgres/connecting/cluster-configuration-parameters-darkmode.png" />

Search for `max_connections` to view the current configured value. This can be increased if necessary, though doing so requires careful consideration as increasing direct connections can negatively impact performance.

When the `max_connections` limit is reached, error messages like the following will appear:

```
FATAL: sorry, too many clients already
```

Or variations such as:

```
FATAL: remaining connection slots are reserved for non-replication superuser connections
```

For application connections outside of the specific use cases listed above, PgBouncer should be used instead.

## Direct replica connections

The main purpose for the default [Replicas](/docs/postgres/scaling/replicas) in a cluster is to maintain [high-availability](/docs/postgres/operations-philosophy), but they can also be used to handle read traffic. Since replicas are read-only, they are only capable of serving `SELECT` queries. All write traffic (`INSERT`, `UPDATE`, etc) must be sent to the primary.

<Frame>
  <img src="https://mintcdn.com/planetscale-2/UzFO5Pe10M0-W-uW/images/assets/docs/postgres/connecting/diagram-replica-direct-connect.png?fit=max&auto=format&n=UzFO5Pe10M0-W-uW&q=85&s=daa3dc082440c3c1928d615e4c53df6d" alt="Direct replica connections" style={{ maxHeight: '250px', width: 'auto' }} width="1936" height="792" data-path="images/assets/docs/postgres/connecting/diagram-replica-direct-connect.png" />
</Frame>

Replicas always experience some level of replication lag — the delay between data arriving at the primary and being replicated to a replica. Frequently, replication lag is measured in milliseconds, but it can grow to multiple seconds, especially when the server is experiencing high write traffic or network issues.

Because of these factors, queries should only be sent to replicas if they meet the following criteria: (A) they are read-only and (B) they can tolerate being slightly out-of-sync with the data on the primary. For reads that cannot tolerate this lag, send them to the primary.

To connect to a replica, append `|replica` to your credential username and use port `5432`. For example:

```bash theme={null}
psql 'host=xxxxxxxxxx-useast1-1.horizon.psdb.cloud \
      port=5432 \
      user=postgres.xxxxxxxxxx|replica \
      password=pscale_pw_xxxxxxxxxxxxxxxxxx \
      dbname=my_database \
      sslnegotiation=direct \
      sslmode=verify-full \
      sslrootcert=system'
```

Learn more about replicas and when to use them in the [database replicas documentation](/docs/postgres/scaling/replicas).

## PgBouncer connections

PgBouncer provides connection pooling for your Postgres database, allowing applications to scale beyond the constraints of direct connections. Connections from application servers should be made via PgBouncer whenever possible. PlanetScale provides three types of PgBouncer instances:

All managed PgBouncers run in transaction pooling mode. Session pooling is not offered because it creates a 1:1 mapping between clients and Postgres connections, so it hits the same connection limits as direct connections while introducing additional latency through another proxy layer. If you require session-specific behavior, use a direct connection on port `5432` instead of requesting session pooling.

### Local PgBouncer

<Frame>
  <img src="https://mintcdn.com/planetscale-2/UzFO5Pe10M0-W-uW/images/assets/docs/postgres/connecting/diagram-local-pgbouncer.png?fit=max&auto=format&n=UzFO5Pe10M0-W-uW&q=85&s=23da28858fc2cb08d57a6d44d571dce6" alt="Local PgBouncer connections" style={{ maxHeight: '250px', width: 'auto' }} width="1992" height="880" data-path="images/assets/docs/postgres/connecting/diagram-local-pgbouncer.png" />
</Frame>

All PlanetScale Postgres databases include a local PgBouncer instance running on the same host node as the Postgres primary. This is recommended for all application connections to the primary. To connect via the local PgBouncer, use the same credentials as a direct connection but change the port from `5432` to `6432`.

<Note>
  The local PgBouncer only routes connections to the primary. To pool connections to replicas, use a [dedicated replica PgBouncer](#dedicated-replica-pgbouncer).
</Note>

### Dedicated replica PgBouncer

<Frame>
  <img src="https://mintcdn.com/planetscale-2/UzFO5Pe10M0-W-uW/images/assets/docs/postgres/connecting/diagram-dedicated-replica-pgbouncer.png?fit=max&auto=format&n=UzFO5Pe10M0-W-uW&q=85&s=b455ccb9b6d2063f47bad676115bccd1" alt="Dedicated replica PgBouncer connections" style={{ maxHeight: '250px', width: 'auto' }} width="2656" height="792" data-path="images/assets/docs/postgres/connecting/diagram-dedicated-replica-pgbouncer.png" />
</Frame>

[Dedicated replica PgBouncers](/docs/postgres/connecting/pgbouncer#dedicated-replica-pgbouncers) run on nodes separate from the Postgres instances and pool connections to your replicas. These are useful for read-heavy workloads that send significant read traffic to replicas.

### Dedicated primary PgBouncers

<Frame>
  <img src="https://mintcdn.com/planetscale-2/kiyN17feiApl1in5/images/assets/docs/postgres/connecting/diagram-dedicated-primary-pgbouncer.png?fit=max&auto=format&n=kiyN17feiApl1in5&q=85&s=55b200856bc1bbf5cb7214c27676b24f" alt="Dedicated primary PgBouncer connections" style={{ maxHeight: '250px', width: 'auto' }} width="2196" height="880" data-path="images/assets/docs/postgres/connecting/diagram-dedicated-primary-pgbouncer.png" />
</Frame>

[Dedicated primary PgBouncers](/docs/postgres/connecting/pgbouncer#dedicated-primary-pgbouncers) provide connection pooling for your primary database on nodes separate from the Postgres servers. Traffic routes from the dedicated primary PgBouncer to the local PgBouncer on the primary node, and then to Postgres. This lets client connections persist through cluster resizes, upgrades, and most failover scenarios, providing improved high availability.

## Connecting to dedicated PgBouncers

Connect to replica or primary PgBouncers via port `6432` and append the name of the PgBouncer to your username. For example, if your PgBouncer is named `read-bouncer`, the connection username should be `postgres.xxxxxxxxxx|read-bouncer`.

```bash theme={null}
psql 'host=xxxxxxxxxx-useast1-1.horizon.psdb.cloud \
      port=6432 \
      user=postgres.xxxxxxxxxx|read-bouncer \
      password=pscale_pw_xxxxxxxxxxxxxxxxxx \
      dbname=my_database \
      sslnegotiation=direct \
      sslmode=verify-full \
      sslrootcert=system'
```

Learn more about [creating, configuring, and connecting to PgBouncers](/docs/postgres/connecting/pgbouncer).

