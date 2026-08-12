# OpenAI platform: feature surface

Researched 2026-08-12 against the vendor's live documentation, not from memory. 74 capabilities.

**This is a reference catalog, not a plan.** What we adopt and what we decline, with reasons,
lives in [CAPABILITIES.md](../CAPABILITIES.md). The services actually wired up today live in
[PLATFORM.md](../PLATFORM.md). Re-check anything here before acting on it: vendor pricing and
feature names move, and this is a dated snapshot.

Scope note from the researcher:

> OpenAI Platform (developers.openai.com / platform.openai.com), surveyed live on 2026-08-12. Note: docs moved from platform.openai.com/docs to developers.openai.com/api/docs (301). All pricing quoted from the live pricing page unless flagged. Relevance verdicts are against a Claude/Anthropic-based stack like Robinson's General Store (extraction, ask, reorder, feedback triage).


## Agents

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Agent Builder** | Visual drag-and-drop canvas for multi-step agent workflows with typed edges between nodes, live-data preview runs, and deployment either into ChatKit by workflow ID or as downloadable SDK code. Announced for deprecation June 3 2026. | Shuts down November 30 2026; docs redirect users to the Agents SDK or ChatGPT Workspace Agents. Announced with fanfare in late 2025 and killed inside a year — a caution about betting on OpenAI's higher-level abstractions. | deprecated |
| **Agents SDK** | Open-source TypeScript and Python SDK built around an agent run rather than a single response, with handoffs for delegated ownership, agents-as-tools for manager patterns, input/output/tool guardrails, resumable approval flows, sessions and resumable run state, and built-in tracing across model calls, tools, agents, guardrails and handoffs. Your server owns deployment, tool implementations, state storage and approval decisions. | SDK is free; you pay model tokens plus any built-in tool fees. Directly comparable to Anthropic's Agent SDK — which is what this project already runs on. Not a reason to switch. | GA |
| **Sandbox Agents** | Separates the harness control plane (agent loop, model calls, tool routing, approvals, tracing) from a sandbox execution plane with its own filesystem, shell, installed packages, mounted storage (S3, GCS, Azure Blob), exposed ports and resumable snapshots. Backed by third-party providers including Docker, E2B, Modal and Vercel. | Provider-dependent pricing, not OpenAI-set; docs point to each provider. In beta, so defaults and capabilities may change. | beta |

## Agents / frontend

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **ChatKit** | Embeddable agentic chat UI with tool-invocation display, file attachments, chain-of-thought visualization, plus theming, widgets and actions. Two paths: custom server via the ChatKit Python SDK against any agentic backend, or the Agent-Builder-hosted path that dies November 30 2026. | No pricing documented — unverified. Anthropic ships no equivalent drop-in chat UI, so this is a real (if shallow) gap — though Robinson's already has its own Next.js UI with deliberately plain-word copy that a generic widget would undercut. | GA |

## Audio — TTS

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Text-to-speech (gpt-4o-mini-tts, tts-1, tts-1-hd)** | Speech synthesis with 13 voices on gpt-4o-mini-tts (alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer, verse, marin, cedar; marin and cedar recommended), six output formats (MP3, Opus, AAC, FLAC, WAV, PCM), and prompt-steerable accent, emotion, intonation, speed, tone and whispering. 50+ languages supported but voices are explicitly 'optimized for English'. | gpt-4o-mini-tts $12.00 per 1M audio output tokens plus $0.60 per 1M text input; tts-1 $15.00 and tts-1-hd $30.00 per 1M characters. Anthropic has no TTS. If Robinson's ever wanted to read alerts aloud in Telugu, this is the only option — but the English voice-optimization caveat applies. | GA |

## Audio — multimodal chat

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **gpt-audio-1.5 and gpt-audio-mini** | Native audio-in/audio-out models exposed through Chat Completions rather than a realtime socket, for adding voice to an existing request/response chat flow. Simpler to bolt onto an existing HTTP app than the Realtime API. | gpt-audio-1.5: audio $32.00 in / $64.00 out, text $2.50 in / $10.00 out per 1M. gpt-audio-mini: audio $10.00/$20.00, text $0.60/$2.40. | GA |

## Audio — speech-to-speech

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Realtime API** | Low-latency speech-in/speech-out sessions over WebRTC (browser/mobile), WebSocket (server media pipelines) or SIP (telephony), with function calling, MCP servers, server-side VAD and webhook controls. Three session types: voice agent, translation, and transcription. | gpt-realtime-2.1 audio $32.00 in / $0.40 cached / $64.00 out per 1M tokens; text $4.00/$24.00; image $5.00 in. Mini variant $10.00/$20.00 audio, $0.60/$2.40 text. Docs recommend reasoning.effort:'low' for production voice agents. No Anthropic equivalent — Claude has no realtime voice channel. | GA |

