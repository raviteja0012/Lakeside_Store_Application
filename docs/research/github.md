# GitHub: feature surface

Researched 2026-08-12 against the vendor's live documentation, not from memory. 69 capabilities.

**This is a reference catalog, not a plan.** What we adopt and what we decline, with reasons,
lives in [CAPABILITIES.md](../CAPABILITIES.md). The services actually wired up today live in
[PLATFORM.md](../PLATFORM.md). Re-check anything here before acting on it: vendor pricing and
feature names move, and this is a dated snapshot.

Scope note from the researcher:

> GitHub (github.com cloud), researched against docs.github.com and github.blog in August 2026


## AI

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Agent HQ / mission control** | A single control plane on github.com, VS Code, Visual Studio, JetBrains, mobile, and Copilot CLI to assign, steer, and track multiple coding agents, including third-party agents from Anthropic, OpenAI, Google, Cognition, and xAI. Adds branch controls for agent-authored code, agent identity/access management, and one-click merge conflict resolution. | Bundled into paid GitHub Copilot subscriptions; third-party agents roll out progressively by plan (Pro+ got OpenAI Codex in VS Code Insiders first). Exact per-plan agent availability changes month to month, so verify against docs at purchase time. | Rolling out; third-party agents phased in |
| **Copilot CLI** | Runs Copilot in the terminal with autonomous execution (autopilot), parallel work via /fleet, research, session history, and custom tools/agents. Part of the same Agent HQ surface as github.com and the IDEs. | Requires a Copilot plan and bills AI credits like other agentic surfaces; the docs page I read did not enumerate which plans include it, so confirm before assuming Free-tier access. | Verify status; docs page did not state GA vs preview |
| **Copilot Spaces** | Curated bundles of files, repos, PRs, and issues that ground Copilot's answers in your project's real context, shareable across an org as a living knowledge hub. Attached repos and files stay in sync as they change. | Available on github.com to all Copilot users; billed on the same model as Copilot Chat (AI credits). | GA (Sept 2025; API GA May 2026) |
| **Copilot cloud agent (coding agent)** | Assign it an issue or task and it works asynchronously in a GitHub Actions-backed environment to open a PR: research, plan, implement, fix tests, resolve merge conflicts. Hard 59-minute session cap that cannot be extended. | Available on all paid Copilot plans. Billed against your included Actions minutes and AI credits; within those allowances there is no additional charge. | GA |
| **Copilot code review** | Assigns Copilot as a PR reviewer to flag issues with one-click suggested fixes, either on demand or automatically for every PR via repo/org policy or rulesets. Skips dependency files, logs, and SVGs. | Included with paid Copilot plans (Pro, Pro+, Max, Business, Enterprise); not in Copilot Free. Consumes AI credits (token-metered) plus Actions minutes for agentic context gathering. Automatic reviews bill the PR author; manual reviews bill the requester. | GA |
| **GitHub Copilot (plans and AI credits)** | AI code completion, chat, agent mode, and agents across IDEs, github.com, CLI, and mobile. As of June 1, 2026 billing moved from premium requests to token-metered GitHub AI Credits (1 credit = $0.01 USD); code completions and next edit suggestions stay unlimited and unbilled on paid plans. | Free ($0, 2,000 completions/month, auto model selection, no code review), Pro $10/mo (1,500 credits), Pro+ $39/mo (7,000 credits), Max $100/mo (20,000 credits), Business $19/user/mo (1,900 credits/user), Enterprise $39/user/mo (3,900 credits/user, Enterprise Cloud only). Overage $0.01/credit against a budget; org credits pool at the enterprise level. Promotional higher allowances for existing Business (3,000) and Enterprise (7,000) customers ran June-Aug/Sept 2026. | GA |
| **GitHub Models** | Formerly a model catalog, prompt playground, prompt/eval files, and free inference API for third-party models inside GitHub. It is gone. | Fully retired as of July 30, 2026: playground, model catalog, inference API, and bring-your-own-key are no longer available to any customer. GitHub points new work to Azure AI Foundry or to Copilot. Do not build on this. | RETIRED |

