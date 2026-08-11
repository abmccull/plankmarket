> ## Documentation Index
> Fetch the complete documentation index at: https://planetscale.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Database replicas

> A replica is a continuously updated copy of your Postgres database.

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

<PlatformAvailability current="postgres" vitess="/vitess/scaling/replicas" />

## Overview

Replicas serve two main purposes:

* They provide a way to reduce load on your primary instance by allowing you to read from a replica.
* They increase database availability by enabling fast failovers for maintenance or unexpected failure.

<Warning>
  Before utilizing replicas for reducing load on the primary, it's important to understand the trade-offs. For more information, see the [Data consistency and replication lag](#data-consistency-and-replication-lag) section.
</Warning>

## How to query Postgres replicas

Postgres replicas can be used to read data and reduce load on the primary. PlanetScale does not automatically route queries to replicas unless you explicitly use a replica credential or tell your application to do so.

<Note>
  **PlanetScale's use of PgBouncer (port `6432`) does not support replica routing.** All connections through PgBouncer are automatically routed to the primary database, regardless of the username specification. Use direct connections (port `5432`) for replica access.
</Note>

To query a replica:

1. Append `|replica` to the end of your username for the branch you want to target:

```bash theme={null}
user=postgres.cnlmx96ec5kw|replica
```

<Note>
  If you're using a URI-formatted connection string (for example, `DATABASE_URL`), URL-encode the pipe character in the username suffix. Use `%7Creplica` instead of `|replica`.

  ```text theme={null}
  postgresql://postgres.cnlmx96ec5kw%7Creplica:pscale_pw_xxx@host:5432/my_database?sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca-certificates.crt
  ```
</Note>

1. Make sure the port in your connection string is set to `5432`. To pool connections to replicas, use a [dedicated replica PgBouncer](/docs/postgres/connecting/pgbouncer#dedicated-replica-pgbouncers) instead.

Your connection string should look something like this:

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

## High availability

Replicas within PlanetScale are used to enable high availability of your database. This is a part of the reason all production branches (excluding [single node](/docs/postgres/cluster-configuration/single-node)) in PlanetScale are provided 2 replicas. In situations where the underlying hardware or service hosting the primary Postgres node fails, our system will automatically elect a new primary node from the available replicas and reroute traffic to that new primary. This process is known as **reparenting** and typically is all handled within milliseconds or seconds.

If you're using [PgBouncer](/docs/postgres/connecting/pgbouncer), querying the primary during a reparent typically goes unnoticed, other than a bit of additional query latency. This is because PlanetScale's PgBouncer buffers queries under the hood during failovers and directs them to the new primary once the failover is complete.

## Multiple availability zones

In cloud architecture, regions are further broken down into logical groupings of data centers known as availability zones (or AZs for short). For example, the `us-east-1` region on AWS contains multiple AZs available to customers starting with `us-east-1a` through `us-east-1f`. The infrastructure for your PlanetScale Postgres database cluster is distributed across 3 availability zones. In the instance of an AZ failure, your database will automatically failover to an available AZ.

## Data consistency and replication lag

PlanetScale Postgres utilizes a consistency model in which data committed (`INSERT`, `UPDATE`, `DELETE`, etc) on the primary must be durably stored on and confirmed by at least one replica before the primary reports the commit succeeded to client.

<Note>
  This consistency model does mean that it's possible for a commit to be visible to other clients/transactions on the primary or the replicas, before the primary reports commit success back to the client.
</Note>

For development branches there is no data replication.

The delay between when a change is applied to a primary and the same change is applied to a replica is known as `replication lag`. Your database's replication lag is viewable on your database main "Dashboard" page.

It is important to be aware of replication lag whenever querying data from your replicas. For example, if you make an update and then immediately try to query for that updated data via a replica, it may not be available yet due to replication lag.

## When should you use replicas in your application?

Replicas are useful for offloading read-heavy workloads from the primary node. By using replicas, you can distribute the read load across multiple nodes, which can help improve the performance of your application. Some examples of where you might want to query a replica are: scheduled jobs, analytics jobs, search features, or aggregate queries. Replicas can also be used to provide a read-only view of your data to users or applications that do not need to write data, such as when a user is logged out or writing one-off queries for debugging purposes.

## Configuring replicas for your database cluster

By default, production databases (excluding [single node](/docs/postgres/cluster-configuration/single-node)) are created with 2 replicas. You may add additional replicas if you need to scale your read traffic. Adding additional replicase beyond the default does not guarantee an increase in availability of your database.

<Note>
  You are charged for additional replicas you add beyond the default. Billing for additional replicas begins once the replica change has completed. The additional cost is \~ 1/3 the original price of the base cluster running (initial primary + 2 replicas).
</Note>

To see how to increase and manage the number of additional replicas you have, see [Cluster configuration](/docs/postgres/cluster-configuration).

## Need help?

Get help from [the PlanetScale Support team](https://planetscale.com/contact?initial=support), or join our [Discord community](https://pscale.link/community) to see how others are using PlanetScale.