## Audio — transcription

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **gpt-4o-transcribe-diarize** | Transcription with speaker diarization, returning segments annotated with speaker, start and end. Identifies who spoke when. | $0.006/minute. Relevant only if store voice notes ever involve two speakers (owner plus staff); single-speaker notes should use gpt-transcribe at $0.0045. | GA |
| **gpt-live-transcribe** | Low-latency streaming speech-to-text that emits transcript deltas as speech arrives, over WebSocket or WebRTC with type:'transcription' sessions. Uses a plural languages field (not language) for multilingual audio, supports prompt and keywords hints, and a five-step delay parameter (minimal to xhigh) trading latency against accuracy. | $0.017/minute (~$1.02/hour). Tier 1 500 RPM / 60k TPM, Tier 5 10,000 RPM / 780k TPM. Only worth it over gpt-transcribe (3.8x cheaper) if you need live captions rather than after-the-fact voice notes. | GA |
| **gpt-realtime-whisper** | Streaming transcription model positioned as the hallucination-resistant option. Vendor-reported roughly 90% fewer hallucinations than Whisper v2 and 70% fewer than gpt-4o-transcribe. | $0.017/minute. The hallucination-reduction figures come from OpenAI's May 2026 launch coverage, not a doc page I could fetch directly (openai.com/index/ returned HTTP 403) — treat as vendor claim, unverified. | GA |
| **gpt-transcribe** | Recommended file-transcription model for speech in its original language, accepting prompt, keywords and multiple languages hints, explicitly documented as improving 'multilingual audio and code-switching'. Accepts ISO 639-1 (en, es, te), selected ISO 639-3 (eng, tel, yue, cmn) and regional Chinese codes; supports streaming; endpoints v1/audio/transcriptions and v1/realtime/transcription_sessions. | $0.0045/minute — about $0.27/hour of audio. DECISIVE GAP FOR TELUGU-ENGLISH VOICE NOTES: Anthropic ships no speech-to-text at all, and the multiple-language-hints parameter is purpose-built for exactly the Telugu-English code-switching the owner produces. Note: OpenAI has NOT published a full supported-language list for gpt-transcribe (launch benchmarks covered 22 Common Voice languages) — Telugu support is inferable from the ISO code acceptance and sibling-model benchmarks, not confirmed by an official list. | GA |

## Audio — transcription (legacy)

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **whisper-1, gpt-4o-transcribe, gpt-4o-mini-transcribe** | Older transcription line. whisper-1 remains the only path to word- and segment-level timestamps (timestamp_granularities[]), subtitle formats, and the /v1/audio/translations endpoint which outputs English only; its prompt field is capped at 224 tokens. Whisper covers 98 languages with accuracy varying by language. | whisper-1 $0.006/min, gpt-4o-transcribe $0.006/min, gpt-4o-mini-transcribe $0.003/min. All legacy audio/realtime/transcription models retire January 20 2027 — do not build new work here. If you want Telugu audio rendered as English text in one hop, /v1/audio/translations on whisper-1 does it, but it is on the retirement list. | deprecated (retire Jan 20 2027) |

## Audio — translation

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **gpt-realtime-translate** | Dedicated streaming speech-to-speech translation session (v1/realtime/translations) that emits translated audio plus transcript deltas while the speaker is still talking, without waiting for turn end. Reported to cover 70+ input languages and 13 output languages. | $0.034/minute (~$2.04/hour). The 70+/13 language counts and the Indic benchmark (an integrator reported 12.5% lower word error rate on Hindi, Tamil and Telugu versus their prior stack) come from launch press coverage, not the model card, which lists no languages — unverified vendor claim. Still the single most Telugu-relevant thing on the platform, and Anthropic has no counterpart. | GA |

## Built-in tools

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Code Interpreter** | Sandboxed Python VM (containers) that reads 30+ file formats including PDF, DOCX, XLSX and CSV, generates charts and files, and can crop or rotate images to aid vision tasks. Containers expire after 20 minutes idle and data is then unrecoverable. | Per 20-minute session by RAM: 1 GB $0.03, 4 GB $0.12, 16 GB $0.48, 64 GB $1.92. Limit 100 RPM per org. Claude has an equivalent code execution tool; not a differentiator. | GA |
| **Computer Use** | Screenshot-action-screenshot loop for GUI automation on GPT-5.6 and GPT-5.4, with three integration paths (built-in loop, custom Playwright/Selenium/VNC harness, or code execution). Docs push detail:'original' and roughly 1440x900 screenshots for the best accuracy-to-token ratio. | No tool fee; you pay vision input tokens, which dominate. Claude has computer use too — parity. | GA |
| **Shell tool and Apply Patch tool** | Full terminal in a hosted Debian 12 container (Python 3.11, Node 22.16, Java 17, PHP 8.2, Ruby 3.1, Go 1.23, working dir /mnt/data, no TTY, no sudo) or in your own local runtime via shell_call / shell_call_output. Apply Patch handles structured file edits. | Hosted container time billed at the container rates above; local mode is free of tool fees. Comparable to Claude's bash/text-editor tools. | GA |
| **Web Search tool** | Three modes — non-reasoning lookup, agentic search on reasoning models, and deep research across hundreds of sources — returning url_citation annotations plus a fuller sources list. Supports up to 100 allowed_domains or blocked_domains and approximate user location (country, city, region, IANA timezone). | $10.00 per 1k calls on reasoning models with content tokens billed at model rates; $25.00 per 1k calls on non-reasoning models with content tokens free. Search context capped at 128k tokens regardless of model window. Robinson's is a grounded internal-data app; this adds nothing. | GA |