## AI / automation

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **GitHub MCP Server** | A GitHub-hosted remote MCP endpoint at https://api.githubcopilot.com/mcp/ (OAuth, no PAT or Docker needed) exposing toolsets for repo intelligence, issue/PR automation, CI/CD run and log inspection, and security alerts. Supports a read-only endpoint and per-toolset selection via the X-MCP-Toolsets header. | No separate charge for the server itself; you need a GitHub account and appropriate repo permissions. A local/Docker variant also exists. Token consumption is billed by whichever agent/model calls it. | GA |

## AI / compute

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **GitHub Sandbox (cloud and local sandboxes for Copilot)** | Isolated execution environments for Copilot agents; local sandboxing is included in the Copilot seat, cloud sandboxing runs metered compute with snapshot storage. Compute and memory bill only while a session runs; storage bills for stopped-session snapshots until deleted. | Local sandboxing: included in the standard Copilot seat at no extra cost. Cloud sandboxing metered at $0.000024/compute-second, $0.000003/GiB-second memory, $0.005/GiB-month storage (roughly $0.13 for a 1-hour 4 GiB session before storage). Eligible accounts got a $10/month preview entitlement through end of July 2026; after that all usage bills. | Public preview |

## API

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **REST and GraphQL APIs with rate limits** | Full platform API surface. Primary rate limits vary by identity; secondary limits cap concurrency and content-generating calls. | Free. Unauthenticated 60 req/hour; authenticated PAT 5,000/hour; GitHub App installation 5,000/hour scaling to 12,500; Enterprise Cloud App or OAuth app 15,000/hour; GITHUB_TOKEN 1,000/hour per repo (15,000 against Enterprise Cloud). Secondary: 100 concurrent requests, 900 REST points/min, 2,000 GraphQL points/min, 90s CPU per 60s, 80 content-generating req/min and 500/hour. | GA |

## API / auth

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Classic personal access tokens** | Broad scope-based tokens that apply uniformly to every repo you can reach. Still required for a few things fine-grained tokens cannot do, including Packages and the Checks API. | Free, 5,000 REST req/hour. Organizations can restrict or block classic PAT access entirely via policy. | GA (legacy) |
| **Fine-grained personal access tokens** | User-scoped tokens with per-permission, per-repository, single-organization scope and mandatory expiry, subject to org owner approval. Cannot do several things classic PATs can. | Free. Known gaps: cannot contribute to public repos where you are not a member, cannot act as an outside collaborator, cannot span multiple orgs, cannot access Packages, cannot call the Checks API, cannot access user-owned Projects. Org owners can require approval and enforce max lifetime. 5,000 REST req/hour. | GA |
| **GitHub Apps** | First-class integration identity with fine-grained per-resource permissions, per-repository installation scope, short-lived installation access tokens, and webhook delivery. GitHub explicitly prefers Apps over OAuth apps. | Free to create and install on all plans. Rate limit: 5,000 REST req/hour baseline, scaling +50/hour per repo above 20 repos up to 12,500; 15,000 req/hour when installed on an Enterprise Cloud org. | GA |

## API / automation

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Webhooks** | Pushes event payloads to an external HTTPS endpoint for repository, organization, Marketplace, Sponsors, and GitHub App scopes. Preferred over polling for CI triggers, Slack notifications, and audit logging. | Free on all plans. The overview page I read did not state retry policy, payload size cap, or a maximum webhook count, so treat those as unverified. | GA |

