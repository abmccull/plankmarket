> ## Documentation Index
> Fetch the complete documentation index at: https://planetscale.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# PlanetScale Postgres pricing

> PlanetScale Postgres databases are billed based on their configuration and usage.

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

<PlatformAvailability current="postgres" vitess="/vitess/pricing" />

## Overview

Understanding the relationship between **databases**, **branches**, and **clusters** is key to understanding your billing:

* **Database**: Your overall project (e.g., "my-ecommerce-app")
* **Branch**: Isolated database deployments that provide you with separate environments for development and testing, as well as restoring from backups. [Learn more about branching](/docs/postgres/branching)
* **Cluster**: The underlying compute and storage infrastructure that powers each branch

**Each branch runs on its own dedicated cluster** and is billed separately based on its configuration and usage.

* You are billed for the compute and storage resources (cluster) that power each branch (prorated to the millisecond each month)
* Every database branch you launch has default included amounts of:
  * [Cluster disk storage](#cluster-disk-storage)
  * [Backup storage](#backups)
  * [Network egress data transfer](#network-data-transfer)
  * [Replicas](#additional-replicas)
* Usage beyond the included defaults is charged based on the costs for that resource, this includes:
  * Cluster disk storage used beyond the included amount (for network-attached storage)
  * Backup storage used beyond the included amount
  * Network egress beyond the included amount
  * Additional replicas

There are no upfront commitments, and as you adjust your configuration or usage changes, pricing will automatically adjust from that point.

<Note>
  For information on Vitess cluster pricing on the Base plan, see [Base plan cluster pricing](/docs/plans/cluster-sizing).
</Note>

## Cluster instance size

Each database branch runs on its own dedicated cluster infrastructure. Clusters are billed based on the selected instance size and prorated to the millisecond. Each instance size includes defined amounts of vCPU cores and memory, as well as storage based on the storage type selected ([network-attached storage](/docs/postgres/cluster-configuration/cluster-storage) or [PlanetScale Metal](/docs/metal)). See [cluster pricing](#cluster-pricing) for more information.

You can [increase or decrease your cluster size](/docs/postgres/cluster-configuration) at any time. Pricing is prorated to the millisecond, so if you temporarily increase, you will only be charged for the larger cluster size for the time that it was running. Billing for a modified cluster size begins once the resize is completed. You can also [spin up additional production branches](/docs/postgres/branching) at any time for additional cost. The pricing for these is also prorated.

## Cluster disk storage

<Note>
  We use **[gibibytes, otherwise known as binary gigabytes](https://simple.wikipedia.org/wiki/Gibibyte)**, to calculate storage and usage limits. For reference, 1 binary gigabyte is equivalent to 2^30 bytes.
</Note>

### Storage types explained

PlanetScale offers two storage options with different pricing models:

| [PlanetScale Metal](/docs/metal)                                                                                                                                                                                                                                                     | [Network-Attached Storage](/docs/postgres/cluster-configuration/cluster-storage)                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **All-inclusive pricing**                                                                                                                                                                                                                                                       | **Configuration-based pricing**                                                                                                                                                                                                                                                                                                                                                                                  |
| - Storage cost is included in your cluster instance price <br /> - High-performance NVMe SSDs directly attached to your servers <br /> - To get more storage, you upgrade to a larger cluster size <br /> - Best for: High-performance applications that need predictable costs | - First 10 GB included with each cluster <br /> - Additional Storage is billed separately from your cluster instance configuration <br /> - Flexible scaling - add storage without changing cluster size <br /> - Automatic disk scaling with [autoscaling](/docs/postgres/cluster-configuration/cluster-storage#enable-autoscaling) <br /> - Best for: Applications with variable storage needs or cost optimization |

### Network-attached storage billing

For network-attached storage clusters, pricing varies by region and cloud provider:

* **Base storage**: you manually configure this in cluster settings, unless [autoscaling](/docs/postgres/cluster-configuration/cluster-storage#enable-autoscaling) is enabled
* **Additional IOPS**: you manually configure this in cluster settings (AWS only)
* **Additional Throughput**: you manually configure this in cluster settings (AWS only)

<Note>
  **AWS vs GCP Pricing**: AWS network-attached storage cluster types allow separate billing for IOPS and throughput that you manually configure. GCP network-attached storage cluster types include IOPS and throughput that scale automatically with disk size at no additional cost. See [AWS Storage Pricing](/docs/postgres/pricing/#aws-storage-pricing) and [GCP Storage Pricing](/docs/postgres/pricing/#gcp-storage-pricing) below for detailed regional pricing.
</Note>

Billing for modified storage attributes begins once the change for the cluster has completed.

**What are IOPS and Throughput?**

* **IOPS** (Input/Output Operations Per Second): How many read/write operations your database can handle per second. Higher IOPS = faster response for many small database queries.
* **Throughput**: How much data can be transferred per second (MiB/s). Higher throughput = faster for large data operations like bulk imports.

**Default values for AWS gp3 storage:**

All network-attached storage clusters on AWS come with the following baseline performance included at no additional cost:

| Setting                | Default value |
| ---------------------- | ------------- |
| IOPS                   | 3,000 IOPS    |
| Throughput (Bandwidth) | 125 MiB/s     |

These defaults apply to all PS-series cluster sizes (PS-5 through PS-2560). You only pay additional IOPS or throughput charges if you manually configure values above these baselines.

For more information on changing your cluster's storage, see the [Cluster storage configuration](/docs/postgres/cluster-configuration/cluster-storage) documentation.

## Backups

### Included backup storage

PlanetScale automatically includes backup storage with every database branch at no extra cost. Each branch gets backup storage equal to **2x your disk size**.

Examples:

| Disk Size | Backup Storage Included |
| :-------- | :---------------------- |
| 25 GB     | 50 GB                   |
| 50 GB     | 100 GB                  |
| 1000 GB   | 2000 GB                 |

<Note>
  For clusters with [network-attached storage](/docs/postgres/cluster-configuration/cluster-storage) with [autoscaling](/docs/postgres/cluster-configuration/cluster-storage#enable-autoscaling) enabled, **backup** storage changes as your **disk storage** autoscales.
</Note>

When your backup and WAL storage exceeds the included amount, additional storage is billed at **\$0.023 per GB per month**.

**Storage overage examples**:

| Storage Overage | Duration | Cost   |
| :-------------- | :------- | :----- |
| 100 GB          | 30 days  | \$2.30 |
| 100 GB          | 15 days  | \$1.15 |

### How backup billing works

**Storage calculation**: Both database data backups and WAL files are automatically compressed before being sent to backup storage. You're billed only on the compressed size, which is typically much smaller than your active database size.

Backup storage usage billing data is updated hourly.

For more details on backup functionality, see [Back up and restore](/docs/postgres/backups).

**What affects storage costs**:

| Factor                | Impact                                                  |
| :-------------------- | :------------------------------------------------------ |
| **Database activity** | More active databases generate more WAL files           |
| **Backup retention**  | Longer retention periods increase storage usage         |
| **Oldest backup age** | WAL files are kept as long as your oldest backup exists |

## Network data transfer

### Public traffic

Outgoing network traffic (egress) is billed based on the amount of data transferred out of PlanetScale Postgres instances to any other host or destination.
You are not charged for data transfer associated with [replicating](/docs/postgres/scaling/replicas) data between primaries and replicas or [backups](/docs/postgres/backups).
Each branch has a default amount of included public network egress that is aggregated for all cluster instances in the entire branch.

| Branch Type          | Included Public Network Egress |
| -------------------- | ------------------------------ |
| Production           | 100 GB per month               |
| PS-5 non-HA          | 10 GB per month                |
| Development (PS-DEV) | 10 GB per month                |

See [AWS Egress Pricing](#aws-egress-pricing) and [GCP Egress Pricing](#gcp-egress-pricing) below for detailed regional pricing.

Incoming public network traffic (ingress) is free.

### Private traffic

For databases using [private connections](/docs/postgres/connecting/private-connections) (AWS PrivateLink or GCP Private Service Connect),
all network traffic over that connection — both egress and ingress — is charged at a flat rate of **\$0.01/GB**, regardless of region.
This replaces the standard regional egress pricing for traffic routed over private connections.
Each branch has a default amount of included private network traffic that is aggregated for all cluster instances in the entire branch.

| Branch Type          | Included Private Network Traffic |
| -------------------- | -------------------------------- |
| Production           | 100 GB per month                 |
| PS-5 non-HA          | 10 GB per month                  |
| Development (PS-DEV) | 10 GB per month                  |

## Additional replicas

Each production cluster includes 2 [replicas](/docs/postgres/scaling/replicas) (excluding [Single Node](/docs/postgres/cluster-configuration/single-node)) to provide high availability and additional read capacity alongside the primary. Certain read-heavy workloads may demand additional read replicas. If you need additional replicas beyond what is included, you can add them for an additional cost based on the branch's instance size and storage requirements. The cost of an additional replica instance is \~1/3 the cost of the original 3-node cluster.

New replica(s) billing begins once the change has completed.

Examples:

| Base cluster configuration (includes 2 replicas) | Monthly base cluster cost             | Additional monthly replica cost       | Monthly total |
| :----------------------------------------------- | :------------------------------------ | :------------------------------------ | :------------ |
| M-160 (r8gd)                                     | \$589                                 | \$197                                 | \$786         |
| M-320 (r8gd)                                     | \$1,149                               | \$383                                 | \$1,532       |
| M-1280 (i8g)                                     | \$5,319                               | \$1,773                               | \$7,092       |
| PS-10 (aarch64 CPU) with 100 GB storage          | \$34 + \$33.75 (additional storage)   | \$12 + \$12.50 (\*additional storage) | \$92.25       |
| PS-160 (aarch64 CPU) with 1000 GB storage        | \$286 + \$371.25 (additional storage) | \$96 + \$125 (\*additional storage)   | \$878.25      |

\*Note: Replicas with network-attached storage do not include the default included cluster storage disk amount of 10GB. You pay for the entire configured disk size. Figures shown here are for AWS based instances with additional storage amounts and no additional IOPS/Throughput configured.

Development branches and Single Node databases do not support replicas. For more information on replicas, see [Replicas](/docs/postgres/scaling/replicas).

## Cluster pricing

Cluster instance pricing is based on the cloud provider's own pricing for the compute resources. Prices shown are for the **us-east-1 (N. Virginia)** region. Pricing may vary by region.

<Tip>
  Visit our pricing page for [interactive pricing configuration](https://planetscale.com/pricing) and region-specific details.
</Tip>

### Network-attached storage clusters

These clusters use [network-attached storage](/docs/postgres/cluster-configuration/cluster-storage), which is billed separately from compute. Storage can scale independently of your instance size.

* **Single Node** clusters are a single database instance, ideal for development, cost-sensitive startups, or non-critical workloads.
* **Highly Available** clusters are 3-node clusters with automatic failover for production workloads.

<Tip>
  Single Node PlanetScale Postgres databases start at \$5 per month.
</Tip>

<Accordion title="View network-attached storage cluster pricing">
  | Name            | Configuration    | Monthly Cost | CPU       | Memory |
  | :-------------- | :--------------- | :----------- | :-------- | :----- |
  | PS-5-AWS-X86    | Single Node      | \$5          | 1/16 vCPU | 512 MB |
  | PS-5-AWS-X86    | Highly Available | \$15         | 1/16 vCPU | 512 MB |
  | PS-5-AWS-ARM    | Single Node      | \$5          | 1/16 vCPU | 512 MB |
  | PS-5-AWS-ARM    | Highly Available | \$15         | 1/16 vCPU | 512 MB |
  | PS-10-AWS-ARM   | Single Node      | \$10         | 1/8 vCPU  | 1 GB   |
  | PS-10-AWS-ARM   | Highly Available | \$30         | 1/8 vCPU  | 1 GB   |
  | PS-10-AWS-X86   | Single Node      | \$13         | 1/8 vCPU  | 1 GB   |
  | PS-10-AWS-X86   | Highly Available | \$39         | 1/8 vCPU  | 1 GB   |
  | PS-20-AWS-ARM   | Single Node      | \$17         | 1/4 vCPU  | 2 GB   |
  | PS-20-AWS-ARM   | Highly Available | \$50         | 1/4 vCPU  | 2 GB   |
  | PS-20-AWS-X86   | Single Node      | \$20         | 1/4 vCPU  | 2 GB   |
  | PS-20-AWS-X86   | Highly Available | \$59         | 1/4 vCPU  | 2 GB   |
  | PS-40-AWS-ARM   | Single Node      | \$28         | 1/2 vCPU  | 4 GB   |
  | PS-40-AWS-ARM   | Highly Available | \$83         | 1/2 vCPU  | 4 GB   |
  | PS-40-AWS-X86   | Single Node      | \$33         | 1/2 vCPU  | 4 GB   |
  | PS-40-AWS-X86   | Highly Available | \$99         | 1/2 vCPU  | 4 GB   |
  | PS-80-AWS-ARM   | Single Node      | \$49         | 1 vCPU    | 8 GB   |
  | PS-80-AWS-ARM   | Highly Available | \$148        | 1 vCPU    | 8 GB   |
  | PS-80-AWS-X86   | Single Node      | \$60         | 1 vCPU    | 8 GB   |
  | PS-80-AWS-X86   | Highly Available | \$179        | 1 vCPU    | 8 GB   |
  | PS-160-AWS-ARM  | Single Node      | \$95         | 2 vCPUs   | 16 GB  |
  | PS-160-AWS-ARM  | Highly Available | \$286        | 2 vCPUs   | 16 GB  |
  | PS-160-AWS-X86  | Single Node      | \$116        | 2 vCPUs   | 16 GB  |
  | PS-160-AWS-X86  | Highly Available | \$349        | 2 vCPUs   | 16 GB  |
  | PS-320-AWS-ARM  | Single Node      | \$190        | 4 vCPUs   | 32 GB  |
  | PS-320-AWS-ARM  | Highly Available | \$570        | 4 vCPUs   | 32 GB  |
  | PS-320-AWS-X86  | Single Node      | \$233        | 4 vCPUs   | 32 GB  |
  | PS-320-AWS-X86  | Highly Available | \$699        | 4 vCPUs   | 32 GB  |
  | PS-640-AWS-ARM  | Single Node      | \$378        | 8 vCPUs   | 64 GB  |
  | PS-640-AWS-ARM  | Highly Available | \$1,135      | 8 vCPUs   | 64 GB  |
  | PS-640-AWS-X86  | Single Node      | \$466        | 8 vCPUs   | 64 GB  |
  | PS-640-AWS-X86  | Highly Available | \$1,399      | 8 vCPUs   | 64 GB  |
  | PS-1280-AWS-ARM | Single Node      | \$755        | 16 vCPUs  | 128 GB |
  | PS-1280-AWS-ARM | Highly Available | \$2,265      | 16 vCPUs  | 128 GB |
  | PS-1280-AWS-X86 | Single Node      | \$933        | 16 vCPUs  | 128 GB |
  | PS-1280-AWS-X86 | Highly Available | \$2,799      | 16 vCPUs  | 128 GB |
  | PS-2560-AWS-ARM | Single Node      | \$1,510      | 32 vCPUs  | 256 GB |
  | PS-2560-AWS-ARM | Highly Available | \$4,529      | 32 vCPUs  | 256 GB |
  | PS-2560-AWS-X86 | Single Node      | \$1,866      | 32 vCPUs  | 256 GB |
  | PS-2560-AWS-X86 | Highly Available | \$5,599      | 32 vCPUs  | 256 GB |
</Accordion>

### PlanetScale Metal clusters

[PlanetScale Metal](/docs/metal) clusters include high-performance NVMe storage directly attached to your servers. Storage is included in the cluster price.

<Tip>
  PlanetScale Postgres Metal clusters start at \$50 per month.
</Tip>

<Accordion title="View PlanetScale Metal cluster pricing">
  | Name                              | Configuration    | Monthly Cost | CPU       | Memory | Storage    |
  | :-------------------------------- | :--------------- | :----------- | :-------- | :----- | :--------- |
  | M1-10-AWS-ARM-D-METAL-10          | Highly Available | \$50         | 1/8 vCPU  | 1 GB   | 10 GB      |
  | M1-10-AWS-AMD-D-METAL-10          | Highly Available | \$60         | 1/8 vCPU  | 1 GB   | 10 GB      |
  | M1-10-AWS-ARM-D-METAL-25          | Highly Available | \$60         | 1/8 vCPU  | 1 GB   | 25 GB      |
  | M1-10-AWS-AMD-D-METAL-25          | Highly Available | \$70         | 1/8 vCPU  | 1 GB   | 25 GB      |
  | M1-10-AWS-ARM-D-METAL-50          | Highly Available | \$80         | 1/8 vCPU  | 1 GB   | 50 GB      |
  | M1-10-AWS-AMD-D-METAL-50          | Highly Available | \$90         | 1/8 vCPU  | 1 GB   | 50 GB      |
  | M1-10-AWS-ARM-D-METAL-100         | Highly Available | \$110        | 1/8 vCPU  | 1 GB   | 100 GB     |
  | M1-10-AWS-AMD-D-METAL-100         | Highly Available | \$120        | 1/8 vCPU  | 1 GB   | 100 GB     |
  | M1-10-AWS-ARM-D-METAL-200         | Highly Available | \$180        | 1/8 vCPU  | 1 GB   | 200 GB     |
  | M1-10-AWS-AMD-D-METAL-200         | Highly Available | \$200        | 1/8 vCPU  | 1 GB   | 200 GB     |
  | M1-20-AWS-ARM-D-METAL-10          | Highly Available | \$80         | 1/4 vCPU  | 2 GB   | 10 GB      |
  | M1-20-AWS-AMD-D-METAL-10          | Highly Available | \$90         | 1/4 vCPU  | 2 GB   | 10 GB      |
  | M1-20-AWS-ARM-D-METAL-25          | Highly Available | \$90         | 1/4 vCPU  | 2 GB   | 25 GB      |
  | M1-20-AWS-AMD-D-METAL-25          | Highly Available | \$100        | 1/4 vCPU  | 2 GB   | 25 GB      |
  | M1-20-AWS-ARM-D-METAL-50          | Highly Available | \$110        | 1/4 vCPU  | 2 GB   | 50 GB      |
  | M1-20-AWS-AMD-D-METAL-50          | Highly Available | \$120        | 1/4 vCPU  | 2 GB   | 50 GB      |
  | M1-20-AWS-ARM-D-METAL-100         | Highly Available | \$140        | 1/4 vCPU  | 2 GB   | 100 GB     |
  | M1-20-AWS-AMD-D-METAL-100         | Highly Available | \$150        | 1/4 vCPU  | 2 GB   | 100 GB     |
  | M1-20-AWS-ARM-D-METAL-200         | Highly Available | \$210        | 1/4 vCPU  | 2 GB   | 200 GB     |
  | M1-20-AWS-AMD-D-METAL-200         | Highly Available | \$230        | 1/4 vCPU  | 2 GB   | 200 GB     |
  | M1-40-AWS-ARM-D-METAL-10          | Highly Available | \$150        | 1/2 vCPU  | 4 GB   | 10 GB      |
  | M1-40-AWS-AMD-D-METAL-10          | Highly Available | \$160        | 1/2 vCPU  | 4 GB   | 10 GB      |
  | M1-40-AWS-ARM-D-METAL-25          | Highly Available | \$160        | 1/2 vCPU  | 4 GB   | 25 GB      |
  | M1-40-AWS-AMD-D-METAL-25          | Highly Available | \$170        | 1/2 vCPU  | 4 GB   | 25 GB      |
  | M1-40-AWS-ARM-D-METAL-50          | Highly Available | \$180        | 1/2 vCPU  | 4 GB   | 50 GB      |
  | M1-40-AWS-AMD-D-METAL-50          | Highly Available | \$190        | 1/2 vCPU  | 4 GB   | 50 GB      |
  | M1-40-AWS-ARM-D-METAL-100         | Highly Available | \$200        | 1/2 vCPU  | 4 GB   | 100 GB     |
  | M1-40-AWS-AMD-D-METAL-100         | Highly Available | \$210        | 1/2 vCPU  | 4 GB   | 100 GB     |
  | M1-40-AWS-ARM-D-METAL-200         | Highly Available | \$270        | 1/2 vCPU  | 4 GB   | 200 GB     |
  | M1-40-AWS-AMD-D-METAL-200         | Highly Available | \$290        | 1/2 vCPU  | 4 GB   | 200 GB     |
  | M1-40-AWS-ARM-D-METAL-400         | Highly Available | \$330        | 1/2 vCPU  | 4 GB   | 400 GB     |
  | M1-40-AWS-AMD-D-METAL-400         | Highly Available | \$340        | 1/2 vCPU  | 4 GB   | 400 GB     |
  | M1-40-AWS-ARM-D-METAL-800         | Highly Available | \$480        | 1/2 vCPU  | 4 GB   | 800 GB     |
  | M1-40-AWS-AMD-D-METAL-800         | Highly Available | \$490        | 1/2 vCPU  | 4 GB   | 800 GB     |
  | M1-40-AWS-ARM-D-METAL-1200        | Highly Available | \$610        | 1/2 vCPU  | 4 GB   | 1,228 GB   |
  | M1-40-AWS-AMD-D-METAL-1200        | Highly Available | \$620        | 1/2 vCPU  | 4 GB   | 1,228 GB   |
  | M1-80-AWS-ARM-D-METAL-100         | Highly Available | \$320        | 1 vCPU    | 8 GB   | 100 GB     |
  | M1-80-AWS-AMD-D-METAL-100         | Highly Available | \$340        | 1 vCPU    | 8 GB   | 100 GB     |
  | M1-80-AWS-ARM-D-METAL-200         | Highly Available | \$390        | 1 vCPU    | 8 GB   | 200 GB     |
  | M1-80-AWS-AMD-D-METAL-200         | Highly Available | \$410        | 1 vCPU    | 8 GB   | 200 GB     |
  | M1-80-AWS-ARM-D-METAL-400         | Highly Available | \$460        | 1 vCPU    | 8 GB   | 400 GB     |
  | M1-80-AWS-AMD-D-METAL-400         | Highly Available | \$480        | 1 vCPU    | 8 GB   | 400 GB     |
  | M1-80-AWS-ARM-D-METAL-800         | Highly Available | \$600        | 1 vCPU    | 8 GB   | 800 GB     |
  | M1-80-AWS-AMD-D-METAL-800         | Highly Available | \$610        | 1 vCPU    | 8 GB   | 800 GB     |
  | M1-80-AWS-ARM-D-METAL-1200        | Highly Available | \$740        | 1 vCPU    | 8 GB   | 1,228 GB   |
  | M1-80-AWS-AMD-D-METAL-1200        | Highly Available | \$750        | 1 vCPU    | 8 GB   | 1,228 GB   |
  | M1-160-AWS-ARM-D-METAL-100        | Highly Available | \$570        | 2 vCPUs   | 16 GB  | 100 GB     |
  | M1-160-AWS-AMD-D-METAL-100        | Highly Available | \$580        | 2 vCPUs   | 16 GB  | 100 GB     |
  | M1-160-AWS-ARM-D-METAL-200        | Highly Available | \$630        | 2 vCPUs   | 16 GB  | 200 GB     |
  | M1-160-AWS-AMD-D-METAL-200        | Highly Available | \$650        | 2 vCPUs   | 16 GB  | 200 GB     |
  | M1-160-AWS-ARM-D-METAL-400        | Highly Available | \$680        | 2 vCPUs   | 16 GB  | 400 GB     |
  | M1-160-AWS-AMD-D-METAL-400        | Highly Available | \$720        | 2 vCPUs   | 16 GB  | 400 GB     |
  | M1-160-AWS-ARM-D-METAL-800        | Highly Available | \$800        | 2 vCPUs   | 16 GB  | 800 GB     |
  | M1-160-AWS-AMD-D-METAL-800        | Highly Available | \$830        | 2 vCPUs   | 16 GB  | 800 GB     |
  | M1-160-AWS-ARM-D-METAL-1200       | Highly Available | \$980        | 2 vCPUs   | 16 GB  | 1,228 GB   |
  | M1-160-AWS-AMD-D-METAL-1200       | Highly Available | \$1,000      | 2 vCPUs   | 16 GB  | 1,228 GB   |
  | M8-160-AWS-ARM-D-METAL-118        | Highly Available | \$589        | 2 vCPUs   | 16 GB  | 118 GB     |
  | M6-160-AWS-INTEL-D-METAL-118      | Highly Available | \$609        | 2 vCPUs   | 16 GB  | 118 GB     |
  | M7-160-AWS-INTEL-D-METAL-468      | Highly Available | \$729        | 2 vCPUs   | 16 GB  | 468 GB     |
  | M7-160-AWS-INTEL-D-METAL-1250     | Highly Available | \$1,009      | 2 vCPUs   | 16 GB  | 1,280 GB   |
  | M8-320-AWS-ARM-D-METAL-237        | Highly Available | \$1,149      | 4 vCPUs   | 32 GB  | 237 GB     |
  | M6-320-AWS-INTEL-D-METAL-237      | Highly Available | \$1,179      | 4 vCPUs   | 32 GB  | 237 GB     |
  | M7-320-AWS-INTEL-D-METAL-937      | Highly Available | \$1,429      | 4 vCPUs   | 32 GB  | 937 GB     |
  | M7-320-AWS-INTEL-D-METAL-2500     | Highly Available | \$1,999      | 4 vCPUs   | 32 GB  | 2,560 GB   |
  | M8-640-AWS-ARM-D-METAL-474        | Highly Available | \$2,269      | 8 vCPUs   | 64 GB  | 474 GB     |
  | M6-640-AWS-INTEL-D-METAL-474      | Highly Available | \$2,329      | 8 vCPUs   | 64 GB  | 474 GB     |
  | M7-640-AWS-INTEL-D-METAL-1875     | Highly Available | \$2,839      | 8 vCPUs   | 64 GB  | 1,875 GB   |
  | M7-640-AWS-INTEL-D-METAL-5000     | Highly Available | \$3,959      | 8 vCPUs   | 64 GB  | 5,120 GB   |
  | M7-960-AWS-INTEL-D-METAL-7500     | Highly Available | \$5,929      | 12 vCPUs  | 96 GB  | 7,680 GB   |
  | M8-1280-AWS-ARM-D-METAL-950       | Highly Available | \$4,499      | 16 vCPUs  | 128 GB | 950 GB     |
  | M6-1280-AWS-INTEL-D-METAL-950     | Highly Available | \$4,629      | 16 vCPUs  | 128 GB | 950 GB     |
  | M7-1280-AWS-INTEL-D-METAL-3750    | Highly Available | \$5,639      | 16 vCPUs  | 128 GB | 3,840 GB   |
  | M7-1920-AWS-INTEL-D-METAL-15000   | Highly Available | \$11,829     | 24 vCPUs  | 192 GB | 15,360 GB  |
  | M8-2560-AWS-ARM-D-METAL-1900      | Highly Available | \$8,979      | 32 vCPUs  | 256 GB | 1,945 GB   |
  | M6-2560-AWS-INTEL-D-METAL-1900    | Highly Available | \$9,229      | 32 vCPUs  | 256 GB | 1,945 GB   |
  | M7-2560-AWS-INTEL-D-METAL-7500    | Highly Available | \$11,249     | 32 vCPUs  | 256 GB | 7,680 GB   |
  | M8-3840-AWS-ARM-D-METAL-2850      | Highly Available | \$13,449     | 48 vCPUs  | 384 GB | 2,918 GB   |
  | M6-3840-AWS-INTEL-D-METAL-2850    | Highly Available | \$13,829     | 48 vCPUs  | 384 GB | 2,918 GB   |
  | M7-3840-AWS-INTEL-D-METAL-11250   | Highly Available | \$16,859     | 48 vCPUs  | 384 GB | 11,520 GB  |
  | M7-3840-AWS-INTEL-D-METAL-30000   | Highly Available | \$23,629     | 48 vCPUs  | 384 GB | 30,720 GB  |
  | M8-5120-AWS-ARM-D-METAL-3800      | Highly Available | \$17,919     | 64 vCPUs  | 512 GB | 3,891 GB   |
  | M6-5120-AWS-INTEL-D-METAL-3800    | Highly Available | \$18,439     | 64 vCPUs  | 512 GB | 3,891 GB   |
  | M7-5120-AWS-INTEL-D-METAL-15000   | Highly Available | \$22,469     | 64 vCPUs  | 512 GB | 15,360 GB  |
  | M7-5760-AWS-INTEL-D-METAL-45000   | Highly Available | \$35,429     | 72 vCPUs  | 576 GB | 46,080 GB  |
  | M8-7680-AWS-ARM-D-METAL-5700      | Highly Available | \$26,869     | 96 vCPUs  | 768 GB | 5,836 GB   |
  | M6-7680-AWS-INTEL-D-METAL-5700    | Highly Available | \$27,639     | 96 vCPUs  | 768 GB | 5,836 GB   |
  | M7-7680-AWS-INTEL-D-METAL-22500   | Highly Available | \$33,689     | 96 vCPUs  | 768 GB | 23,040 GB  |
  | M7-7680-AWS-INTEL-D-METAL-60000   | Highly Available | \$47,229     | 96 vCPUs  | 768 GB | 61,440 GB  |
  | M6-10240-AWS-INTEL-D-METAL-7600   | Highly Available | \$33,509     | 128 vCPUs | 1 TB   | 7,782 GB   |
  | M8-15360-AWS-ARM-D-METAL-11400    | Highly Available | \$48,849     | 192 vCPUs | 1 TB   | 11,673 GB  |
  | M7-15360-AWS-INTEL-D-METAL-45000  | Highly Available | \$67,349     | 192 vCPUs | 1 TB   | 46,080 GB  |
  | M7-15360-AWS-INTEL-D-METAL-120000 | Highly Available | \$94,429     | 192 vCPUs | 1 TB   | 122,880 GB |
</Accordion>

## Storage pricing

Network-attached storage pricing varies by region and includes three billable components:

* **Storage**: The cost per GB of data stored per month (can [auto-scale](/docs/postgres/cluster-configuration/cluster-storage#enable-autoscaling) with usage if enabled)
* **Additional IOPS**: Cost when you manually configure more input/output operations per second beyond the included baseline of 3,000 IOPS
* **Additional Throughput**: Cost when you manually configure more data transfer throughput (MiB/s) beyond the included baseline of 125 MiB/s

<Note>
  **Most applications only pay for base storage.** IOPS and throughput charges only apply if you manually increase these settings beyond the included baseline (3,000 IOPS and 125 MiB/s throughput for AWS gp3 storage) in your cluster configuration.
</Note>

The table below shows the pricing for all three components across different AWS regions. Your total storage cost will depend on your configuration of each component.

### AWS storage pricing

| Cloud Provider | Region                     | Storage (per GB/month) | Additional IOPS (per IOPS/month) | Additional Throughput (per MiB/s/month) |
| :------------- | :------------------------- | :--------------------- | :------------------------------- | :-------------------------------------- |
| AWS            | ap-northeast-1 (Tokyo)     | \$0.150                | \$0.011                          | \$0.088                                 |
| AWS            | ap-south-1 (Mumbai)        | \$0.143                | \$0.103                          | \$0.084                                 |
| AWS            | ap-southeast-1 (Singapore) | \$0.150                | \$0.011                          | \$0.088                                 |
| AWS            | ap-southeast-2 (Sydney)    | \$0.150                | \$0.011                          | \$0.088                                 |
| AWS            | ca-central-1 (Montreal)    | \$0.138                | \$0.010                          | \$0.081                                 |
| AWS            | eu-central-1 (Frankfurt)   | \$0.149                | \$0.011                          | \$0.088                                 |
| AWS            | eu-west-1 (Dublin)         | \$0.138                | \$0.010                          | \$0.081                                 |
| AWS            | eu-west-2 (London)         | \$0.145                | \$0.011                          | \$0.084                                 |
| AWS            | sa-east-1 (Sao Paulo)      | \$0.238                | \$0.018                          | \$0.139                                 |
| AWS            | us-east-1 (N. Virginia)    | \$0.125                | \$0.009                          | \$0.073                                 |
| AWS            | us-east-2 (Ohio)           | \$0.125                | \$0.009                          | \$0.073                                 |
| AWS            | us-west-2 (Oregon)         | \$0.125                | \$0.009                          | \$0.073                                 |

### GCP storage pricing

The table below shows the storage pricing for Google Cloud Platform regions. GCP storage pricing includes only base storage costs, with IOPS and throughput that scale with disk size.

| Cloud Provider | Region                                     | Storage (per GB/month) |
| :------------- | :----------------------------------------- | :--------------------- |
| GCP            | asia-northeast3 (Seoul, South Korea)       | \$0.312                |
| GCP            | europe-west1 (St Ghislain, Belgium)        | \$0.24                 |
| GCP            | europe-west4 (Eemshaven, Netherlands)      | \$0.264                |
| GCP            | northamerica-northeast1 (Montréal, Québec) | \$0.264                |
| GCP            | us-central1 (Council Bluffs, Iowa)         | \$0.24                 |
| GCP            | us-east1 (Moncks Corner, South Carolina)   | \$0.24                 |
| GCP            | us-east4 (Ashburn, Virginia)               | \$0.264                |

## Egress pricing

### AWS egress pricing

The table below shows the egress pricing (per GB beyond included amounts) for AWS regions.

| Cloud Provider | Region                     | Egress (per GB) |
| -------------- | -------------------------- | --------------- |
| AWS            | ap-northeast-1 (Tokyo)     | \$0.101         |
| AWS            | ap-south-1 (Mumbai)        | \$0.096         |
| AWS            | ap-southeast-1 (Singapore) | \$0.096         |
| AWS            | ap-southeast-2 (Sydney)    | \$0.111         |
| AWS            | ca-central-1 (Montreal)    | \$0.060         |
| AWS            | eu-central-1 (Frankfurt)   | \$0.060         |
| AWS            | eu-west-1 (Dublin)         | \$0.060         |
| AWS            | eu-west-2 (London)         | \$0.060         |
| AWS            | sa-east-1 (Sao Paulo)      | \$0.137         |
| AWS            | us-east-1 (N. Virginia)    | \$0.060         |
| AWS            | us-east-2 (Ohio)           | \$0.060         |
| AWS            | us-west-2 (Oregon)         | \$0.060         |

### GCP egress pricing

The table below shows the egress pricing (per GB beyond included amounts) for Google Cloud Platform regions.

| Cloud Provider | Region                                     | Egress (per GB) |
| -------------- | ------------------------------------------ | --------------- |
| GCP            | asia-northeast3 (Seoul, South Korea)       | \$0.117         |
| GCP            | europe-west1 (St Ghislain, Belgium)        | \$0.060         |
| GCP            | europe-west4 (Eemshaven, Netherlands)      | \$0.060         |
| GCP            | northamerica-northeast1 (Montréal, Québec) | \$0.060         |
| GCP            | us-central1 (Council Bluffs, Iowa)         | \$0.060         |
| GCP            | us-east1 (Moncks Corner, South Carolina)   | \$0.060         |
| GCP            | us-east4 (Ashburn, Virginia)               | \$0.060         |

## PgBouncer pricing

Dedicated PgBouncer instances are billed monthly based on their size and region. The local PgBouncer (included on the primary database instance) is free. Learn more about PgBouncer configuration in the [PgBouncer documentation](/docs/postgres/connecting/pgbouncer).

PgBouncer instances are available in six sizes:

| Size    | CPU       | Memory |
| ------- | --------- | ------ |
| PGB-5   | 1/16 vCPU | 128 MB |
| PGB-10  | 1/8 vCPU  | 256 MB |
| PGB-20  | 1/4 vCPU  | 512 MB |
| PGB-40  | 1/2 vCPU  | 1 GB   |
| PGB-80  | 1 vCPU    | 2 GB   |
| PGB-160 | 2 vCPU    | 4 GB   |

### AWS PgBouncer pricing

The table below shows the monthly pricing for dedicated PgBouncer instances across AWS regions.

| Region                     | PGB-5 | PGB-10 | PGB-20 | PGB-40 | PGB-80 | PGB-160 |
| -------------------------- | ----- | ------ | ------ | ------ | ------ | ------- |
| ap-northeast-1 (Tokyo)     | \$21  | \$41   | \$82   | \$164  | \$327  | \$653   |
| ap-south-1 (Mumbai)        | \$12  | \$24   | \$47   | \$93   | \$186  | \$371   |
| ap-southeast-1 (Singapore) | \$21  | \$41   | \$82   | \$164  | \$327  | \$653   |
| ap-southeast-2 (Sydney)    | \$21  | \$41   | \$82   | \$163  | \$325  | \$649   |
| ca-central-1 (Montreal)    | \$19  | \$38   | \$75   | \$150  | \$299  | \$598   |
| eu-central-1 (Frankfurt)   | \$21  | \$41   | \$82   | \$164  | \$327  | \$653   |
| eu-west-1 (Dublin)         | \$20  | \$39   | \$77   | \$153  | \$305  | \$610   |
| eu-west-2 (London)         | \$22  | \$44   | \$88   | \$176  | \$351  | \$701   |
| sa-east-1 (Sao Paulo)      | \$30  | \$59   | \$117  | \$234  | \$467  | \$933   |
| us-east-1 (N. Virginia)    | \$18  | \$35   | \$69   | \$138  | \$276  | \$551   |
| us-east-2 (Ohio)           | \$18  | \$35   | \$69   | \$138  | \$276  | \$551   |
| us-west-2 (Oregon)         | \$18  | \$35   | \$69   | \$138  | \$276  | \$551   |

### GCP PgBouncer pricing

The table below shows the monthly pricing for dedicated PgBouncer instances across Google Cloud Platform regions.

| Region                                     | PGB-5 | PGB-10 | PGB-20 | PGB-40 | PGB-80 | PGB-160 |
| ------------------------------------------ | ----- | ------ | ------ | ------ | ------ | ------- |
| asia-northeast3 (Seoul, South Korea)       | \$22  | \$44   | \$87   | \$174  | \$348  | \$695   |
| europe-west1 (Belgium)                     | \$19  | \$38   | \$76   | \$151  | \$302  | \$603   |
| europe-west4 (Eemshaven, Netherlands)      | \$19  | \$38   | \$76   | \$151  | \$302  | \$604   |
| northamerica-northeast1 (Montréal, Québec) | \$19  | \$38   | \$76   | \$151  | \$302  | \$604   |
| us-central1 (Council Bluffs, Iowa)         | \$18  | \$35   | \$70   | \$139  | \$277  | \$554   |
| us-east1 (Moncks Corner, South Carolina)   | \$18  | \$35   | \$70   | \$139  | \$277  | \$554   |
| us-east4 (Ashburn, Virginia)               | \$20  | \$39   | \$78   | \$155  | \$309  | \$617   |

## Need help?

Get help from [the PlanetScale Support team](https://planetscale.com/contact?initial=support), or join our [Discord community](https://pscale.link/community) to see how others are using PlanetScale.