## Built-in tools / RAG

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **File Search tool** | Hosted hybrid semantic-plus-keyword retrieval over managed vector stores, with metadata attribute filtering, max_num_results tuning, and 24+ supported file types. Rate limits 100 RPM at Tier 1 up to 1000 RPM at Tiers 4-5. | $2.50 per 1k tool calls plus $0.10/GB/day storage (1 GB free). REAL GAP VERSUS A CLAUDE STACK: Anthropic ships no managed vector store, so Robinson's grounded Q&A does its own retrieval — though on Supabase you already have pgvector, which is cheaper and keeps data in Toronto. | GA |

## Core API

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Compaction** | Automatically shrinks a long context into an encrypted carry-forward item, either server-side via context_management.compact_threshold or explicitly via POST /v1/responses/compact. The standalone endpoint is stateless and ZDR-friendly. | Pricing not documented separately — unverified. A Claude stack has no first-party equivalent; you would hand-roll summarization. | GA |
| **Conversations API and stored state** | Server-side conversation persistence via a durable conversation object, or lightweight chaining with previous_response_id. Response objects carry a 30-day TTL by default (store=false disables); conversation objects are exempt from that TTL. | No storage fee documented for conversations. All prior turns are re-billed as input tokens on every call even when chained by ID, so this saves round-trips, not money. | GA |
| **Reasoning controls** | Six reasoning effort levels (none, low, medium default, high, xhigh, max), reasoning summaries via summary:auto, and encrypted reasoning items that let stateless callers replay reasoning without server-side storage. Reasoning tokens are hidden but billed as output tokens. | Billed as output tokens. Docs advise reserving at least 25,000 tokens for reasoning plus output. Comparable to Claude's extended thinking; the 'none' and 'max' endpoints are a wider spread than Claude exposes. | GA |
| **Responses API** | The recommended primary endpoint (POST /v1/responses), replacing Chat Completions; returns an output array of text, tool calls and reasoning items, with developer/user/assistant roles plus a high-priority instructions field. Docs state reasoning models perform measurably better here than on Chat Completions. | No surcharge — billed at model token rates. Functionally parallel to Anthropic's Messages API; nothing here a Claude stack lacks except the built-in server-side tools it hosts. | GA |

## Core API — legacy

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Chat Completions API and Assistants API** | Chat Completions remains supported but is no longer recommended. The Assistants API shuts down August 26, 2026 — two weeks from this survey date — replaced by Responses plus Conversations (Assistants→Prompts, Threads→Conversations, Runs→Responses). | Model token rates. Do not adopt Assistants: it is effectively already dead. | deprecated |

## Customization

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Reinforcement fine-tuning (RFT)** | Policy-gradient training of reasoning models against a custom grader that scores multiple sampled responses per prompt, using string checks, model graders or weighted multi-graders. Supported on o-series only, and currently only o4-mini. | $100.00 per training hour plus tokens used during training; resulting inference $4.00 in / $1.00 cached / $16.00 out per 1M, halved to $2.00/$8.00 if you opt into data sharing. Locked to a single legacy model — a dead end. Anthropic offers nothing comparable, but neither is worth building on. | GA (narrow) |
| **Supervised fine-tuning, DPO, and vision fine-tuning** | SFT on JSONL chat-format examples (minimum 10, 50+ recommended), plus Direct Preference Optimization and vision fine-tuning for image inputs. Only three base models remain fine-tunable: gpt-4.1, gpt-4.1-mini and gpt-4.1-nano (2025-04-14 snapshots). | Training $25.00/1M (4.1), $5.00 (mini), $1.50 (nano); inference $3.00/$12.00, $0.80/$3.20, $0.20/$0.80 respectively. WINDING DOWN: new job creation is being restricted progressively through January 6 2027, and the base models are themselves on retirement schedules. Do not plan a fine-tuning strategy here. | winding down |