## Actions

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Actions concurrency and usage limits** | Caps how much can run at once and how long. Job limit 6h on hosted runners, 5 days self-hosted; workflow run limit 35 days including waits and approvals. | Concurrent jobs by plan: Free 20, Pro 40, Team 60, Enterprise 500; macOS concurrency 5 (Free/Pro/Team) and 50 (Enterprise); larger runners 1,000 concurrent on Team and Enterprise. Also 50 re-runs per run, 500 KB max workflow file, 1,500 trigger events per 10s per repo. | GA |
| **Actions dependency caching** | actions/cache and the built-in caching in setup-node/python/java/go/dotnet store dependency trees keyed by lockfile hash. Restores are scoped to the current branch, the default branch, and a PR base branch only. | 10 GB per repository free on every plan; caches unused for 7 days are evicted, and oldest/least-used are dropped when full. Above 10 GB is billed via the Actions Cache Storage SKU (roughly $2.80/mo for 50 GB, $13.30/mo for 200 GB, $69.30/mo for 1,000 GB), raisable to 10 TB. Rate limits: 200 uploads, 1,500 downloads, 400 deletes per minute. | GA |
| **Concurrency groups** | Serializes workflow or job runs sharing a concurrency key, with cancel-in-progress to kill superseded runs. Newer queue: max mode queues up to 100 pending runs FIFO instead of cancelling. | Free with Actions. Limit of 100 queued workflow runs per concurrency group when using queue: max. | GA |
| **GitHub Actions (CI/CD engine)** | Runs workflows defined in .github/workflows YAML on GitHub-hosted or self-hosted runners, triggered by repo events, schedules, or manual dispatch. Billed by runner minutes and artifact/cache storage for private repos. | Unlimited and free on public repos with standard runners. Private repos get included minutes/month: Free 2,000, Pro 3,000, Team 3,000, Enterprise Cloud 50,000. Overage billed per-minute by runner type. | GA |
| **Matrix strategy** | Fans a single job definition out across combinations of variables with include/exclude, fail-fast, and max-parallel controls. Commonly used for multi-Node/multi-OS build verification. | Included with Actions at no extra cost beyond the minutes each matrix leg consumes. Hard limit: 256 jobs generated per workflow run. | GA |
| **Reusable workflows** | Workflows with on.workflow_call that other workflows invoke with inputs, secrets (or secrets: inherit), and outputs. Callable from the same repo or another repo by owner/repo/path@ref. | Free with Actions. Max nesting depth 10 (1 caller + 9 called); permissions can only be preserved or reduced down the chain, never elevated. Cross-repo reuse from private repos requires the calling repo to be granted access (Actions access settings). | GA |
| **Workflow artifacts and logs** | Uploads build outputs and logs from a run for download via UI, API, or gh run download. Retention is configurable at repo, org, and enterprise level. | 90-day default retention; configurable 1-90 days on public repos and 1-400 days on private repos. Storage counts against plan allowance (Free 500 MB, Pro/Team 2 GB, Enterprise 50 GB); overage $0.25 per GB-month. Free on public repos. | GA |
| **Workflow trigger events** | Covers push, pull_request, pull_request_target, workflow_dispatch, schedule (cron), repository_dispatch, workflow_call, workflow_run, merge_group, deployment, and release. Scheduled workflows run only on the default branch. | Free on all plans. Cron minimum interval is 5 minutes; scheduled workflows auto-disable after 60 days of repository inactivity. Fork PRs get no secrets and a read-only GITHUB_TOKEN. | GA |

## Actions / deployments

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Actions environments** | Named deployment targets (e.g. production, preview) that scope environment secrets and variables and gate jobs via environment:. Surfaces deployment history on the repo. | Free on public repos for all plans. For private/internal repos, environments, environment secrets, and deployment branch rules require GitHub Pro, Team, or Enterprise. | GA |
| **Custom deployment protection rules** | Lets a GitHub App act as an external gate (observability, change-management, ticket check) that must approve a deployment. Implemented via the deployment_protection_rule webhook. | Public repos on all plans. Private/internal repos require GitHub Enterprise. | GA |
| **Deployment protection rules (required reviewers, wait timer, branch/tag restrictions)** | Blocks a job targeting an environment until up to 6 named reviewers/teams approve, a wait timer elapses, or the ref matches an allowed branch/tag pattern. Only one approval is needed to release the job. | Free on public repos for all plans. GitHub docs state that on Free, Pro, and Team, wait timer and required reviewers are public-repo only, so protecting a PRIVATE repo deployment needs GitHub Enterprise. Verify against your own repo settings before relying on this for a private repo. | GA |

