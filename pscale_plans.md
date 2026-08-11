> ## Documentation Index
> Fetch the complete documentation index at: https://planetscale.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# PlanetScale plans

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

<PlatformAvailability current="both" />

## Overview

PlanetScale is built to accommodate all companies at all stages. Whether you need a hassle-free managed database for your side project or you’re running millions of queries per second at the scale of YouTube, we have a solution for you.

Our plans are split into two general offerings: [Base (self-serve)](#base-plan) and [Enterprise](#enterprise-plan).

<Columns cols={2}>
  <Card title="Base" icon="database" href="#base-plan">
    Self-serve plan with fully-managed Vitess (MySQL-compatible) and Postgres databases. Features include sharding, branching, query insights, and more. Available with network-attached storage or Metal options.

    <a href="#base-plan">Learn more</a>
  </Card>

  <Card title="Enterprise" icon="rocket" href="#enterprise-plan">
    Enhanced support, customizations, and deployment options. Available for both Vitess and Postgres with features like dedicated accounts, PCI compliance, and expert assistance.

    <a href="#enterprise-plan">Learn more</a>
  </Card>
</Columns>

## Base Plan

Our Base plan is completely self-serviceable. [Sign up for a PlanetScale account to get started](https://auth.planetscale.com/sign-up).

PlanetScale offers two database engines: **Vitess** (MySQL-compatible) and **Postgres**. Both are available with two storage options: **network-attached storage** and **Metal**.

* [**Network-attached storage**](/docs/plans/planetscale-skus#network-attached-storage) (Amazon Elastic Block Storage or Google Persistent Disk) databases come with autoscaling storage and have varying levels of compute power.
* [**Metal databases**](/docs/plans/planetscale-skus#metal) are backed by locally-attached NVMe drives for storage, unlocking incredible performance and cost-efficiencies. Because the drives are locally-attached, you need to choose both your compute and storage resources when you create your database.

<Note>
  Cluster size options are capped to `PS-160` and `M-320` SKUs until you have a successfully paid an invoice of at least \$100.

  If you need larger sizes immediately, please [contact us](https://planetscale.com/contact) to unlock all sizes.
</Note>

On top of processing and memory, all **Base** cluster sizes share the following:

|                                                              | **Vitess**                                                                                          | **Postgres**                                                                                                                                    |
| :----------------------------------------------------------- | :-------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Storage/month (network-attached storage)**                 | 10 GB included; \$0.50 per instance per additional 1 GB\*                                           | 10 GB included; \$0.50 per instance per additional 1 GB\*                                                                                       |
| **Storage/month (Metal)**                                    | Depends on selected NVMe drive size                                                                 | Depends on selected NVMe drive size                                                                                                             |
| **Available cluster sizes**                                  | 22                                                                                                  | 22                                                                                                                                              |
| **Availability zones**                                       | 3                                                                                                   | 3                                                                                                                                               |
| **Production branches**                                      | 1 included\*\*                                                                                      | 1 included                                                                                                                                      |
| **Development branches**                                     | \~1,440 hours included (2× hours of current month)                                                  | Billed as a new cluster                                                                                                                         |
| **Concurrent Connections**                                   | *Unmetered*                                                                                         | *Unmetered*                                                                                                                                     |
| **Single node**                                              | Not available                                                                                       | Available starting at \$5/mo                                                                                                                    |
| **Query Insights retention**                                 | 7 days                                                                                              | 7 days                                                                                                                                          |
| **Horizontal sharding**                                      | Included                                                                                            | [Coming soon](https://planetscale.com/blog/announcing-neki)                                                                                     |
| **Vertical sharding**                                        | Included                                                                                            | Included                                                                                                                                        |
| [**Deployment options**](/docs/plans/deployment-options)          | Multi-tenant                                                                                        | Multi-tenant                                                                                                                                    |
| **Read-only regions**                                        | Available as an add-on                                                                              | Coming soon                                                                                                                                     |
| **Web console**                                              | Included                                                                                            | Included                                                                                                                                        |
| **PlanetScale CLI**                                          | Included                                                                                            | Included                                                                                                                                        |
| **Connection pooling**                                       | [VTGates](/docs/vitess/scaling/vtgates) based on cluster size                                            | [PgBouncer](/docs/postgres/connecting/pgbouncer)                                                                                                     |
| [**Database Traffic Control®**](/docs/postgres/traffic-control)   | Not available                                                                                       | Included                                                                                                                                        |
| **SSO**                                                      | Available as an add-on\*\*\*                                                                        | Available as an add-on\*\*\*                                                                                                                    |
| **Audit log retention**                                      | 6 months                                                                                            | 6 months                                                                                                                                        |
| **Private connections**                                      | [AWS](/docs/vitess/connecting/private-connections) and [GCP](/docs/vitess/connecting/private-connections-gcp) | [AWS](/docs/postgres/connecting/private-connections/aws-privatelink) and [GCP](/docs/postgres/connecting/private-connections/gcp-private-service-connect) |
| **BAAs**                                                     | Included                                                                                            | Included                                                                                                                                        |
| **Automatic backups**                                        | Every 12 hours                                                                                      | Every 12 hours                                                                                                                                  |
| **Support**                                                  | Standard, upgrade available\*\*\*                                                                   | Standard, upgrade available\*\*\*                                                                                                               |
| [**Data Branching®**](/docs/vitess/schema-changes/data-branching) | Included                                                                                            | Not available                                                                                                                                   |

\* For HA network-attached storage databases, production branch storage is billed at \$1.50/GB (1 primary + 2 replicas) and development branch storage is billed at \$0.50/GB (1 primary).

\*\* Additional production branches are billed at the cost of your selected cluster size per month.

\*\*\* [SSO](/docs/security/sso) and [Business support](/docs/support#business) options are available on the Base plan for an additional fee.

### Additional production branches

Each HA production branch in the Base plan provisions a separate, production database cluster in our infrastructure. Upon adding an additional production branch, you will be prompted to select the cluster size for the new branch.

Each cluster size is priced based on the selected region. You can find the full list of pricing in our [Vitess cluster pricing documentation](/docs/plans/cluster-sizing).

If you have a `main` network-attached storage production branch using the **PS-40** cluster size and two additional production branches using the **PS-20** cluster size, the total cost for the database would be **\$217.00** per month.

| **Production branch cluster** | **Cost per unit** | **Quantity** | **Total per month** |
| :---------------------------- | :---------------- | :----------- | :------------------ |
| PS-40                         | \$99.00           | 1            | \$99.00             |
| PS-20                         | \$59.00           | 2            | \$118.00            |
| **Grand total**               |                   |              | **\$217.00**        |

Also note that pricing is prorated.
If you create a new database in the middle of a billing cycle, you will only be charged for the appropriate fraction of the month.
This also applies to changes to an existing database, such as upsizing.
For example, if you have a database that started the month as a `PS-10` and at the halfway point in the month you upgrade to a `PS-20`, you would be charged \$39/2 + \$59/2 = \$49 (assuming no additional other charges for storage, etc). The billing for the new sizes begins as soon as you begin the cluster resize.

### Development branches

Billing for development branches differs depending on whether you're using PlanetScale Postgres or Vitess.

### Vitess development branches

Development branches, `PS-DEV` are billed for the time that they are running, prorated to the millisecond. Databases include `hours_in_current_month * 2` of development branch time per month (1,440 hours for a 30 day month) at no additional cost. Any time used over the included is billed at a rate of \~\$0.014 per hour (\$10 / hours\_in\_current\_month). You may see how many development branch hours have been used at any time by visiting your [organization billing page](https://app.planetscale.com/~/settings/billing/). Data is updated hourly.

### Postgres development branches

Postgres development branches, `PS-DEV`, are billed for the time that they are running, prorated to the millisecond. Each development branch is \$5 per month. Development branches are not intended for HA production traffic, as they do not come with any replicas or have maintenance windows.

<Note>
  You can set spend email alerts from your billing page. See the [Spend management documentation](/docs/billing#spend-management) for more information.
</Note>

If a database is created in the middle of a billing cycle, the included development branch hours are prorated. For example, if you create your database with 15 days remaining in the current month, the database will have `15 days * 2` (720 hours) included for that billing period.

### Fractional vCPU allocation

Some tiers of the Base plan indicate a fractional vCPU allocation. These branches run on our multi-tenant platform and this indicates the minimum number of cycles dedicated to your workload. The vast majority of the time, there are spare compute cycles available on the underlying machine instances hosting your branch, and those are available to be used by your workload as needed for no additional charge.

If you find the performance of a given query to be substantially inconsistent over the course of a given day, you may want to upgrade to a higher tier for more consistent performance.

## Enterprise plan

PlanetScale's Enterprise plan is great for large-scale businesses who require the enterprise-level SLAs, want expert assistance through enterprise support, and would prefer to run in your own AWS or GCP account.

We offer many different deployment options, all of which come with the same set of standard features.

* **PlanetScale Single-tenant** runs in PlanetScale's infrastructure with optional dedicated AWS/GCP accounts.
* [**PlanetScale Managed**](/docs/plans/managed) is a deployment option where your database runs entirely in your own AWS or GCP account, giving you complete control over your cloud infrastructure while still benefiting from PlanetScale's fully managed service.

The table below covers those shared features, as well as the different options that vary depending on your chosen deployment.

|                                                        | Single-tenant                           | **[PlanetScale Managed](/docs/plans/managed)**                                                                                                                                                                                         |
| :----------------------------------------------------- | :-------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customizable feature limits                            | <Icon icon="check" color="blue" />      | <Icon icon="check" color="blue" />                                                                                                                                                                                                |
| [Support](/docs/support)                                    | Business — Enterprise upgrade available | Enterprise                                                                                                                                                                                                                        |
| PCI compliant                                          | <Icon icon="xmark" color="red" />       | <Icon icon="check" />                                                                                                                                                                                                             |
| Dedicated AWS/GCP account                              | Optional                                | <Icon icon="check" color="blue" />                                                                                                                                                                                                |
| Bring your own cloud (an AWS or GCP account *you* own) | <Icon icon="xmark" color="red" />       | <Icon icon="check" color="blue" />                                                                                                                                                                                                |
| Billing                                                | Directly from PlanetScale               | Partial payment through PlanetScale and infrastructure costs through AWS/GCP. Take advantage of your own discounts. Optionally, purchase through [AWS Marketplace](https://aws.amazon.com/marketplace/pp/prodview-luy3krhkpjne4). |

## How do I know if I need an Enterprise plan?

If you’re not sure whether your use case requires an Enterprise plan, we’re more than happy to chat with you to figure it out together. You can [fill out this form](https://planetscale.com/contact), and we’ll be in touch.

In general, if you need any of the following, Enterprise may be the best solution for you:

* Enhanced support — our expert team becomes an extension of your own. Additional options for technical account management, Slack-based support, and phone escalation.
* You need additional support to horizontally shard and migrate your database(s) to PlanetScale
* You need your database deployed in a single-tenant environment
* You need to keep your data in **your own** AWS or GCP account
* You need a PCI DSS certified service provider
* Mission-critical [response times](/docs/support#initial-response-times) including continuous support coverage
* Any other customizations — Our Enterprise plans offer a lot of flexibility, so if you have a requirement that’s not listed here, it’s best to [reach out](https://planetscale.com/contact) and we can see how we can help

## Plan add-ons

### Single Sign-on (SSO)

Add [Single Sign-on (SSO)](/docs/security/sso) for your organization to the Base plan for an additional fee of \$199/month.

### Business support

Add [Business support](/docs/support#business) to the Base plan for an additional fee. See the Support page for more details.

### User-scheduled backups

On the Base plan, we run automated backups every 12 hours. Disk space for default backups is not counted against your plan's storage limit.

You can also [schedule additional backups yourself](/docs/vitess/backups#create-manual-backups) as needed. For these additional user-scheduled backups, storage is billed at **\$0.023 per GB** per month. Backups include system tables as well as your data and start at around 140MB.

## Free plan

PlanetScale does not offer a free plan, previously known as the "Developer" or "Hobby" plan. All databases require a paid subscription starting with our Base plan, which provides self-service access to fully-managed database clusters. Single-node Postgres databases are available starting at \$5 per month.

## Scaler Pro plan

The Scaler Pro plan has been renamed to the Base plan.

## Need help?

Get help from [the PlanetScale Support team](https://planetscale.com/contact?initial=support), or join our [Discord community](https://pscale.link/community) to see how others are using PlanetScale.