## Data governance

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Data residency (including Canada)** | US and Europe (EEA plus Switzerland) support both regional storage and regional processing; Australia, CANADA, Japan, India, Singapore, South Korea and the UK support regional STORAGE ONLY; UAE supports both for select models. Non-US regions require approval for abuse-monitoring controls plus execution of a Modified Retention amendment. | No listed surcharge, but gated behind sales approval and a contract amendment. IMPORTANT FOR THIS PROJECT: Canadian data residency is storage-only — inference still processes outside Canada. That is a weaker guarantee than the Toronto-region Supabase footprint already in place, and the approval process is a real barrier. | GA (approval-gated) |
| **Data retention, ZDR, and training policy** | Default policy is that API data is not used to train or improve OpenAI models unless you explicitly opt in; abuse-monitoring logs retain content up to 30 days. Zero Data Retention is an opt-in program for eligible customers that excludes content from abuse-monitoring logs and forces store=false; Modified Abuse Monitoring is the middle option that preserves full platform access. | ZDR and Modified Abuse Monitoring both require prior approval and a custom agreement with sales — not self-serve. Materially equivalent to Anthropic's default no-training commercial policy; not a differentiator, and the sales gate is friction a small store would not clear. | GA |
| **Enterprise Key Management (EKM)** | Encrypts stored data with keys held in your own AWS, GCP or Azure key management system. Requires prior approval and a custom agreement. | No published price; sales-gated. Anthropic has no publicly documented equivalent, so this is a real enterprise-tier gap — irrelevant at store scale. | GA (sales-gated) |

## Deployment

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Amazon Bedrock deployment** | Supported OpenAI models served through AWS-managed infrastructure, with AWS owning account access, regional availability and billing, plus Zero Operator Access and ZDR options. Supports text generation, image input, structured outputs, function calling, streaming and prompt caching, but not audio input, WebSockets or computer use. | AWS-set pricing, different from direct OpenAI rates — check AWS. Context windows are capped lower than direct (272,000 tokens for GPT-5.4/5.5; 1,050,000 for newer). Mirrors Claude's own Bedrock availability, so no advantage. | GA |

## Embeddings

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Embeddings (text-embedding-3-small / -large / ada-002)** | Up to 8,192 input tokens; 1,536 default dims for small and 3,072 for large, with Matryoshka-style dimension reduction via a dimensions parameter (3-large truncated to 256 dims still beats full-size ada-002). MTEB 62.3% small, 64.6% large. | $0.02/1M (small), $0.13/1M (large), $0.10/1M (ada-002); batch halves these. TRUE GAP: Anthropic ships no first-party embedding model, so any Claude RAG stack already sources embeddings elsewhere. If Robinson's ever needs semantic search over tribal knowledge, 3-small at $0.02/1M is the cheapest credible option. | GA |

## Enterprise networking

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Private Link** | Azure-only private networking to regional OpenAI endpoints, avoiding the public internet, across South Central US, West US, East US 2 and Spain Central/EU. Incompatible with IP allowlists and mutual TLS. | Not self-service — requires OpenAI sales or an account rep. No pricing published. AWS and GCP workloads can only reach it through customer-managed networking into Azure. Not applicable to a Vercel-hosted store app. | GA (sales-gated) |

## Evaluation

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Evals platform** | Dataset-driven testing of model outputs against criteria, with JSONL test cases, templating like {{ sample.output_text }}, and a dashboard workflow. Announced for deprecation June 3 2026. | Read-only October 31 2026, full shutdown November 30 2026; docs point migrating users to Promptfoo. Not a reason to adopt OpenAI — the eval surface is actively shrinking. | deprecated |
| **Graders** | Five grader types: string check (eq/neq/like/ilike, binary), text similarity (fuzzy_match, BLEU, GLEU, METEOR, cosine, ROUGE variants, 0-1), score model (LLM-as-judge returning a numeric score), python (arbitrary code with numpy/pandas/scikit-learn, 2 GB memory, 2-minute cap), and multi (weighted formula combination). Survive as the RFT reward mechanism even after the Evals dashboard shuts down. | Model graders bill tokens at model rates; no separate grader fee documented — unverified. | GA (tied to Evals and RFT) |
| **Prompt optimizer and prompt generation** | Dashboard chat tool that rewrites prompts to current best practices, running in the background against eval datasets with annotations, feedback and grader results. Docs warn optimized prompts can underperform the original on specific inputs and need manual review. | No price documented. The dataset-backed optimizer is part of the Evals platform and dies with it on November 30 2026. | deprecated (dataset-backed variant) |
| **Trace grading and agent evals** | Captures a full agent run — model calls, tool invocations, guardrails, handoffs — and scores it against structured criteria to answer whether the right tool was picked, whether a handoff fired, and whether policy was violated. Positioned as the debugging step before graduating to repeatable dataset eval runs. | No pricing documented — unverified. Overlaps with the deprecating Evals platform, so its long-term home is unclear. | GA |