## Actions / runners

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Larger runners (4-64 core, GPU, static IP)** | Bigger GitHub-hosted VMs with runner groups, autoscaling, concurrency controls, GPU SKUs, and optional static IP allowlisting. Configured at org/enterprise level, not in the workflow file alone. | Requires GitHub Team or Enterprise Cloud. Examples per minute: Linux 4-core x64 $0.012, 8-core $0.022, 16-core $0.042, 64-core $0.162; arm64 cheaper (4-core $0.008); Windows 4-core $0.022; macOS 12-core $0.077; GPU Linux 4-core $0.052, GPU Windows 4-core $0.102. Static IPs require Enterprise Cloud (not on macOS). | GA |
| **Self-hosted runners** | Machines you own and register at repo, org, or enterprise level to execute Actions jobs. Job limit is 5 days execution and 24h queue time. | No GitHub charge for the runner minutes; you pay your own infrastructure. Registration limit 1,500 runners per 5 minutes, 10,000 runners per group. GitHub warns against using them on public repos due to fork-PR code execution. | GA |
| **Standard GitHub-hosted runners** | Ephemeral 2-core VMs (Ubuntu, Windows, macOS) that GitHub provisions and tears down per job. Linux arm64 is cheaper per minute than x64. | Free on public repos. Private repo per-minute rates: Linux 1-core x64 $0.002, Linux 2-core x64 $0.006, Linux 2-core arm64 $0.005, Windows 2-core $0.010, macOS 3/4-core $0.062. Minutes round up to whole minutes. | GA |

## Actions / security

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **GITHUB_TOKEN permissions model** | Per-workflow or per-job permissions: key that scopes the automatically minted token across 16 permission categories to read/write/none. Any explicit permission sets all unspecified ones to none. | Free on all plans. Rate limited to 1,000 REST requests/hour per repository (15,000/hour against Enterprise Cloud resources). | GA |
| **OIDC federation for Actions** | Issues a short-lived signed JWT per job that AWS, Azure, GCP, HashiCorp Vault, and others exchange for temporary cloud credentials, removing long-lived secrets from the repo. Dependabot also supports OIDC for registry auth (AWS CodeArtifact, Azure Artifacts, JFrog). | Free on all plans and repo visibilities; no separate charge. Immutable subject claims for OIDC tokens shipped April 2026. | GA |

## Administration

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Enterprise-only administration (SAML SSO, SCIM, EMU, audit log API, data residency, IP allow lists)** | Identity federation and provisioning, Enterprise Managed Users, streaming/queryable audit log API, regional data residency, and network restrictions. Also carries SOC 2 Type 2 and FedRAMP ATO evidence and premium support access. | GitHub Enterprise Cloud only, from about $21 USD per user per month (promotional first-12-months rate on the public pricing page; standard rate is higher). Not available on Free or Team. | GA |

## Community

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Discussions** | Threaded forum attached to a repository or organization with categories, Q&A answer marking, polls, labels, and issue conversion. Must be enabled by an admin. | Free. The docs page I read did not state a plan or visibility restriction, so treat private-repo availability as likely but unverified. | GA |

## Dev environments

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **GitHub Codespaces** | Cloud dev containers configured by devcontainer.json, from 2-core/8 GB/32 GB up to 32-core/128 GB/128 GB, reachable from the browser, VS Code, or gh codespace. Supports prebuilds, port forwarding, and Codespaces secrets. | Personal free monthly quota: Free plan 120 core-hours + 15 GB-month storage; Pro 180 core-hours + 20 GB-month. Compute $0.18/hour for 2-core scaling linearly ($0.36 4-core, $0.72 8-core, $1.44 16-core); storage $0.07/GB-month. Organizations and enterprises get NO free allowance and pay for all member usage. | GA |

