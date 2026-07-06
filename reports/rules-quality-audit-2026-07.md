# Margin Writing Rules — Quality Audit (July 2026)
Read-only audit of `/Users/samzoloth/.margin/margin.db`, table `writing_rules`. No rows were modified. Every one of the 293 rows was read individually (rule_text, when_to_apply, why, example_before, example_after, source, notes) before classification.
## Summary
Total rules audited: 293
- KEEP: 228
- MERGE: 14
- REWRITE: 3
- DROP: 48
- (INVERT: 0 rows have swapped-quality before/after examples — see the Inversion finding below for a related but different bug)

Counts sum to 293 of 293.

## Inversion finding (read this first)

The audit brief asked me to find a rule whose `example_before`/`example_after` pair has the good and bad examples swapped. Across all 58 rows in the table that actually have both fields populated, none show that pattern — every `example_before` is worse prose than its paired `example_after`, in the direction you'd expect.

What I found instead, in the `general/auto-synthesized` category, is a related but distinct bug: a **field-mapping inversion**, not a quality-swap. Two sibling rows document it:

- `40d5d619-3acc-4b8d-8486-199ee49967ea` — `rule_text` holds the raw correction quote `"And when they do, they stop filtering what they tell you."` (the *good*, corrected line from Sam's draft), and `example_before` holds `"They stop filtering what they tell you."` — also the good line, just missing the connective clause. Neither field contains the actual flawed text that prompted the correction.
- `70956c93a3a94f5488ce03c04e0d5133` — this row is Margin's own auto-repair process catching the bug live. Its `rule_text` reads: *"Swap the fields so `example_before` = 'They stop filtering what they tell you.' (the forbidden pattern) and `example_after` or rule_text encodes the corrected form. The guard must substring-match against the BAD form, not the good one. Audit other auto-synthesized rules for the same inversion — if the correction notes field ('And when they do...') is being stored as example_before, all such rules are blocking the correct output instead of the violation."*

In other words: the synthesis pipeline stored the polished sentence as if it were the bad example, which means if this rule were ever wired into a live guard (e.g. an "avoid this pattern" checker matching against `example_before`), it would flag or block Sam's own *good* writing while letting the actual bad pattern through — the opposite of its intent. This is worse than a simple quality-swap because it's silent: nothing about the row's structure signals the error unless you read the correction/notes trail closely, which is exactly what row `70956c93a3a94f5488ce03c04e0d5133` did.

Both rows are classified DROP below (they're not usable as rules), but the finding is the important part: **the entire `auto-synthesized` category (43 rows, all sourced from `auto-synthesis` or `gepa-variant`) shows evidence of this same unreliable field-mapping**, and every row in it turned out to be either a raw correction note or a meta-instruction about editing the database — never a clean, applicable rule. Treat the whole category as suspect, not just these two rows.

## KEEP (228 rules)
Clear, generalizable, correctly-ordered examples. Grouped by writing_type/category; quotes truncated for scanability — full text is in the source DB.

| id | type/category | rule (short) |
|---|---|---|
| `09911138-c0fd-4d2a-9eb5-13a0bf08c538` | blog/ai-slop | Section titles starting with "The..." are an AI tell. Prefer active, specific titles. "What the ste… |
| `38e4ea81-f207-4809-b8bf-0e15e5d24a11` | blog/structure | One article carries one argument. When a draft braids two distinct theses (e.g., how AI changes the… |
| `rule-verify-experience-claims` | cover-letter/Accuracy | Every claim about your past work must be grounded in what you actually did. Don't let AI-generated … |
| `rule-audience-dont-explain-their-business` | cover-letter/Audience awareness | Never explain a company's own business model, metrics, or product lines back to them. |
| `rule-clear-antecedents` | cover-letter/Sentence craft | Every comparative reference ("the closest parallel", "a similar case", "that same dynamic") must ha… |
| `02db1ed6-145f-4f64-b4f3-e13b79400ac3` | cover-letter/kill-words | Never use 'genuinely' — it reads as AI slop filler |
| `85382383-2a1a-40e9-b36a-28421e31c72f` | cover-letter/kill-words | Never use 'the kind of X that Y' construction — it's AI filler. Say directly what excites you, impr… |
| `5538f2a7-a834-4645-bcee-c0eca90f97de` | cover-letter/structure | When citing experience from a different domain, explicitly bridge WHY it's relevant. Don't make the… |
| `1b13e334-4c4f-4af0-97e1-fc2f3caa75b4` | cover-letter/voice-calibration | REINFORCE: Direct, honest positioning of weaknesses is powerful. "I'm aware that a consulting backg… |
| `446b68c7-8da0-4295-a1fe-0ec6bde3e827` | cover-letter/voice-calibration | Represent Sam's full breadth. Don't cherry-pick one project when Sam has built many things (Margin,… |
| `b2f00832-f0c6-4ff7-9510-3d0a100356cb` | cover-letter/voice-calibration | Show HOW, not just WHAT. When saying "I'd study usage patterns" or "I'd segment the data," explain … |
| `rule-factual-accuracy` | general/accuracy | Verify that names, relationships, numbers, and acronyms are correct before publishing. |
| `00d2c0bb-cea6-42ac-af93-869343c23476` | general/ai-slop | Business jargon — name who's affected |
| `02bb5a62-474c-4676-995c-7f0a1ba03f62` | general/ai-slop | AI filler — use 'area', 'field', or just name it |
| `03e036a3-bfe3-48ee-9b75-ace021cfcdc6` | general/ai-slop | AI temporal filler — cut or be specific |
| `057a9120-8622-4791-a87b-278be428f88d` | general/ai-slop | AI filler adjective — cut or be specific about what changed |
| `0a51386e-8775-418a-8099-322683081a77` | general/ai-slop | Vagueness — name the specific complications |
| `0e73054c-6293-4c21-8ee1-5d5dd87df283` | general/ai-slop | If it goes without saying, don't say it |
| `10909e3e-42e2-4a80-8db2-3bbe6c00cd81` | general/ai-slop | AI throat-clearing with significance inflation — just say it |
| `1263e04d-325e-4b9a-985f-8865acaa2a89` | general/ai-slop | Filler phrase — cut and start with the subject |
| `129301b8-2006-4b2e-ad8e-a9132955917b` | general/ai-slop | AI transition crutch — restructure for contrast |
| `174a30a6-d985-40a5-86e6-55bb52bbe72c` | general/ai-slop | AI emphasis that overstates — just make the point |
| `186b7b2f-6324-4e1b-a006-292d3ca1732f` | general/ai-slop | AI vague verb — say what's actually being encouraged |
| `1879c47c-d57f-419f-9066-ffbdfb4f81e5` | general/ai-slop | AI back-reference — trust the reader's memory or restructure |
| `1ad09b20-29d6-42b8-bcab-3a5b944024b4` | general/ai-slop | Business cliche — name the easy wins |
| `1e258770-0c3a-4e12-9392-ed510ad5cfbd` | general/ai-slop | AI essay verb — use 'supports' or restructure |
| `1ebe3e52-f80a-4dfb-bfb6-b88f62f46a5f` | general/ai-slop | AI buzzword — describe what can be done with it |
| `1ede05b5-ff39-46b4-9a4f-c6e8ba9a3d6a` | general/ai-slop | AI journey language — just describe the action |
| `1f5b4480-c979-40b8-ba4f-1eaf2b2034e1` | general/ai-slop | AI marketing for 'analysis' — say 'analysis' or 'examination' |
| `20fa62f8-b733-4a0e-99c6-4ecac4f40df6` | general/ai-slop | AI significance inflation — show don't tell |
| `22cb0637-f443-4341-8639-563dc114fddb` | general/ai-slop | AI buzzword — describe the actual anticipatory action |
| `27c59d34-dc88-45ec-807b-e2f0e86a4bc5` | general/ai-slop | AI filler adjective pair — cut or be specific about robustness |
| `298c753e-32de-486a-8ba4-a74dd4fb6520` | general/ai-slop | Filler — usually deletable |
| `2c6bf34d-3e49-428f-94d5-91ba54c5da67` | general/ai-slop | AI throat-clearing — just mention it |
| `2fc07328-b803-4606-8111-42809e3b258a` | general/ai-slop | Significance inflation — describe what's actually new |
| `31a33a70-fc00-4e75-aa74-64455e5bc89a` | general/ai-slop | AI vagueness — name the specific improvements |
| `37663a4c-782d-4dda-99d1-ff030c22331b` | general/ai-slop | AI marketing verb — say 'use' or 'apply' |
| `37e88cf2-bc3a-4a46-8706-c24eae95bf32` | general/ai-slop | Dead metaphor — describe the creative approach |
| `38d8b6cf-1135-4cf9-a68c-46641eda0b40` | general/ai-slop | AI scope inflation — just make the broader point |
| `3d1f1566-d26a-4044-9c0f-344f21ad48dd` | general/ai-slop | AI marketing verb — say 'enable' or 'use' |
| `41e26f87-fddf-4a20-8aff-e10c593caf4e` | general/ai-slop | AI buzzword — name the specific new thing |
| `463a087d-5986-4b9b-9409-640232bb38a0` | general/ai-slop | AI significance — describe the actual improvement |
| `4de09d04-ff2a-4f0a-ad8f-d8559f0163c4` | general/ai-slop | AI significance cliche — show don't tell |
| `5197e6f0-cdbc-40ff-abd5-c98fcac9b526` | general/ai-slop | Business cliche — say 'revisit' or 'return to' |
| `548f087d-3e9f-424f-a419-08f41d02fe2e` | general/ai-slop | AI hedging — just list the considerations |
| `552e5dd7-b63f-4558-8648-aaa93dc5dd23` | general/ai-slop | AI cadence pattern: short declarative sentence → setup dichotomy → em dash explanation. Only ONE pa… |
| `5565f728-65f0-4203-b3fb-5b4749341e99` | general/ai-slop | AI intensity word — show consistency through evidence |
| `5664b17f-2d88-4ab6-9b0e-9e369e93559b` | general/ai-slop | Filler — 'to' means the same thing |
| `5d6b4048-c49d-47af-8262-cd7770b3b802` | general/ai-slop | AI condescension — just state the point |
| `602c31a8-7cbe-4847-9b8e-0eafa40a1913` | general/ai-slop | AI precision theater — show the care through details |
| `64f5db72-0bf3-4c12-a674-fa6f054ca790` | general/ai-slop | AI marketing verb — say 'improve' or be specific |
| `6ae81e8c-57d1-4128-b79e-3fd7253a787e` | general/ai-slop | Double AI buzzword — say what was learned and what to do |
| `6cb410e6-8953-4322-bf9e-09a52a810d99` | general/ai-slop | Frequency hedge-adverbs (usually, sometimes, often, typically; plus actually, honestly, genuinely, … |
| `721af836-bc1f-47d7-b6b0-a3c4974fd83c` | general/ai-slop | AI transition filler — just state the essential point |
| `73aade0f-77ca-4ce1-bd75-f4e94dfac507` | general/ai-slop | AI adjective — be specific about what makes it strong |
| `75fbfeb1-1a8d-4855-824b-32d05a16e27e` | general/ai-slop | AI significance positioning — show leadership through evidence |
| `76358c57-4650-4f31-84c0-9264fcc21412` | general/ai-slop | AI filler opener — cut and start with the subject |
| `7756f9d1-ce10-4968-8596-2ab64147fecf` | general/ai-slop | Kill these conversational AI openers and label-structures in ALL prose and chat replies: (1) the va… |
| `7a0f4624-b3ab-4b0c-87e5-b1fc2eccfabf` | general/ai-slop | AI significance + vagueness — say what it actually does |
| `7c7439fe-97c7-4d18-a2de-9bed34569a9d` | general/ai-slop | Filler — 'because' means the same thing |
| `8202bb1b-b5e2-4af3-ab7e-b3db0f6a9c94` | general/ai-slop | AI transition — just begin the analysis |
| `82f58e7a-171a-4464-ad57-0b88bcb4ab92` | general/ai-slop | Business cliche — say what changed and by how much |
| `85e380c4-c672-4f31-ba41-e3bd7a061fd1` | general/ai-slop | Business jargon — say what's actually combining |
| `8ac6fa13-f0a7-48f5-a499-677263d8729f` | general/ai-slop | Limit colons to 1 per document in prose. The "setup: punchline" structure (especially "X: Y" where … |
| `8c4bda8e-98ab-49bd-a161-42838497e654` | general/ai-slop | AI marketing phrase — say what it actually does |
| `929f9470-8aef-4b30-9b37-6c07fd603006` | general/ai-slop | AI buzzword — say what was actually learned |
| `994047ab-e244-4786-8066-5f597e728a4e` | general/ai-slop | AI promotional language — describe what's actually learned |
| `9b5e80fc-acd7-49e8-9d1f-5d0c20a97e51` | general/ai-slop | Hedging — state the recommendation directly |
| `9ba963d8-ce47-4267-bf36-e0988ba5406b` | general/ai-slop | AI hedging — state the recommendation |
| `9c45e243-08a7-4740-993f-25224f47f3f7` | general/ai-slop | If it's needless, don't say it |
| `9cd7340a-7777-452f-ba5a-e6f597c3b399` | general/ai-slop | Significance inflation — show the impact instead |
| `9d0dbb4a-da37-4b54-b60e-34b9cef42dfc` | general/ai-slop | The master AI tell is hedge-and-point: soft verbs (feels, seems), frequency adverbs (usually, somet… |
| `9d57ac6b-5d09-4e02-b898-08e72ef2dc5e` | general/ai-slop | AI promotional language — describe what's revealed |
| `a47cf3a5-994d-40d4-aff8-805a206da921` | general/ai-slop | AI significance inflation — 'important' or cut entirely |
| `abb57006-d7d7-407e-95e6-86866104fa04` | general/ai-slop | AI virtue word — show resilience through specifics |
| `aea72f93-059b-45af-b264-e58a89ac586a` | general/ai-slop | Dead metaphor — be specific about variety |
| `aeb23810-a216-454b-a2dc-710b3afee1af` | general/ai-slop | AI discovery language — be specific about what changed |
| `b5fc6639-50a3-45f4-b25f-f0e782cea2fd` | general/ai-slop | AI temporal filler — cut entirely, reader knows when they live |
| `b7d07fb6-16c0-4a1a-a3da-9ad0eb1843f5` | general/ai-slop | AI formality — use 'will' or restructure |
| `b8563488-00b6-4a56-be30-4b226e3ce98b` | general/ai-slop | AI significance word — 'important' or cut |
| `b953224d-f991-4dd5-ad43-4e549498e188` | general/ai-slop | Cliche filler — restructure or cut |
| `bc76f59e-cb36-4e46-967a-81a442d6d1aa` | general/ai-slop | AI throat-clearing — just state the point |
| `bca73aee-aa94-48e5-8ff4-cd26b843568f` | general/ai-slop | AI vagueness — use a real number or 'many' |
| `bd29cc2b-d151-4a74-8063-ba9de8d33809` | general/ai-slop | AI transition crutch — just start the analysis |
| `bea48afb-8410-4a7a-bb3c-f20469900ac3` | general/ai-slop | AI vagueness — name the specific complexities |
| `c0c654b6-2779-4c3e-ba0c-1030179d5d07` | general/ai-slop | AI vagueness — name the facets |
| `c63ad482-928c-4a96-9b2c-0055abe8ed4b` | general/ai-slop | Soft attribution ('X keeps coming up', 'people keep mentioning', 'it kept surfacing') manufactures … |
| `c893a418-15c4-4031-8e51-c40214bc332d` | general/ai-slop | Limit em dashes to 1-2 per document. Excessive em dashes are an AI cadence marker — they create a p… |
| `c9cf71f7-3b98-4ca5-b71b-16f58bbe8cbc` | general/ai-slop | AI marketing — say what's actually enabled |
| `cb63bd7d-362b-4b59-8233-c3a2e203aa62` | general/ai-slop | AI promotional — 'learning' or 'understanding' is more honest |
| `cbf18a6e-3ff6-4a87-b2da-6365ab3e096e` | general/ai-slop | AI vagueness — describe what's complex about it |
| `cce87f3a-9755-426a-973f-9d45e5717f8c` | general/ai-slop | Demonstrative significance-pointers (that's the part, the thing is, what I keep coming back to, her… |
| `ce2015ee-fc30-483d-9c0c-dbd0a9b441ba` | general/ai-slop | AI filler — name the specific practices |
| `d103a4b6-a05c-4081-be4b-df6f90404427` | general/ai-slop | AI structural tell — cut or restructure ending |
| `d3fc878f-b5c9-45db-9867-826c22755544` | general/ai-slop | AI significance inflation — show the transformation |
| `d98b1211-9eee-4d78-8363-b801a057ccbb` | general/ai-slop | AI sensory inflation — show the tension through evidence |
| `d9abe044-48b6-4210-980a-08e041ca094e` | general/ai-slop | AI formality — use 'amid' or 'during' |
| `da86f4e5-dc59-4f49-8e13-3c6434d169ec` | general/ai-slop | AI temporal filler — cut entirely |
| `dafb72ea-4c73-4b29-ab54-2150e5d81a36` | general/ai-slop | AI marketing word — say 'customized' or 'specific to' |
| `dc0208d8-44a6-4a93-9d0b-5b9eea1458e7` | general/ai-slop | AI condescension — just state it simply |
| `dcb2b744-431b-4f77-8be6-2dc92ca70b8c` | general/ai-slop | AI condescension — reader doesn't need to be told to remember |
| `dd0fd040-d543-44b6-ac82-22eb995c4759` | general/ai-slop | AI marketing for 'analysis' — say 'analysis' |
| `e23dac60-6426-4be9-8524-1acfc3fd6159` | general/ai-slop | Kill negative parallelism: "it's not X, it's Y" / "the hard part isn't X — it's Y" / "isn't just th… |
| `e3073d03-d8e7-436a-8399-f51884e58fa7` | general/ai-slop | AI padding — reader knows the context |
| `e6a754d8-1c22-4e14-a53f-92664cdf3548` | general/ai-slop | AI smoothness claim — nothing is seamless; be specific |
| `ebcefff8-ce00-4b97-baa9-8f6f8cf0bb10` | general/ai-slop | Dead metaphor — name what's harmonizing |
| `ec859107-c40f-4054-87a1-737beaf8cbfb` | general/ai-slop | AI throat-clearing — just state what should be done |
| `ee2542b9-cb0b-427a-9d54-2f80004ef8cc` | general/ai-slop | AI scope inflation — be specific about what's covered |
| `ee92ab19-4af7-4014-b197-202925e8d69e` | general/ai-slop | AI filler — replace with 'in' or cut entirely |
| `f1f2c704-0ce7-45dd-9cdf-d7d47abc96c6` | general/ai-slop | AI conclusion crutch — restructure or cut |
| `f42292ce-a2b9-42b6-bf5e-8c3e8956eeec` | general/ai-slop | AI buzzword — describe what's being anticipated |
| `fa167782-7c47-48ba-9556-ae0cc0b4bfed` | general/ai-slop | AI vagueness — name the specific subtleties |
| `faaa960e-8be3-45f9-88b5-f6c49b0afc59` | general/ai-slop | AI leadership verb — say 'leading' or describe the role |
| `rule-argument-completeness` | general/argument-completeness | Expand assertions with evidence, cover counterpoints, and acknowledge what you are uncertain about. |
| `73ee5cff-c4d8-438c-a7c5-51a2cf8707fd` | general/argument-rigor | Don't name-drop frameworks you haven't digested. Research first, cite second. |
| `90f0350a-eb50-4952-8a72-205624075f77` | general/argument-rigor | Examples must support the actual thesis, not just a related point. |
| `f8c5a2e7-c0db-472d-9a50-9340cf63f5e0` | general/argument-rigor | Don't flatten nuance into a punchline. Say what's actually happening in concrete terms. |
| `rule-authenticity-conviction` | general/authenticity | Remove any claim you do not genuinely believe or cannot defend with your own experience. |
| `rule-concision-cutting` | general/concision | Cut sentences, paragraphs, or sections that do not earn their place — even if they sound good. |
| `43d900c7-dfb3-4d51-839b-cb545bf3ab88` | general/editorial | Read aloud — would you say this at a coffee shop? If it sounds like a press release, rewrite. |
| `86dcd460-0f15-4b20-b4a5-87b65edcc97b` | general/editorial | Professional/portfolio content: NO emojis, prefer editorial magazine quality. |
| `d3e8225c-e727-4674-8ea5-ddadb13043bb` | general/editorial | Requirements docs: write use cases in user language ('I'm looking for X'), not analyst jargon ('sem… |
| `de5f1d58-df55-45ba-8736-e3f586531807` | general/editorial | Prefer physical, tactile verbs over abstract process verbs: 'sanded down' not 'improved', 'bolted o… |
| `dfc3c03d-611b-42fb-8888-875471ab695c` | general/editorial | Always filter through 'did behavior change?' before claiming an outcome. Artifacts (frameworks, dec… |
| `f3a26d7f-e568-4e95-8f5e-9a571823cff1` | general/editorial | Avoid rule of three unless genuine enumeration. |
| `fa98f7bd-cec0-49f1-a1ce-4c655d55e31f` | general/editorial | NEVER modify user/stakeholder quotes — apply kill words only to Claude's prose. |
| `rule-post-generation-critique` | general/editorial | Run a separate critique pass after generating any professional writing. Act as an old-school copy e… |
| `rule-heading-no-the` | general/heading-patterns | Section headings must not start with 'The' or 'the'. Lead with the operative noun or verb. |
| `00ddd291-dbf3-42a2-ae0f-7e932e4fa792` | general/kill-words | Dead compound metaphor — be specific about interconnection |
| `187a921f730a3fff8c4fb08ac5f39188` | general/kill-words | let me know if |
| `226583c2-b9c7-48ea-b51f-ff3192c59fe9` | general/kill-words | Business jargon — say what's being used and how |
| `2cdf2c395147d7ac50af602a3464cd29` | general/kill-words | vibrant |
| `31ebf910-cc90-401a-abc1-d3d16f4838c9` | general/kill-words | AI connector — restructure or use a real transition |
| `32a91479-82f5-4807-9573-cc03aeee5379` | general/kill-words | AI formality — 'use' is the same word |
| `32f9fc4f-b982-4df7-b272-346344d8575c` | general/kill-words | AI-signature verb form — use 'examined', 'explored' |
| `36a492ebfadb79d5a2db5b8ee06bf06d` | general/kill-words | absolutely! |
| `3a002419d303618e160417f3428f2dd0` | general/kill-words | boasts |
| `3b208bc3-e0db-43c9-b869-9b2c896cc458` | general/kill-words | AI marketing — 'enabling' or describe the actual capability |
| `408ef39f-06f6-484d-908e-6c1d6e16ebc2` | general/kill-words | AI marketing verb — say 'simplify' or describe the improvement |
| `42af88587426364ab55412ccab040729` | general/kill-words | renowned |
| `4328f9d0-e0a0-4ec4-af70-d13a6d004c61` | general/kill-words | Dead metaphor plural — be specific |
| `4509bb21-a921-4787-a6ca-b1f627a82365` | general/kill-words | AI vagueness — use 'many' or a number |
| `4881c2beb8c51e4c1f4199cc43959231` | general/kill-words | breathtaking |
| `5c331cc27d9f09ade2b554f05ab7b808` | general/kill-words | functions as |
| `5d7dd032-53c1-4c24-93b6-4dfcefed0db1` | general/kill-words | AI metaphor for any process — name the actual process |
| `5ee4eeff-46ae-43c9-80fd-a8b34ea3a768` | general/kill-words | Vague action verb — say what's actually being done |
| `606c10ef-f854-40d7-8935-6cbe57f817ad` | general/kill-words | AI vagueness — use a number or 'many' |
| `630e36569bf1c3d67b79b31804834157` | general/kill-words | certainly! |
| `68b06e08-3c67-4cf2-9f60-12db6f866599` | general/kill-words | AI emphasis verb — show the importance through evidence |
| `6db64991d5d7972820b5cf4b4d375247` | general/kill-words | state-of-the-art |
| `72a02a3d-6e92-48b4-ace5-7830933a3383` | general/kill-words | AI-signature verb form — use 'examining', 'exploring' |
| `7e67a96c-d7f5-4aa7-8f26-42b8bbe17607` | general/kill-words | AI formality — 'using' is the same word |
| `839c552c-cd85-4b5c-93ed-57279ff8eeb7` | general/kill-words | Business jargon verb — use 'use' or be specific |
| `87da794f-6a6a-4240-8894-b5a6cbcf4555` | general/kill-words | AI nominalization — 'use' is the same word |
| `8ad48e27-8f6a-486c-81d9-265ffa3ec79d` | general/kill-words | Kill AI tell words: "genuinely," "exactly," "actually" (as filler intensifiers). These are overused… |
| `9d1b1c33d28910131d8af4394fbcbe42` | general/kill-words | i hope this helps |
| `9d3934b5-3451-4660-85dd-5bb4e158db47` | general/kill-words | AI buzzword — 'comprehensive' or 'complete' |
| `ae4d217008aa47b31f9cb22519620273` | general/kill-words | great question |
| `b3af0eb3-0e33-476f-98ee-730212c92278` | general/kill-words | AI marketing verb — say 'enable' or 'let' |
| `b4b35e4af15404b95187acdab74ba41b` | general/kill-words | nuanced |
| `b6a89568-2ace-4820-b3dc-1e3640c5bb1f` | general/kill-words | AI buzzword for 'system' — use 'system' or name it |
| `bcd3bc3e-ca2f-4424-bf3f-e3ccc9ba1ff3` | general/kill-words | Significance inflation — let the evidence speak |
| `c19c8ed9-bc36-4cb5-a6e6-b7cfdd1b89ef` | general/kill-words | AI metaphor for any field/market — name it directly |
| `c2836496-866e-43b9-ade3-bd6ccfc1a3e0` | general/kill-words | AI significance — show what's new, don't label it |
| `cb8acfab-3a27-4b57-ad44-87aa9fbebd65` | general/kill-words | AI structural tell — restructure the ending |
| `cc65acaf-9968-4894-af56-80c86305d878` | general/kill-words | AI significance word — show the importance through evidence |
| `d053c7d2-3296-4232-aeab-8080ba55f524` | general/kill-words | AI-signature verb — use 'examine', 'explore', or be specific |
| `d5f1efd9-1409-4f6f-8b2e-b9489fd5909c` | general/kill-words | AI connector — restructure for natural flow |
| `dec4640a747aed1065f3893f8a4c423c` | general/kill-words | nestled |
| `e3b72c9e7ad9912103469b42c0534045` | general/kill-words | world-class |
| `e3e1e571-c0ca-42c5-ad00-483b1c870ce5` | general/kill-words | Significance inflation — show what's new |
| `eeff6958-3eab-484a-8204-878d8568fcd1` | general/kill-words | Double AI tell — name the actual challenges |
| `f32f9416-08cb-4539-b24e-8920ca48944d` | general/kill-words | AI buzzword — describe the actual change |
| `fb493c39-ba20-45b6-b2a7-ede36f3ba11f` | general/kill-words | Significance inflation — show the change |
| `fcfcddd9-722a-4b11-b14e-7ff9b1b95fc2` | general/kill-words | AI presentation verb — say 'showing' or 'demonstrating' |
| `fed7fc8c-a88c-4e42-92c9-176cdd7c20c3` | general/kill-words | Dead metaphor — be specific about what's interconnected |
| `rule-linking-references` | general/linking | Add hyperlinks when citing named frameworks, people, or external works. |
| `rule-research-depth` | general/research-depth | Understand a framework, person, or concept thoroughly before citing it in your writing. |
| `rule-sentence-combining` | general/sentence-combining | Combine choppy consecutive sentences into single, stronger ones. |
| `rule-sentence-rhythm` | general/sentence-rhythm | Vary sentence length deliberately; break monotonous cadences of same-length sentences. |
| `rule-source-material-utilization` | general/source-utilization | Read and internalize source material before writing; incorporate insights naturally rather than for… |
| `rule-topic-sentence-fulfillment` | general/structural-craft | Every claim in a topic sentence must be explicitly supported by the paragraph body. If you promise … |
| `77221994-b9a6-428e-ae41-95dd0eaf2a1d` | general/structure | Reader empathy: first mention of ANY company, product, acronym, or concept must include enough cont… |
| `d9498750-c628-46b8-8e23-8861fd6c6d21` | general/structure | No sentence fragments in prose. Lists of nouns masquerading as sentences ("Cost models, attribution… |
| `fedd9258-bec3-49f8-9123-d39d0bdbe60d` | general/structure | Sentences must flow into each other. Each sentence should have a logical connection to the one befo… |
| `rule-timeliness-grounding` | general/timeliness | Anchor all examples and claims in the present, and acknowledge how fast things are changing. |
| `rule-tone-warmth` | general/tone | Use language that carries genuine energy and enthusiasm where the context warrants it. |
| `0e80359e-cbd6-49ea-a071-da2431fda432` | general/voice-calibration | Never write 'utilize' — it's 'use'. Never write 'I wanted to reach out' — just reach out. |
| `1529e8e5-7046-42f8-9f5d-172358103c29` | general/voice-calibration | Median message: 27 characters / 5 words. Short is default. 23.5% of messages are fragments (≤3 word… |
| `18e559d4-4084-4954-a7f8-e7614897d1d3` | general/voice-calibration | No sign-off — messages just end. 'Let me know' to leave the ball in their court. Rarely says goodby… |
| `289b004c-91d1-4b6c-8e2c-5cf18e0d04a5` | general/voice-calibration | Prefers sending multiple short messages over one long one. Long messages (80+ chars) reserved for e… |
| `320a9339-bf28-4d15-9eac-1423b7c9df67` | general/voice-calibration | Almost never end messages with periods (~0.8%). This is the single strongest voice signal. |
| `3ae9217c-44d7-41a5-8e82-bfcd364c222d` | general/voice-calibration | Emotional/heartfelt: 'I appreciate [specific thing]', vulnerability through understatement not over… |
| `3bfbd738-caea-4c77-bd45-a6628ea8f5e3` | general/voice-calibration | Double exclamation (!!) for genuine excitement, not performative energy. Interrobang (!? or ?!) for… |
| `3e473f2a-1d28-4144-9258-8b7ca040d0d0` | general/voice-calibration | Questions get question marks (~13%). Excitement gets exclamation marks (~4%). Everything else just … |
| `6132b910-7355-436e-9a0b-2ab5ab41ec88` | general/voice-calibration | Never use 'absolutely' as agreement — it's 'yeah', 'for sure', or 'definitely'. Never write 'apolog… |
| `6244040b-64b3-4dbf-9d86-d3ecdc0aa140` | general/voice-calibration | Hedges 3.6x more than declares. 'I think', 'probably', 'maybe', 'kinda' are load-bearing words — ca… |
| `75962aef-899b-40c6-9142-7f27e0a2c7a7` | general/voice-calibration | Ellipsis for trailing off or softening. Em-dashes for asides and pivots. |
| `78693ffe-f512-45fa-9e64-0435fc88c778` | general/voice-calibration | Verify claims before asserting them. Don't suggest things the company likely already does. Don't cl… |
| `8fc6212e-f4f8-4c55-bdc4-4182594cad10` | general/voice-calibration | Standard capitalization at sentence start (~99%). Selective ALL CAPS for emphasis on single words, … |
| `9fb3befe-ae86-4d3f-918c-1e1f794e4bce` | general/voice-calibration | Explaining/persuading: longer messages (80-200 chars), 'I mean' as pivot not filler, em-dashes and … |
| `a808a71d-6b1c-4766-add1-9225d80e6109` | general/voice-calibration | 'Haha' > 'lol' > 'lmao' for laugh markers. Almost never emoji alone for laughter. |
| `ab5b7811-82fd-434e-a95a-e6efbdbb8e05` | general/voice-calibration | Declaratives reserved for things actually known or felt strongly: 'definitely', 'for sure', '100%'. |
| `ba1b7231-2561-41da-b519-9a1544199495` | general/voice-calibration | Never use 'folks' — it's 'people', 'y'all', or 'everyone'. Never use 'feel free to' — just tell the… |
| `c2285532-82e4-4a8e-b451-21b739e07caa` | general/voice-calibration | Casual/banter: opens with Yo/Hey/So/Dude/Wait, closes with no punctuation (76%), contractions alway… |
| `e142e8b1-e2b2-4973-b693-9f0ecac9d9a1` | general/voice-calibration | Never use 'that being said', 'having said that', 'furthermore', 'moreover', 'additionally'. |
| `e258ab1e-93f6-4e55-9cbe-acf4e4d8b9a9` | general/voice-calibration | Professional/outreach: capitalization and punctuation more conventional, still avoids periods on ca… |
| `e296bbde-692c-44ea-b9e2-391f90615a2f` | general/voice-calibration | Never use 'I hope this message finds you well' or any corporate opener. |
| `e5adbf02-55ea-4c58-a42b-4b7ff51b3a90` | general/voice-calibration | Logistics/planning: direct but warm. Softened asks ('Any chance you could...', 'Mind if I...'). 'Le… |
| `rule-voice-close-with-curiosity` | outreach/Voice DNA | Close with genuine curiosity, not a pitch. Turn your insight into an open question that invites the… |
| `rule-voice-conversational-entry` | outreach/Voice DNA | Enter mid-thought. Use conversational openers ("Yeah and", "And I think") that drop the reader into… |
| `rule-voice-think-aloud-rhythm` | outreach/Voice DNA | Show the thought forming: use parenthetical hedges ("probably even 2x…"), ellipsis as gear shifts, … |
| `56f2ca15-7b15-428f-8783-69554cc18da5` | outreach/instruction-leakage | Do not mention internal outreach constraints in the outward message. If a contact is on a different… |
| `d2719f3b-0fd9-403f-b816-e51a39c8a59f` | outreach/kill-words | Do not use 'feels' as a soft claim in professional outreach. Replace it with a concrete observation… |
| `eb81c1ae-3449-4b6a-8dcb-12bdd6180696` | outreach/punctuation | Avoid colon-as-reveal in outreach. If a sentence uses a colon to set up the interesting point, spli… |
| `2d13810c-b778-4ecc-a76f-bfe78953d8dc` | outreach/structure | In why-now answers (referrals, cover letters, outreach), frame timing around the employer's need, n… |
| `381b97c1-8a07-46a4-8627-a2cc7df9e1de` | outreach/structure | If a personal-experience bridge feels tenuous, do not force it. Use the outside source or market in… |
| `a2419efe-ce8f-4d5a-819b-c081fbfe638f` | outreach/structure | When a recent article or interview sharpens the company thesis, do not imply it caused the outreach… |
| `e45d4e5a-3c3a-4bcb-88da-a4acb3c8a7c0` | outreach/structure | A company-interest paragraph should be about the company, product, market, and customer/client chal… |
| `62570756-e6cd-42a8-9133-901dfa5e1935` | outreach/tone | Match tone to medium. A Twitter DM is not a cover letter. An outreach email is not a formal applica… |
| `56af8af0-0c93-448d-b2a2-19ca02e5373d` | outreach/voice-calibration | Do not use bridge phrases like 'a version of that problem' or 'a different version of the same thin… |
| `9b4f1bac-517b-4aa6-aab9-2ba0c526202c` | outreach/voice-calibration | When outreach content is factually relevant but reads like AI, do not polish the same explanatory p… |
| `f5be511e-7231-4198-b492-97f0ecccbfe9` | resume/kill-words | No product-thought-leadership jargon on resumes: 'feature-factory', 'outcome-first discovery', 'met… |
| `508db001-92e8-434a-a82d-b54c7a1330e2` | resume/structure | Resume bullets must use the Arnous/Tarnell ownership-shape voice: past-simple ownership verb first … |
| `50fb62ea-b873-4375-9f6d-409a64a4428a` | resume/structure | Never include executive-endorsement claims ('the COO endorsed it', 'leadership approved', 'praised … |
| `bc2f3947-d3fe-4ebf-9622-fb8ad4cc6306` | resume/structure | Diagnosis verbs (Diagnosed, Identified, Analyzed, Investigated) are not outcomes and cannot carry a… |
| `c2a4ecaf-d530-4e1d-a7e5-7cad743734f5` | resume/structure | Bullets within the same role section must be MECE: each owns one distinct territory (e.g. measureme… |
| `0c00024d-ce8d-4e81-beb5-77e3fbabfc71` | resume/voice-calibration | Resume summaries must not open with an identity-statement that mirrors the target JD's language bac… |

Note on the bulk `general/ai-slop` and `general/kill-words` word-ban rows (from `seed-antislop`/`kill-words-seed`, ~120 of the 228 KEEP rows): these are legitimate, correct, and non-duplicative in the sense that each targets a distinct word or phrase. But they're structurally thin — one banned word, a one-line rationale, no `when_to_apply`, no real `why` beyond a bare probability score. They function collectively as a flat kill-list rather than as individually rich rules. Keeping them is correct (each is a real, narrow, checkable instruction), but they inflate the 293-row count relative to how much distinct judgment they encode — see Coverage gaps below for the practical implication.

## MERGE (14 rules)
| id | type/category | rule (short) | merges into | why |
|---|---|---|---|---|
| `78f2406f-c5fd-4245-8335-b57a0f196284` | cover-letter/kill-words | Never use 'genuinely' — it is AI slop filler that adds no meaning | `02db1ed6-145f-4f64-b4f3-e13b79400ac3` | Never use 'genuinely' — it reads as AI slop filler |
| `ab2adfd0-2d89-45d1-b511-7a8544ef2d61` | cover-letter/structure | Don't tell the audience things they already know about their own comp… | `rule-audience-dont-explain-their-business` | Never explain a company's own business model, metrics, or p… |
| `00efa4d3-243f-4080-b100-b7b59f17d163` | general/structural-craft | Claims need evidence. Unsupported assertions lose the reader. | `rule-argument-completeness` | Expand assertions with evidence, cover counterpoints, and a… |
| `196b538f-d1cc-441d-b2e8-8289ef709b29` | general/kill-words | AI throat-clearing — just state the point | `bc76f59e-cb36-4e46-967a-81a442d6d1aa` | AI throat-clearing — just state the point |
| `4c5b705c-9e45-4b01-afc6-92091e2ef4e4` | general/ai-slop | Kill significance-announcing preambles — flagging a point as importan… | `cce87f3a-9755-426a-973f-9d45e5717f8c` | Demonstrative significance-pointers (that's the part, the t… |
| `ab88ce7f-9f3f-4b52-ba64-ee4134444938` | general/ai-slop | Soft-claim verb plus category noun ('X feels relevant to the kind of … | `9d0dbb4a-da37-4b54-b60e-34b9cef42dfc` | The master AI tell is hedge-and-point: soft verbs (feels, s… |
| `c2cad5e5-4e5c-402c-9b94-5b28e658a1fe` | general/structural-craft | Add links for referenced work. Readers who want depth should be able … | `rule-linking-references` | Add hyperlinks when citing named frameworks, people, or ext… |
| `c6510717-ac9a-43f7-b690-b36258484ab0` | general/kill-words | AI significance cliche — show don't tell | `4de09d04-ff2a-4f0a-ad8f-d8559f0163c4` | AI significance cliche — show don't tell |
| `rule-ai-slop-detection` | general/ai-slop | Eliminate sentence patterns that signal AI-generated text. | `e23dac60-6426-4be9-8524-1acfc3fd6159` | Kill negative parallelism: "it's not X, it's Y" / "the hard… |
| `07fc1d46-1eeb-4eee-b774-2cd1d88258bf` | outreach/structure | First mention of any company, product, or internal name in applicatio… | `77221994-b9a6-428e-ae41-95dd0eaf2a1d` | Reader empathy: first mention of ANY company, product, acro… |
| `41fe538d-7e82-4ace-81ef-7d117b4215cb` | outreach/voice-calibration | For company outreach, do not turn the research read into a polished e… | `9b4f1bac-517b-4aa6-aab9-2ba0c526202c` | When outreach content is factually relevant but reads like … |
| `4958605a-fb99-41d3-97f1-ad2865c40593` | outreach/kill-words | Use 'use' instead of 'leverage' — 'leverage' is corporate jargon | `839c552c-cd85-4b5c-93ed-57279ff8eeb7` | Business jargon verb — use 'use' or be specific |
| `7c5dbbea-41ca-4810-9663-6274f43b5754` | outreach/structure | Do not talk at the recipient about their own company. A company-inter… | `e45d4e5a-3c3a-4bcb-88da-a4acb3c8a7c0` | A company-interest paragraph should be about the company, p… |
| `rule-avoiding-rudeness` | outreach/tone | Do not write anything that assumes familiarity or dismisses the reade… | `62570756-e6cd-42a8-9133-901dfa5e1935` | Match tone to medium. A Twitter DM is not a cover letter. A… |

Merge reasoning detail:

- `78f2406f` -> `02db1ed6` — identical "never use genuinely" rule stated twice with near-identical wording and the same example pair. Keep `02db1ed6` (marginally tighter phrasing).
- `ab2adfd0` -> `rule-audience-dont-explain-their-business` — same underlying rule (don't recite the reader's own business back to them), same Crusoe example, filed under two different categories (structure vs Audience awareness). Keep the shorter, category-correct version.
- `00efa4d3` -> `rule-argument-completeness` — near-identical "claims need evidence" statement with no example, strictly thinner than the target.
- `196b538f` -> `bc76f59e` — two seed-antislop rows with byte-identical rule_text ("AI throat-clearing — just state the point") for two different banned phrases ("it's important to note" vs "it should be noted"). These should really be one row with two example_before variants, not two rows.
- `4c5b705c` -> `cce87f3a` — "kill significance-announcing preambles" and "demonstrative significance-pointers are throat-clearing" describe the same phenomenon (announcing importance instead of being important) with overlapping example phrases ("what I keep coming back to").
- `ab88ce7f` -> `9d0dbb4a` — "soft-claim verb plus category noun" is a specific instance of the broader "hedge-and-point" master-tell rule; the umbrella rule already covers this case.
- `c2cad5e5` -> `rule-linking-references` — duplicate "add links for references" rule under a different category name, no example vs. the target's clean example.
- `c6510717` -> `4de09d04` — two seed-antislop rows with byte-identical rule_text for two different banned phrases ("serves as a testament" vs "stands as a beacon").
- `rule-ai-slop-detection` -> `e23dac60` — generic restatement of the negative-parallelism rule using the exact same before/after example, just less specific in its rule_text.
- `07fc1d46` -> `77221994` — outreach-scoped version of the general first-mention-context rule; same underlying instruction, narrower writing_type.
- `41fe538d` -> `9b4f1bac` — two rows generated from the same Yext outreach correction session, saying "rewrite the polished explanatory paragraph into one human observation" in near-identical terms.
- `4958605a` -> `839c552c` — outreach-scoped "leverage -> use" ban duplicates the general kill-words version of the same ban.
- `7c5dbbea` -> `e45d4e5a` — both say "the company-interest paragraph should be about the company/market, not the writer," derived from the same Yext draft, with overlapping example text.
- `rule-avoiding-rudeness` -> `62570756` — the "no hard feelings" correction is one of four examples already folded into the broader tone-match-to-medium rule; standalone it adds nothing the umbrella rule doesn't already say.

## REWRITE (3 rules)

**`rule-positioning-reader-value`** (cover-letter/positioning) — right idea, no usable example (the "before" is just the label "Why me specifically:", not a real flawed sentence).

Proposed rewrite: *"State your experience as what the company gets, not as self-promotion. Replace 'why I'm a fit' framing with what problem you'd solve for them."*

**`f8146e3d-c2b1-431e-a75c-069f5e43326f`** (general/ai-slop) — correct and important content (kill structural symmetry / "the part X, the part Y" framing), but it's an overstuffed single rule bundling three unrelated things: the symmetry-frame ban, a grab-bag of five unrelated kill-phrases ("landed well," "maps directly," "sit with it," "an honest read," "things to name"), and an implicit ban on "X rather than Y." It should be split, but per the ≤2-sentence rewrite constraint here's the trimmed core:

Proposed rewrite: *"Kill balanced/parallel sentence structures — 'the part X / the part Y,' 'X rather than Y,' mirrored matching clauses. Make one point and move on instead of pairing it with a symmetric second point."* (The five orphaned kill-phrases should become their own kill-words rows, not ride along on this one.)

**`rule-inclusive-framing`** (general/inclusive-framing) — the underlying instinct (consider what a strong claim excludes) is reasonable, but the example is weak: "The engineer is becoming the steersman. And anyone can be an engineer." doesn't clearly demonstrate why the addition strengthens the claim, and it risks encouraging exactly the kind of hedge-tacked-on ending that other KEEP rules (e.g. `9d0dbb4a`, the master hedge-and-point rule) tell you to cut. This rule sits in tension with the hedging rules.

Proposed rewrite: *"Before finalizing a categorical claim, check whether it unintentionally excludes a reader who belongs in it — but don't add a hedge sentence to fix it; fix the original claim's scope instead."*

## DROP (48 rules)
| id | type/category | rule (short) | reason |
|---|---|---|---|
| `e2eb42862cdf4391884d2b86d6993e48` | general/ai-slop | Keep the dead metaphor rule as-is. Add a separate must-fix rule: 'Fir… | Meta-instruction about editing another rule and the DB schema, not a writing rule itself; its actual content (first-mention context for named products) duplicates KEEP rule 77221994. |
| `3cbe28be-c240-405f-aeca-13376f46f3dc` | general/argument-rigor | Cover the full argument space. Partial coverage weakens the argument. | No when_to_apply detail beyond one clause, no example, restates rule-argument-completeness with less content. |
| `02862d65-3e58-4d38-a825-52b0b898a011` | general/auto-synthesized | Negative parallelism. | Raw correction note ('Negative parallelism.') with no rule statement; content already covered by KEEP rule e23dac60. |
| `0348e695-1c40-4ae9-8929-a6bb0e10d749` | general/auto-synthesized | Should start with “I’ve been following [Company]…” Then it should des… | Prescribes one specific outreach template verbatim (a formula, not a principle) — rule_too_vague / over-fit to a single draft. |
| `08d9ae5a-bb33-4fd8-990e-118786ba5969` | general/auto-synthesized | This kind of misrepresents product operating processes/models | Raw correction fragment ('This kind of misrepresents...') with no generalizable rule stated. |
| `09ddc04e-eebb-4d17-82a1-22ff9c763850` | general/auto-synthesized | NOT FEEDBACK, A REQUEST/PROMPT: are these (meaning: all numbers/stats… | Explicitly labeled by its own author as 'NOT FEEDBACK, A REQUEST/PROMPT' — a one-off content instruction, not a writing rule. |
| `1526562a-eda4-4649-a318-00d8df178346` | general/auto-synthesized | Replace rule text with a concrete structural description and add a re… | Meta-instruction telling a future editor to rewrite this very row with a regex; never actually executed. Content (negative parallelism) already covered by e23dac60. |
| `1530b21d-bc5e-4328-9447-63d02012d9f7` | general/auto-synthesized | I had learned* | Single word-swap note ('I had learned*') with no context or generalizable principle. |
| `159ace7b-f0ed-4526-8f1b-7f3d2567db7b` | general/auto-synthesized | This is a bad CTA/follow up (too vague/high level and puts work on th… | One-off critique of a specific CTA sentence in one draft, not a generalizable rule. |
| `2586ed84-1003-466d-9904-fb334d6f4c19` | general/auto-synthesized | we should never quantify things like amount of time spent in discover… | One-off content-strategy note about how to frame discovery work in one document, not a prose-craft rule. |
| `3374b00e-8938-47d0-9434-2aa3b0556449` | general/auto-synthesized | Why the fuck would it make me walk away less interested? why would i … | Raw correction note (with profanity) about one sentence in one draft; underlying pattern (negative parallelism) already covered by e23dac60. |
| `3f78a92b-2e2c-4bb4-ad8d-dfbe6600202e` | general/auto-synthesized | NOT FEEDBACK ON WRITING STYLE/RULES; A REQUEST/PROMPT/ADD’l CONTENT N… | Explicitly labeled 'NOT FEEDBACK ON WRITING STYLE/RULES' by its own author — a content/strategy note, not a writing rule. |
| `40d5d619-3acc-4b8d-8486-199ee49967ea` | general/auto-synthesized | "And when they do, they stop filtering what they tell you." | Field-mapping inversion: example_before here stores the corrected/good line, not the flawed one. See INVERT note below — DROP this row and its sibling 70956c93a3a94f5488ce03c04e0d5133 rather than let either apply as a live guard. |
| `48692377-c29d-4732-9e06-bad23fbd438a` | general/auto-synthesized | This sample is pretty good! | Content is literally 'This sample is pretty good!' — praise for a specific sample, not a rule. |
| `4c83b83bfc0d4a5e93f1b34d83ee97e1` | general/auto-synthesized | Replace the rule text with an actionable pattern description: 'Do not… | Meta-instruction telling a future editor to rewrite this row; the actual proposed rule (don't recite the company's business model back at them) duplicates KEEP rule rule-audience-dont-explain-their-business. |
| `5ea1e611-2844-4180-a19d-3ed7705f7cb7` | general/auto-synthesized | NOT FEEDBACK, A REQUEST/PROMPT: I wrote about this and worked on this… | Explicitly labeled 'NOT FEEDBACK' — a content-sourcing note about applied-AI material, not a writing rule. |
| `629eb961-5651-4df2-99b1-b063dd3da0fe` | general/auto-synthesized | Rewrite rule text to encode the abstract pattern: 'Avoid superlative … | Meta-instruction telling a future editor to rewrite this row's rule_text; never executed. Underlying idea (avoid superlative opens) is a plausible REWRITE candidate but this row is the un-rewritten instruction-to-rewrite, not a rule. |
| `67de9486-8a65-436b-8a0d-7a7026300497` | general/auto-synthesized | NOT FEEDBACK ON WRITING STYLE/RULES, A REQUEST/PROMPT/ADD’l CONTENT N… | Explicitly labeled 'NOT FEEDBACK ON WRITING STYLE/RULES' — a content-strategy note about pulling in research, not a writing rule. |
| `6d3ffb20-9759-49a0-b3cc-3541f253e64d` | general/auto-synthesized | NOT FEEDBACK ON WRITING STYLE/RULES; A REQUEST/PROMPT/ADD’l CONTENT N… | Explicitly labeled 'NOT FEEDBACK ON WRITING STYLE/RULES' — a content note about a specific idea's provenance, not a writing rule. |
| `6e0ec143-85c0-44c5-a3e1-3dc598f4a9ff` | general/auto-synthesized | I was reviewing my notes and one part that stuck with me was [specifi… | Raw phrasing swap for one specific sentence, no generalizable principle stated. |
| `6eeb5332-eb2d-4288-b45b-c7cbad0437e8` | general/auto-synthesized | I’m not a PM and I’m not wrapping up a stretch but I am actively look… | One-off content-framing note about how to describe Sam's job-search status in one outreach message, not a prose-craft rule. |
| `70956c93a3a94f5488ce03c04e0d5133` | general/auto-synthesized | Swap the fields so `example_before` = 'They stop filtering what they … | This row is itself Margin's own auto-repair diagnostic flagging the field-mapping inversion in 40d5d619 (and asking that other auto-synthesized rows be audited for the same bug) — valuable as a bug report, not usable as a live writing rule. Action item, not a rule. |
| `7265f8e0-aa39-4d8d-8c4f-5e01687705a0` | general/auto-synthesized | Split into two concrete rules: (1) 'Avoid staccato rhythm: no more th… | Meta-instruction proposing to split into two other rules; never executed. The two proposed ideas (staccato-rhythm limit, show-don't-tell for vague impact claims) are plausible future REWRITE/new-rule material but this row itself is an unexecuted editorial instruction. |
| `78c1e3df-0990-47bd-b31e-f840b6fc428d` | general/auto-synthesized | This passages contains multiple examples of a pattern that sounds lik… | Rambling meta-commentary about a pattern ('X is true, but Y...') with a caveat that it's fine 'once' — too hedged and unstructured to apply as a rule; overlaps with e23dac60/f8146e3d territory anyway. |
| `78d8cfdb-5f7b-4711-b16d-29c879da4549` | general/auto-synthesized | Update rule_text to: 'avoid em-dash + "because I [verb]" self-justify… | Meta-instruction to update rule_text with a specific regex; never executed, and it's an oddly narrow pattern (' — because I do') to enshrine as its own rule. |
| `7e970c9b-65fb-43da-be0b-7fd507fd50ca` | general/auto-synthesized | hyperbolic statements like these are incredibly hard to pay off and s… | Rambling correction note that talks itself out of its own point ('many many people do actually say that') — doesn't land on a stable, generalizable instruction. |
| `824a4bb2-87b8-4805-8904-f70e2b63e534` | general/auto-synthesized | this is retarded - it just repeats to the hiring manager what hte rol… | Raw correction note (with profanity) about one specific sentence in one draft, not a generalizable rule. |
| `8cda060b-6c6b-4dcc-b35a-aadf96e94671` | general/auto-synthesized | Howdy all! | Content is 'Howdy all!' vs 'Hey everyone' — an isolated greeting-word swap with no stated rationale or generalizable principle. |
| `9b6118233db94e26a4719f2a08e3c2b2` | general/auto-synthesized | Add a generalized pattern to the rule text that names the class: 'Avo… | Meta-instruction to add a generalized pattern to another rule's text; never executed. Underlying idea (avoid 'X nobody mentions' hyperbole) overlaps with existing ai-slop rules. |
| `a74ffcda-002d-4f29-9e12-32ac4e70394b` | general/auto-synthesized | Split into two atomic rules: (1) category='filler-intensifiers', rule… | Meta-instruction to split into two other rules with specific category/rule_text values; never executed, and the two proposed atoms (kill 'actually', limit colons) already exist as KEEP rules elsewhere (8ad48e27, 8ac6fa13). |
| `bcba3d3f-0743-40fa-af65-f6e19f436f21` | general/auto-synthesized | Test margin note from repair session | Literally 'Test margin note from repair session' — a test/debug artifact left in the table, not a rule. |
| `c1acf37a-3046-4183-afe4-ae52de088438` | general/auto-synthesized | This is a little nit picky but pretty hard to follow/grok what the wr… | Vague meta-commentary ('a little nit picky', 'likely needs a little more empathy') with no concrete instruction extractable. |
| `c674fd3b-6396-4409-bb1f-aaad0f4a8a44` | general/auto-synthesized | Way too long, em dash, buried the impact. Should be more like “Lifted… | One-off critique of a single resume bullet with a specific suggested replacement; the generalizable pieces (cut em dash, lead with impact) already exist as KEEP rules (c893a418, bc2f3947). |
| `cdc5c9bcc5bb4e2eb0ae94afd7446ecb` | general/auto-synthesized | Add both additional instances as separate examples on the rule, or re… | Meta-instruction proposing two possible fixes (regex or rule-split) for another row; never executed, purely an editorial to-do. |
| `ce659679-909a-4f15-9828-29230ff3f12a` | general/auto-synthesized | I wouldn’t say that a follow up to an interview is casual. Given that… | One-off correction about a specific follow-up email's opening line; the generalizable point (don't treat a post-interview follow-up as casual) is thin and content-specific rather than a durable craft rule. |
| `db496269-23c1-40b8-a017-5175f1c10fbf` | general/auto-synthesized | “is the kind of X that…” is an ai tell, it reads like slop. this is a… | Rambling raw note that restates 'is the kind of X' as an AI tell (already a KEEP rule, 85382383) plus vague additional asks ('should likely be followed up...') that don't resolve into a rule. |
| `dce78420-5ec2-4ab8-bd04-4bbbcfc148dc` | general/auto-synthesized | dipping my toe into | Bare phrase swap ('dipping my toe into' -> 'doing') with zero context, why, or generalizable pattern. |
| `e2be5f5d-3257-433c-900a-4cc6bab18fe7` | general/auto-synthesized | cover letters should include my strengths as described by me peers. t… | Rambling one-off note about weaving peer feedback into a specific cover letter; the generalizable content-sourcing point (don't say 'my peers described me as') is buried in unstructured self-correction. |
| `eef2627e-59d1-42c9-823d-4d8ad1a738aa` | general/auto-synthesized | any mandated usage. | Bare phrase swap ('a mandate' -> 'any mandated usage') with no context or rationale. |
| `f12889c0-8fb4-4f2c-bf98-f4ae0a127c17` | general/auto-synthesized | That’s all | Bare phrase swap ('That's it' -> 'That's all') with no context or rationale. |
| `f62a5cb6-367e-436b-aa97-dc33d963965f` | general/auto-synthesized | I hate this intro. why? (1) it just repeats stuff from the role direc… | Raw correction note about one cover-letter opening line; the generalizable points (don't recite the company's own product back at them, don't frame their need as a weakness) already exist as KEEP rules (rule-audience-dont-explain-their-business and similar). |
| `f8a087cb-fdd3-4182-92e9-0fb14e66791d` | general/auto-synthesized | This might be better framed as the activities/process behind service … | One-off content-strategy note ('look it up', 'framed as the activities/process behind service innovation') specific to one cover letter draft, not a prose-craft rule. |
| `f8d9efc3-3c70-4fd7-9b83-ff2cd0b504cd` | general/auto-synthesized | we should follow this up with a real description or example of how it… | Raw correction fragment ('we should follow this up with a real description...') with no stated generalizable rule. |
| `f9b45000-c668-4677-9f5c-8f8b0deae634` | general/auto-synthesized | Need punctuation. Also this is a really bad CTA needs to provide valu… | One-off critique of a specific CTA sentence ('needs punctuation', 'bad CTA') in one draft; too content-specific to generalize as written (compare to the cleaner KEEP CTA/tone rules in outreach). |
| `faae0048-9a85-444b-8982-48c217a9eb9b` | general/auto-synthesized | I wasn’t shipping production code or anything close. | Bare phrasing tweak ('I wasn't shipping production code' -> 'or anything close') with no stated rationale. |
| `381ff67f-6244-497e-ab7d-4fb7768b3c0a` | general/editorial | Run /writing-quality-gate on all professional content before submissi… | Process pointer to run a specific internal skill/tool ('/writing-quality-gate'), not itself a writing rule — a workflow instruction that belongs in tooling docs, not the rules table. |
| `ec27202197a6735e5c4182733930bd5e` | general/kill-words | crisis | Single banned word ('crisis') with zero when_to_apply/why/example. 'Crisis' is a legitimate word in plenty of legitimate contexts (a real crisis); banning it context-free risks false-positive flags with no guidance on when it's actually a problem. |
| `da16d1cd-776f-409a-8f8a-c2765c779bf9` | outreach/voice-calibration | When Sam rewrites outreach into a simpler conversational shape, prese… | One-off editorial note about preserving one specific Yext draft's structure during a rewrite pass; not a generalizable rule (the generalizable adjacent point already exists in KEEP rules 9b4f1bac/56af8af0). |

Pattern in the DROP pile: 45 of 48 DROP rows (94%) are `general/auto-synthesized` — every single row in that category is either (a) a raw, unedited correction note copy-pasted from Sam's feedback (sometimes with profanity, sometimes explicitly self-labeled "NOT FEEDBACK, A REQUEST/PROMPT"), or (b) a meta-instruction telling a *future* editing pass to rewrite/split/regex-ify the row — none of which were ever executed, so the category is 43 half-finished repair tickets sitting in the table disguised as rules. The other 3 DROP rows are one process-pointer (run `/writing-quality-gate`, not itself a rule), one context-free banned word ("crisis"), and one one-off draft-preservation note.

## Contradictions

1. **`6244040b-64b3-4dbf-9d86-d3ecdc0aa140` (voice-calibration) vs. `9d0dbb4a-da37-4b54-b60e-34b9cef42dfc` and `6cb410e6-8953-4322-bf9e-09a52a810d99` (ai-slop).**
   `6244040b` says Sam's authentic texting voice "hedges 3.6x more than declares" and that "I think / probably / maybe / kinda" are *load-bearing* words, not a defect, derived from 168k real messages (seed-v1). `9d0dbb4a` calls the same class of words ("feels, seems... usually, sometimes, often, typically") "the master AI tell" that should be cut and replaced with a flat, committed claim; `6cb410e6` independently bans "usually/sometimes/often/typically" outright. All three rows are `writing_type=general`, so nothing in the schema tells a rule-applying pass which one governs a given piece of text. On a casual message this is fine (voice-calibration wins by convention), but on borderline registers — a semi-formal outreach note, a Slack-style but professional email — Margin has no field-level way to know it should suppress the ai-slop hedging rule in favor of the voice-calibration one. This is the highest-value fix in the whole audit: either scope voice-calibration rules to a register/channel field, or add an explicit precedence note.

2. **`320a9339-bf28-4d15-9eac-1423b7c9df67` ("almost never end messages with periods," voice-calibration, general) vs. `43d900c7-dfb3-4d51-839b-cb545bf3ab88` ("read aloud, would you say this at a coffee shop," editorial, general) and cover-letter/resume rules that assume standard punctuation.**
   Not a hard logical contradiction, but the same scope gap as above: both are `writing_type=general`, yet one is clearly about casual/texting register and the other about professional prose. A pass that applies all `general` rules uniformly to, say, a cover letter draft would try to strip trailing periods, which no other cover-letter rule condones. Flagging for the same fix as #1 — register/channel scoping is missing throughout `voice-calibration`.

3. **`fa98f7bd-cec0-49f1-a1ce-4c655d55e31f` ("never modify user/stakeholder quotes") is fine on its own, but note it as the resolving rule for a *near*-miss**: several kill-word bans (e.g., "genuinely," "leverage," "delve") could in principle collide with a quoted source that uses those words. `fa98f7bd` already resolves this correctly by scoping kill-words to "Claude's prose" only — flagging here just to confirm it's the rule doing the disambiguation work, so it should never be merged away or dropped even though its own example is thin.

## Coverage gaps

- **`voice-calibration` (30 rows, all `general`, all `seed-v1`, signal_count up to 12) is the single heaviest-signal category with the least differentiation from the ai-slop rules it sits next to.** It encodes a real and valuable asset — a statistically-grounded profile of Sam's authentic texting voice from 168k messages — but nothing in the schema marks these rows as "casual/personal register" vs. the professional-prose rules living in the same `general` bucket. This is the gap behind both contradictions above. A `register` or `channel` column (casual / professional / outreach / resume) would resolve most of it without touching content.
- **`structure` and `structural-craft` are split across two category names for what's clearly one concern** (topic-sentence fulfillment, argument support, sentence flow, linking). Nine total rows spread across two near-synonymous categories with no cross-reference. Low signal_count individually, but the underlying correction pattern (Sam repeatedly flagging structural/flow problems) is one of the highest-signal patterns in the whole table when you add up `structure` (12, 8, 10 signal counts) — worth consolidating into one category.
- **`argument-rigor` vs `argument-completeness` vs `structural-craft`'s "claims need evidence"** are three near-identical "back up your claims" rules under three different category names (see MERGE for one; the other two survive as KEEP but arguably belong in one category with one canonical rule and 2-3 supporting examples, not scattered).
- **Outreach voice-calibration (`Voice DNA` category, 3 rows) is thin relative to its evident importance** — it's the most distinctive, hardest-to-fake material in the whole table (mid-thought entry, think-aloud rhythm, curiosity-close), sourced from a single real outreach sample (Cold_Outreach_Nan_Yu), and there are only 3 rows capturing it. Given how much weight "does this sound like Sam vs. AI" carries in outreach specifically, this deserves more source samples, not just three signal_count=1 rows.
- **No cross-writing_type dedup mechanism exists.** Multiple MERGE pairs above (the "leverage" ban, the first-mention-context rule) are the *same* rule duplicated once under `general` and once under `outreach` or `cover-letter`. There's no schema convention for "this rule applies to all writing_types unless overridden," so every new writing_type re-invents rules that already exist in `general`.

## Bottom line

Of 293 rows, 228 (78%) are usable as-is, 14 more (5%) survive after merging into an existing KEEP row (so the deduplicated KEEP set is effectively 228, since the merge targets are already counted there), 3 (1%) need a light rewrite before they're trustworthy, and 48 (16%) should be deleted outright — nearly all of them (45) coming from a single `auto-synthesized` category that turns out to be entirely unexecuted repair tickets and raw correction notes rather than actual rules, including the row that documents its own field-mapping inversion bug. After cleanup, the clean core is roughly **228-231 rules** (KEEP plus the 3 rewritten), a meaningful drop from 293 but a smaller cut than the raw DROP count implies, because most of the volume lives in the large, individually-thin-but-individually-correct `ai-slop`/`kill-words` word-ban lists, which survive untouched. The real yield of this audit isn't the count — it's that the entire `auto-synthesized` category (43 rows) can be deleted in one pass with high confidence, and that the `voice-calibration` category needs a register/scope field before its 30 rules stop quietly contradicting the `ai-slop` hedging rules on borderline text.

---

## Apply log (2026-07-08)

Applied by the portfolio-CEO session on Sam's "yes". DB backup: `~/.margin/margin.db.bak-20260708-rules-audit`.

- DROP: 47 deleted (the 48th, the test artifact `bcba3d3f`, was already removed on 2026-07-05)
- MERGE: 14 deleted; each target's `signal_count` incremented by the merged row's count; distinct `example_before` variants preserved in the target's notes
- REWRITE: 3 rule_texts replaced with the proposed rewrites, `reviewed_at` stamped
- NEW: 1 kill-words row rescuing the five orphaned phrases from `f8146e3d` ("landed well", "maps directly", "sit with it", "an honest read", "things to name")
- Register scoping (contradiction #1/#2 fix, data-level): 22 voice-calibration rules prefixed in `when_to_apply` with a casual-register-only scope; the two ai-slop hedge rules (`9d0dbb4a`, `6cb410e6`) annotated with the reverse precedence. A proper `register` column remains the schema-level fix (Horizon 1 enhancement, must go through Rust migrations).
- Final count: **232 rules** (was 293 at audit time). `auto-synthesized` category: empty.
- `margin export profile` re-run — `~/.margin/writing-rules.md` and the writing guard regenerated from the clean corpus.