## Images

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **GPT Image models (gpt-image-2, 1.5, 1, 1-mini)** | Text-to-image and image editing with prompt-based mask guidance, sizes from 1024x1024 up to 3840px per edge (edges must be multiples of 16, max 3:1 aspect), and low/medium/high quality tiers. gpt-image-2 processes all image inputs at high input fidelity automatically. | gpt-image-2 token rates: image $8.00 in / $2.00 cached / $30.00 out, text $5.00 in per 1M. Per-image examples: 1024x1024 low quality $0.006, high quality $0.211. Anthropic generates no images at all. Irrelevant to store operations, except possibly price-sign mockups. | GA |
| **Image generation tool** | Exposes image generation inside a Responses conversation so images can be iteratively edited across turns via previous_response_id or image IDs, with partial_images (1-3) streaming intermediate frames for perceived latency. Callable from mainline text models, which then delegate to a GPT Image model you cannot name directly. | Underlying GPT Image token rates apply; no separate tool fee documented — unverified. | GA |

## Integrations

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **MCP tool and Connectors** | Remote MCP servers via server_url on the Responses API, plus eight OpenAI-maintained connectors: Dropbox, Gmail, Google Calendar, Google Drive, Microsoft Teams, Outlook Calendar, Outlook Email, SharePoint. OAuth tokens passed per-request in the authorization field are never stored, and require_approval gates data sharing. | No per-call fee — you pay only tokens for importing tool definitions and for the calls themselves. Rate limits 200-2000 RPM by tier. Claude supports MCP natively; the managed first-party connector list is the only edge. | GA |
| **Secure MCP Tunnel** | Outbound-only tunnel letting a private MCP server behind your firewall serve ChatGPT, Codex and the Responses API without opening inbound ports; a tunnel-client long-polls OpenAI for queued JSON-RPC work and posts responses back. Does not support public plugin distribution. | No pricing or eligibility stated in the docs — unverified. Genuinely useful if you ever wanted OpenAI models to reach a Supabase-side MCP server without exposing it. | GA |

## Models — agentic research

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Deep research models (o3-deep-research, o4-mini-deep-research)** | Agentic multi-step research models that run through the Responses API with web search, file search (max 2 vector stores), remote MCP and code interpreter, synthesizing long sourced reports. Recommended to run in background mode; incompatible with Zero Data Retention. | Per-model token rates are not broken out separately on the pricing page for the deep-research variants — unverified. max_tool_calls caps spend. Overkill for store Q&A, which is single-document grounded. | GA |

## Models — coding

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **GPT-5.3-Codex** | Agentic coding model, described as OpenAI's most capable to date for that use. Not relevant to invoice extraction or store Q&A. | $1.75 in / $0.175 cached / $14.00 out per 1M. Fast mode $3.50/$28.00. | GA |

## Models — frontier

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **GPT-5.6 Luna** | Cost-optimized GPT-5.6 for high-volume simple work, still 1,050,000-token context, 128k output, image input, structured outputs, function calling and reasoning effort levels. At $0.20/$1.20 this is materially cheaper than any Claude tier for bulk classification or triage. | $0.20 in / $0.02 cached / $1.20 out per 1M. Long-context $0.40/$1.80. Batch and Flex $0.10/$0.60; Fast mode $0.40/$2.40. | GA |
| **GPT-5.6 Sol** | Frontier reasoning model for complex professional work; 1,050,000-token context, 922k max input, 128k max output, text+image in / text out, knowledge cutoff Feb 16 2026. Supports streaming, structured outputs, function calling, file search, web search, prompt caching, and reasoning effort none/low/medium/high/xhigh/max. | $5.00 in / $0.50 cached / $30.00 out per 1M tokens. Prompts over 272K input tokens are surcharged 2x input and 1.5x output. Batch and Flex both $2.50/$15.00; Fast mode $10.00/$60.00. Tier 1 rate limit 500 RPM / 500k TPM. | GA |
| **GPT-5.6 Terra** | Mid-tier GPT-5.6 balancing intelligence and cost, same 1.05M context family and Feb 2026 cutoff. The natural head-to-head against Claude Sonnet-class models for extraction and grounded Q&A. | $2.00 in / $0.20 cached / $12.00 out per 1M. Long-context tier $4.00/$18.00. Batch and Flex $1.00/$6.00; Fast mode $4.00/$24.00. | GA |

## Models — legacy

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Legacy model families (GPT-5/5.1/5.2, o-series, GPT-4.1, GPT-4o, GPT-3.5)** | Still callable but on retirement schedules: legacy GPT models shut down Oct 23 2026, GPT-5 and o3 snapshots Dec 11 2026, legacy audio/realtime/transcription models Jan 20 2027. Includes o1 ($15/$60), o1-pro ($150/$600), o3 ($2/$8), o3-pro ($20/$80), o4-mini ($1.10/$4.40), GPT-4.1 ($2/$8), GPT-4o ($2.50/$10), GPT-4o-mini ($0.15/$0.60). | See per-model rates above, per 1M tokens. Do not build new work on these given the 2026-2027 shutdown dates. | deprecated / retiring |