## Merge controls

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Auto-merge for pull requests** | Marks a PR to merge itself once all required reviews and status checks pass, choosing merge/squash/rebase up front. The button only appears when the PR is currently blocked. | Free; must be enabled in repository settings, and the actor needs write permission. I found no plan restriction stated in docs. | GA |
| **Branch protection rules (classic)** | Per-branch-pattern gates: required approving reviews, dismiss stale approvals, require code owner review, required status checks, conversation resolution, signed commits, linear history, required deployments, lock branch, force-push and deletion controls, and admin-bypass suppression. Configured under Settings > Branches. | Branch protection is available on public repos for all plans. Push restrictions (restrict who can push) are available in public repos owned by a Free org and in all repos owned by a Team or Enterprise Cloud org, so private-repo enforcement effectively wants Pro/Team or higher. | GA (rulesets are the successor) |
| **CODEOWNERS** | Maps gitignore-style path patterns to owning users or teams, who are auto-requested as reviewers on matching PRs. Combined with the require-code-owner-review rule it becomes a hard gate; any one listed owner's approval satisfies it. | Public repos on GitHub Free; public and private repos on GitHub Pro, Team, Enterprise Cloud, and Enterprise Server. File must be under 3 MB, in .github/, repo root, or docs/; owners need explicit write access. | GA |
| **Merge queue** | Batches queued PRs onto temporary gh-readonly-queue/ branches, runs required checks against the target branch plus everything ahead in the queue, and merges FIFO so the branch never breaks. Triggered in workflows via the merge_group event. | Available in any PUBLIC repository owned by an organization, and in PRIVATE repositories only on GitHub Enterprise Cloud. Not available for private repos on GitHub Team or Free. | GA |
| **Repository rulesets** | The modern replacement for branch protection: named, layered, targetable rule bundles for branches and tags plus push rulesets that block by file path, path length, extension, or file size. Supports bypass lists for users, roles, teams, and Apps, evaluate mode, and inheritance across fork networks. | Public repos on GitHub Free and Free for orgs; public AND private repos on Pro, Team, and Enterprise Cloud. Organization-level rulesets became available to GitHub Team plans in June 2025 (previously Enterprise-only). Limit 75 rulesets per repository. | GA |

## Packages

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **GitHub Container registry (ghcr.io)** | Stores Docker/OCI images at org or user scope with permissions set independently of the source repo, and anonymous pulls for public images. Supports OCI annotations, 10 GB per layer, 10-minute upload timeout. | Public images free. GitHub docs state container registry storage is currently not charged ("remains complimentary"), separate from the Packages storage meter; this exemption is a GitHub decision that could change, so re-verify before depending on it. | GA |
| **GitHub Packages (npm, Maven, NuGet, RubyGems, Gradle)** | Hosts package registries scoped to a repo or org with GitHub identity for auth. Downloads by Actions using GITHUB_TOKEN from a private repo do not count against data transfer. | Free for public packages, and inbound transfer is always free. Private included storage / monthly transfer: Free 500 MB / 1 GB, Pro 2 GB / 10 GB, Team 2 GB / 10 GB, Enterprise Cloud 50 GB / 100 GB. Overage billed per GB; without a payment method usage is blocked at quota. | GA |

## Planning

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Issue forms and issue fields** | YAML issue forms in .github/ISSUE_TEMPLATE render structured web form inputs (text, textarea, dropdown, checkboxes, file upload, markdown blocks) instead of a free-text markdown template. Issue fields add typed, filterable metadata columns to issues at org level. | Free. Issue fields are GA for all GitHub organizations on Free, Team, Enterprise, and Enterprise Cloud with data residency. GitHub's own docs still label issue FORMS as public preview and subject to change. | Issue forms: public preview per docs; issue fields: GA July 2, 2026 |
| **Issue types** | Org-defined categories (defaults: task, bug, feature) applied to issues across all repos in the organization, filterable and reportable. Manageable from the GitHub CLI since June 2026. | Organization accounts; up to 25 types per organization. Broadly available across org plans; I did not find an explicit Free-org exclusion. | GA |
| **Issues** | Core work tracking with labels, milestones, assignees, references from commits and PRs, and task lists. Backing store for Projects items. | Free on all plans, public and private repos. | GA |
| **Projects (Projects v2)** | Adaptable table, board, and roadmap views over issues and PRs with up to 50 custom fields (text, number, date, single-select, iteration), saved views, insights charts, status updates, and templates. Built-in workflows auto-set fields, auto-add matching items, and auto-archive. | Free on all plans for user and org projects. Advanced automation beyond the built-in workflows goes through the GraphQL API or Actions. Docs did not state a per-plan cap on projects or insights; treat any Enterprise-only insight limits as unverified. | GA |
| **Sub-issues** | Parent/child issue hierarchy with progress rollup on the parent. Manageable from the GitHub CLI and the API. | Free/available for organizations. Limits: 100 sub-issues per parent, 8 levels of nesting. | GA |