## Models — open weight

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **gpt-oss-120b / gpt-oss-20b** | Downloadable open-weight reasoning models under Apache 2.0, natively MXFP4-quantized so 120b fits in 80GB and 20b in 16GB. Text-only, Responses-API-compatible, with adjustable reasoning effort and tool use. | Free weights (Apache 2.0 plus a gpt-oss usage policy); you pay only your own hosting. Not listed on the OpenAI API pricing page — these are self-hosted or run via third parties (Azure, HF, vLLM, Ollama, Bedrock, Together, etc.). This is the one genuine capability Anthropic has no equivalent for: on-premise weights. | GA |

## Models — previous frontier

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **GPT-5.4 family (5.4, mini, nano, pro)** | Affordable coding-oriented tier; 5.4-mini is billed as the strongest mini model for coding, computer use and subagents, 5.4-nano the cheapest of the class. GPT-5.4 and GPT-5.6 are the two families that support the Computer Use tool. | 5.4 $2.50/$0.25/$15.00; mini $0.75/$0.075/$4.50; nano $0.20/$0.02/$1.25; pro $30.00/$180.00 per 1M. | GA |
| **GPT-5.5 and GPT-5.5 Pro** | Prior frontier tier positioned for coding and professional work; Pro is the extended-compute variant. Superseded by GPT-5.6 for new builds. | GPT-5.5 $5.00 in / $0.50 cached / $30.00 out. GPT-5.5 Pro $30.00 / $180.00 (no cached rate listed). Batch halves both. | GA |

## Models — specialized

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **GPT-5.6 Cyber / Daybreak** | Cybersecurity-specialized models (GPT-5.6 Cyber, GPT-5.5 Cyber) with Daybreak Red and Daybreak Blue aliases for offensive and defensive-safeguarded variants. Irrelevant to a retail store stack. | $12.50 in / $1.25 cached / $75.00 out per 1M. Access appears gated; the docs do not state the eligibility process — unverified. | GA (gated) |

## Ops

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Supported countries** | Canada is on the supported-countries list, alongside the US, Mexico, most of Europe, Japan, South Korea, Australia, Singapore, India and much of South America. Accessing or offering access from unlisted territories can get an account blocked or suspended; Ukraine is listed with exceptions. | Free — eligibility, not a product. No blocker for a Canadian general store. | GA |
| **Token counting endpoint** | POST /v1/responses/input_tokens accepts the same payload shape as the Responses API and returns the exact count the model will receive, including images, files, tools, schemas and message-structure formatting tokens that tiktoken cannot see. Solves the known gap where local tokenizers mis-count multimodal and tool-heavy requests. | No price documented — unverified. Anthropic has an equivalent count_tokens endpoint; parity. | GA |

## Ops and governance

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Admin APIs, RBAC, and Terraform provider** | Admin-key-scoped endpoints for invitations, users, projects, model allow/denylists, spend limits, audit logs and per-project data retention, with five preset roles (Org Owner, Org Reader, Project Owner, Project Member, Project Viewer) whose permissions union across scopes. A first-party Terraform provider manages projects, service accounts, model/tool/data controls, rate limits and spend as code. | Free. Admin keys cannot call non-administration endpoints. Materially more mature governance tooling than Anthropic's console offers, though irrelevant at a one-store scale. | GA |
| **Rate limits and usage tiers** | Limits measured as RPM, RPD, TPM, TPD, IPM and batch queued-token caps, whichever binds first, with models sharing pools and long-context variants metered separately. Tier advancement is automatic on cumulative spend: Tier 1 at $5 paid, Tier 2 $50, Tier 3 $100, Tier 4 $250, Tier 5 $1,000, with monthly usage ceilings of $100/$500/$1,000/$5,000/$200,000. | Free — this is metering, not a product. Response headers expose x-ratelimit-limit/remaining/reset for requests and tokens, plus Retry-After on 429. | GA |
| **Spend limits and alerts** | Soft spend alerts that notify without interrupting, and hard monthly limits at org or project level that return 429 once breached. Enforcement is not instantaneous, so recorded spend can slightly exceed the configured cap. | Free. Project-level plus org-level caps both apply; either one tripping stops traffic. Directly useful for a small-business budget, and more granular than what Anthropic's console exposes. | GA |
| **Webhooks** | Server-push notifications for events such as batch completion, background response completion and fine-tuning job completion, following the Standard Webhooks spec. Each endpoint gets a signing secret; the SDK unwrap() method throws on invalid signature. | No fee documented — unverified. Pairs with Batch and Background mode to avoid polling. | GA |

## Pricing mechanics

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Long-context surcharge** | On GPT-5.6 tiers, requests whose input exceeds 272,000 tokens are billed at 2x the input rate and 1.5x the output rate for the whole request. Worth knowing before feeding a year of invoices into one prompt. | Sol $10/$45, Terra $4/$18, Luna $0.40/$1.80 per 1M in the long-context band. | GA |