## Publishing

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **GitHub Pages** | Static site hosting from a branch or from an Actions workflow, with custom domains and enforced HTTPS. Visitor IPs are logged for security regardless of sign-in state. | Public repos on all plans (Free included). Publishing FROM a private repo requires Pro, Team, or Enterprise (site is still public). Access-controlled private Pages sites require Enterprise Cloud. Soft limits: 1 GB source repo, 1 GB published site, 100 GB/month bandwidth, 10 builds/hour (build limit waived with a custom Actions workflow). | GA |
| **Releases** | Tag-anchored packaged versions with attached binary assets, auto-generated release notes from merged PRs, and automatic source zip/tarball. Download counts exposed via the API. | Free on all plans. Limits: 2 GiB per asset file, 1,000 assets per release; no cap on total release size or download bandwidth. Requires write permission to manage. | GA |

## Releases / supply chain

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Immutable releases** | Locks a published release so its assets cannot be added, changed, or deleted and its tag cannot be moved or deleted. Each immutable release gets a Sigstore-format signed attestation verifiable via gh or any Sigstore tooling. | Free; enabled at repository or organization level. Existing releases stay mutable unless republished. I did not find a plan restriction stated in docs. | GA (Oct 28, 2025) |

## Security

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Private vulnerability reporting** | Gives outside researchers a private channel to report a vulnerability directly to maintainers instead of opening a public issue. Separate from SECURITY.md and from draft advisories. | Free, but public repositories only. Must be explicitly enabled by an owner or admin. | GA |
| **Repository security advisories** | Private forks and draft advisories to discuss and fix a vulnerability before disclosure, then publish with a CVE. Publishing feeds the GitHub Advisory Database and downstream Dependabot alerts. | Free; public repositories. | GA |
| **Security overview dashboards** | Org- and enterprise-level views of alert trends, coverage, and risk across repositories. Includes enablement tracking for each security feature. | Requires GitHub Secret Protection or GitHub Code Security. Not available on plain Free/Team without an add-on. | GA |

## Security / Code Security

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Code scanning with CodeQL** | Static analysis (default setup one-click, or advanced setup with a customizable workflow and third-party SARIF upload) that raises security and correctness alerts on PRs and the default branch. Runs as an Actions workflow. | Free on public repositories. Private/internal repos require GitHub Code Security, listed at $30 USD per active committer per month. Also consumes Actions minutes from your plan quota. | GA |
| **Copilot Autofix for code scanning** | Generates a suggested code fix for a code scanning alert that you can review and commit from the PR. Works on new alerts in PRs and on existing alerts in the backlog. | Free on public repositories. Private repos require GitHub Code Security. AI-powered detections beyond CodeQL's language coverage also require Code Security. | GA |
| **Security campaigns** | Groups existing alerts into a named remediation push with an owner, notifies affected developers, and can auto-trigger Autofix or assign alerts to the Copilot cloud agent. Secret scanning campaigns exist but without auto-remediation. | Requires GitHub Code Security. Docs did not state a per-campaign alert cap or concurrent campaign limit on the page I read, so treat those limits as unverified. | GA |