## Retrieval

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Vector Stores / Retrieval API** | Standalone CRUD API for vector stores with automatic chunking and embedding, direct semantic search with scores and query rewriting, and expiration policies. Defaults are 800-token chunks with 400-token overlap (configurable 100-4,096 with overlap at most half the chunk); max 512 MB and 5,000,000 tokens per file, 500 files per batch request, 16 metadata keys of 256 chars each. | $0.10/GB/day beyond 1 GB free. Storage is US/EU-processed by default, which is a Canadian-privacy consideration for a Toronto-region store app. | GA |

## Safety

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Moderation API** | omni-moderation-latest classifies text (all 13 categories) and images up to 20 MB (7 categories: sexual, self-harm and its intent/instructions variants, violence, violence/graphic, illicit/violent); audio unsupported. Returns flagged boolean, per-category flags, 0-1 confidence scores, and category_applied_input_types. | FREE. Genuine gap versus a Claude stack, which has no free standalone classifier — relevant if Robinson's feedback triage ever needs to screen customer-submitted text before it reaches staff. | GA |

## Security

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Workload Identity Federation and IP allowlist** | WIF exchanges externally-issued OIDC tokens for short-lived OpenAI access tokens so no long-lived API key is stored, supporting Kubernetes, AWS/EKS, Azure/AKS, GCP/GKE, Oracle Cloud, GitHub Actions, SPIFFE and X.509 (beta). IP allowlist restricts API calls to up to 50 IPs or CIDR ranges, with project-level lists overriding rather than combining with org-level, and up to 15 minutes to propagate. | Free; both require organization-owner role. GitHub Actions OIDC federation is a genuine edge if you ever wanted keyless CI calls from this repo's workflows. | GA (X.509 in beta) |

## Structured generation

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Custom tools with context-free grammars** | Tools that take freeform string input instead of JSON, optionally constrained by a Lark grammar or a regex so output is guaranteed to match a formal language. Docs warn to keep grammars simple or the model goes out of distribution. | No surcharge; billed as tokens. No Anthropic equivalent — if you needed guaranteed-format non-JSON output (a fixed invoice line format, a currency string), this has no Claude counterpart. | GA |
| **Structured Outputs** | Constrained decoding against a supplied JSON Schema with strict:true, guaranteeing no missing required keys and no invalid enum values — stronger than JSON mode, which only guarantees valid JSON. Limits: root must be an object, all fields required (optionality via null union), additionalProperties:false mandatory, max 5,000 properties, 10 nesting levels, 120,000 chars across property names and enum values; allOf/not/conditionals unsupported. | No surcharge; first request with a new schema pays a one-time latency cost, subsequent ones do not. THIS IS THE STRONGEST GENUINE EDGE FOR INVOICE EXTRACTION: hard schema guarantees at the decoder, versus Claude's tool-schema convention which is enforced by the model rather than the sampler. | GA |

## Throughput and cost

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Background mode** | Fires long-running Responses calls asynchronously and polls the GET endpoint until terminal state; supported on GPT-5.2, GPT-5.2 Pro and GPT-5.6. Response data is written to disk for roughly 10 minutes, and streaming can only be resumed if the call was created with stream:true. | No surcharge; model token rates. Time-to-first-token is higher than synchronous. ZDR projects run store=false but the temporary disk write still occurs — a compliance detail worth noting. | GA |
| **Batch API** | Asynchronous JSONL job submission across Chat Completions, Completions, Embeddings, Responses, Moderations, image generation/editing and video generation, completing within 24 hours. Output line order does not match input order, so custom_id mapping is mandatory. | Flat 50% discount; separate rate-limit pool that does not consume your standard TPM. Limits: 50,000 requests and 200 MB per batch, 2,000 batches per hour, plus per-model queued-token caps. Anthropic's Message Batches API offers the same 50% — parity, not an edge. | GA |
| **Fast mode** | service_tier:'fast' (or the legacy 'priority' value) for up to 2.5x faster and more consistent latency on GPT-5.6 and later, settable per request or project-wide. Does not support fine-tuned models or embeddings. | Roughly 2x standard rates: Sol $10.00/$60.00, Terra $4.00/$24.00, Luna $0.40/$2.40, GPT-5.5 $12.50/$75.00 per 1M. Analogous to Anthropic priority tier but self-serve per-request rather than committed capacity. | GA |
| **Flex processing** | Sets service_tier:'flex' for synchronous-but-slow processing at Batch prices, for evals, data enrichment and async work. Expect slower responses and occasional 429 Resource Unavailable errors, which are not billed; raise your client timeout from the 10-minute default to 15. | Batch-equivalent rates (50% off) and still stacks with prompt caching. Beta with limited model availability. No Anthropic equivalent — Claude offers batch but not a slow-synchronous tier. | beta |
| **Predicted Outputs** | Supply expected output tokens in advance to speed up regeneration when most of the output is already known, on gpt-4o, gpt-4o-mini, gpt-4.1, gpt-4.1-mini and gpt-4.1-nano only. Rejected prediction tokens are still billed as completion tokens, so a bad prediction costs more, not less. | No discount — pure latency play with a cost risk. Only on legacy models, all of which retire October 2026, so effectively a dead feature. | GA |
| **Prompt caching** | Automatic prefix caching on gpt-4o and newer with no code changes, covering messages, images, tool definitions and structured-output schemas; minimum cacheable prefix is 1,024 tokens. On GPT-5.6+ the TTL is fixed at 30m, cache writes cost 1.25x the uncached input rate, and an explicit prompt_cache_breakpoint marker lets content after the breakpoint change without invalidating the prefix. | Cached reads run 10-25% of the input rate depending on model (Sol $0.50 vs $5.00 = 90% off; GPT-4o only 50% off). Automatic-by-default is a real ergonomic edge over Anthropic's explicit cache_control blocks; the 1.25x write premium on 5.6+ mirrors Anthropic's. | GA |