## Security / Dependabot

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Dependabot alerts** | Raises an alert when a dependency on the default branch matches a GitHub Advisory Database entry, with severity, affected file, and fixed version. Fires on new advisories and on dependency-graph changes. | Free on public and private repositories, all plans. | GA |
| **Dependabot custom auto-triage rules** | Rules that automatically dismiss, snooze, or auto-open PRs for alerts matching criteria like severity, scope (dev vs prod), or package. Cuts alert noise on large dependency trees. | Requires a GitHub Code Security license (per GitHub's security features availability matrix). Not available on Free private repos. | GA |
| **Dependabot security updates** | Automatically opens pull requests that bump a vulnerable dependency to the minimum safe version. Driven by open Dependabot alerts. | Free on public and private repositories, all plans. | GA |
| **Dependabot version updates** | Scheduled dependency-bump PRs configured in .github/dependabot.yml with per-ecosystem schedules, grouping, ignore rules, and target branches. Independent of whether a vulnerability exists. | Free on public and private repositories, all plans. Dependabot jobs on private repos can consume Actions minutes when Dependabot runs on Actions runners; I could not verify the current billing rule on docs, so check your Actions usage report. | GA |

## Security / Secret Protection

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Custom secret patterns, validity checks, AI generic-secret detection** | Custom regex patterns for in-house token formats, live validity checks that call the issuing service to see if a leaked secret still works, and AI detection for unstructured secrets like passwords in config. Validity status drives triage priority. | All three require GitHub Secret Protection on private/internal repos; free on public repositories. | GA |
| **Delegated bypass for push protection** | Restricts who can bypass a push-protection block and routes other users through a request/approval queue. Gives an audit trail for every intentional secret commit. | Requires GitHub Secret Protection. Not available without the add-on. | GA |
| **Push protection** | Blocks a git push that contains a detected secret before it lands, with an explicit bypass reason flow. Push protection for individual users is on by default for pushes to public repos. | Free on public repositories (and user-level push protection is free everywhere it applies). Organization-wide push protection on private/internal repos requires GitHub Secret Protection ($19/active committer/month). | GA |
| **Secret scanning alerts** | Scans git history plus issues, PRs, discussions, wikis, and gists for hardcoded credentials and raises alerts in the Security tab. Partner alerts (notifying the issuing provider) are separate and always on for public repos. | Free on public repositories. Private/internal repositories require the GitHub Secret Protection add-on, listed at $19 USD per active committer per month (an active committer is anyone who pushed to an enabled repo in the last 90 days). Available on Team and Enterprise since April 2025. | GA |

## Security / code health

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **GitHub Code Quality** | Pairs CodeQL deterministic maintainability/reliability rules with AI-assisted detection on PRs and the default branch, plus Copilot-powered one-click fixes and org-level quality dashboards. Also ingests Cobertura XML to show PR code coverage deltas and enforce coverage/quality gates through rulesets. | $10 USD per active committer per month on enabled repositories, plus AI credits for the AI detection/Autofix parts and Actions minutes for CodeQL scans. Available on GitHub Team and Enterprise Cloud; NOT available on GitHub Enterprise Server. CodeQL rule coverage: C#, Go, Java, JavaScript, Python, Ruby, TypeScript. | GA (July 20, 2026) |

## Security / supply chain

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Artifact attestations (build provenance)** | actions/attest generates signed provenance (and optional SBOM attestations) for binaries and container images from an Actions run, verifiable with gh attestation verify. Requires id-token: write and attestations: write permissions. | Free on public repositories. Private and internal repositories require GitHub Enterprise Cloud. | GA |
| **Dependency graph** | Parses manifests and lockfiles to build the repo dependency tree, which powers Dependabot alerts and dependency review. Prerequisite for most supply-chain features. | Free on public and private repositories, all plans. | GA |
| **Dependency review and dependency-review-action** | Shows added/removed/updated dependencies on a pull request diff with vulnerability data, and the Action can fail the PR check. Configurable by severity threshold and by license allow/deny list. | Free on public repositories. Private/internal repositories require GitHub Code Security (or legacy GitHub Advanced Security). Requires the dependency graph enabled. | GA |
| **SBOM export (SPDX)** | Exports the dependency graph as an SPDX-format software bill of materials from the repo Insights tab or the API. Useful for vendor/compliance questionnaires. | Free on public and private repositories, all plans. | GA |

## Storage

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Git Large File Storage (LFS)** | Stores large binaries outside the git object database with pointer files in the repo. Bandwidth is billed on download; storage on an hourly usage rate. | Included per account: Free, Pro, and Free-for-orgs get 10 GiB storage + 10 GiB bandwidth; Team and Enterprise Cloud get 250 GiB storage + 250 GiB bandwidth. Now metered (pay for what you use) rather than the old $5/month 50 GiB data packs; docs did not publish the per-GiB overage rate, so use GitHub's pricing calculator. | GA |

## Tooling

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **GitHub CLI (gh)** | Open-source terminal client covering repos, issues, PRs, workflow runs and logs, releases, gists, codespaces, raw API calls, attestation verification, rulesets, projects, sub-issues/types, and Copilot. Extensible with gh extension. | Free and open source on all plans; usage bills against normal API rate limits. | GA |