## Tools

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Function calling (strict mode, parallel, allowed_tools, namespaces)** | JSON-schema tool definitions with strict:true riding on the structured-outputs machinery, parallel tool calls on GPT-5 and later (disable via parallel_tool_calls:false), tool namespacing, and allowed_tools to restrict the callable subset without editing the tools array (which preserves prompt-cache prefixes). | Tool definitions are billed as input tokens. Broadly at parity with Claude tool use; allowed_tools plus namespacing is a modest ergonomic edge. | GA |
| **Programmatic Tool Calling** | The model writes JavaScript that orchestrates multiple tool calls in a hosted, isolated V8 runtime with loops, conditionals and intermediate state, returning only the final result to context. The runtime has no Node, no package install, no network, no filesystem, no subprocesses and no state between executions. | No separate fee documented — unverified. Docs explicitly advise benchmarking against direct tool calling first rather than assuming savings. | GA |
| **Skills** | Versioned bundles of files with a SKILL.md manifest (front matter plus instructions), following the open Agent Skills standard — the same standard Claude Code skills use. Uploaded as a directory or zip, max 50 MB / 500 files / 25 MB uncompressed, with default_version and latest_version pointers, executed via the shell tool. | No separate fee documented — unverified. This is the same open standard, so a Claude-based stack's skills are portable; not a differentiator. | GA |
| **Tool Search** | Defers loading tool definitions until needed, in hosted mode (API searches your declared tools) or client-executed mode (model emits tool_search_call, you resolve it). Tools are injected at the end of the context window so the cached prefix survives across requests. | No separate fee; the point is reducing input tokens. Only matters above roughly 10 functions per namespace, which a store app will not hit. | GA |

## Video

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Sora 2 and Sora 2 Pro (video)** | Text-to-video with 16- and 20-second generations extendable to 120 seconds, 480p to 1080p, image-reference first frames, reusable non-human 'characters', and targeted edits. Content rules bar copyrighted characters and music, real people, and human faces in reference images; output downloadable for only 1 hour. | sora-2 $0.10/sec at 720p; sora-2-pro $0.30/sec (720p), $0.50/sec (1024p), $0.70/sec (1080p); batch halves. NOTE: the deprecations page lists Sora 2 and the Videos API for shutdown September 24 2026 — six weeks out. Do not build on it. | deprecated (shutdown Sep 24 2026) |

## Vision and documents

| Capability | What it does | Plan or cost | Maturity |
|---|---|---|---|
| **Image input / vision** | Images by URL, base64 data URL or Files-API file ID, with four detail levels — low (512x512), high, original (full dimensions, best for OCR and coordinate work) and auto, which defaults to original on GPT-5.5/5.6. Limits: PNG/JPEG/WEBP/non-animated GIF, up to 512 MB total payload and 1,500 images per request; GPT-5.4/5.5 meter images as 32x32 patches while GPT-4o/4.1 use tiled base-plus-per-512px accounting. | Billed as input tokens at model rates. RELEVANT TO INVOICE EXTRACTION: detail:'original' is a real, documented OCR-fidelity control that Claude's vision API does not expose. But docs explicitly list non-English text, small text and rotated images as weak spots — the same failure modes a Claude stack hits. | GA |
| **PDF and file inputs** | For vision-capable models the API extracts both the text layer and page images from a PDF and sends both, which is why PDF token usage runs high; spreadsheets are parsed to the first 1,000 rows per sheet plus a metadata summary rather than sent whole. Non-PDF files do not get embedded images or charts extracted, so docs recommend converting to PDF for visual fidelity. | 50 MB per file and 50 MB combined per request; billed as tokens. Claude's PDF support also sends text plus page images — near parity, so this is not a reason to switch invoice extraction. | GA |
