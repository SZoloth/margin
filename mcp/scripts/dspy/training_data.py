"""Training data expansion for DSPy optimization."""

import json
from pathlib import Path

ADVERSARIAL_PROMPTS: dict[str, str] = {
    "general": "Write a 200-word blog intro about why product managers should learn to code",
    "email": "Draft a follow-up email after a job interview at a company you're excited about",
    "cover-letter": "Write an opening paragraph for a PM role at Stripe",
    "outreach": "Draft a cold LinkedIn message to a VP of Product at a Series B startup",
    "prd": "Write the problem statement section for a feature that adds dark mode",
    "blog": "Write a paragraph arguing that most product roadmaps are theater",
    "resume": "Write a bullet point for leading a product redesign that increased retention 15%",
    "slack": "Write a message asking your team to review a doc before Friday",
    "pitch": "Write the opening of a pitch deck for a reading annotation tool",
}

REGISTER_MAP: dict[str, str] = {
    "general": "casual",
    "email": "casual",
    "slack": "casual",
    "outreach": "casual",
    "pitch": "professional",
    "prd": "professional",
    "cover-letter": "professional",
    "resume": "professional",
    "blog": "professional",
}

# Hand-crafted prompt variations per writing type
_VARIATIONS: dict[str, list[str]] = {
    "general": [
        "Write a 200-word blog intro about why product managers should learn to code",
        "Write 150 words on why side projects make better PMs",
        "Draft a short blog intro arguing that the best PMs ship code, not decks",
        "Write a 200-word take on why technical literacy matters for product people",
        "Write an intro paragraph for a post about building tools for yourself as a PM",
        "Draft 200 words on the difference between understanding code and writing it",
        "Write a blog opener about why frameworks are the enemy of good product thinking",
        "Write 150 words on what PMs get wrong about technical debt",
        "Draft a short intro arguing that writing specs is a form of programming",
        "Write 200 words on why the best product decisions are informed by implementation cost",
    ],
    "email": [
        "Draft a follow-up email after a job interview at a company you're excited about",
        "Write a thank-you email after a panel interview with three people",
        "Draft a follow-up email after a phone screen where the role shifted from what was posted",
        "Write an email to a recruiter asking for timeline clarity after a final round",
        "Draft a follow-up email mentioning a specific idea you discussed in the interview",
        "Write a brief email declining an offer while keeping the door open",
        "Draft a check-in email two weeks after submitting an application with no response",
        "Write a follow-up email after meeting a hiring manager at a conference",
        "Draft an email asking to reschedule an interview due to a conflict",
        "Write a thank-you email that references a shared interest discussed during the interview",
    ],
    "cover-letter": [
        "Write an opening paragraph for a PM role at Stripe",
        "Write an opening paragraph for a senior PM role at Figma focused on developer tools",
        "Draft the first paragraph of a cover letter for a growth PM position at Notion",
        "Write an opening paragraph applying for a PM role at a climate tech startup",
        "Draft a cover letter opener for a product role at a company you've used as a customer",
        "Write the first paragraph for a PM application at an AI tools company",
        "Draft an opening paragraph for a lead PM role at a Series A dev tools company",
        "Write a cover letter opener for a PM role where the job post emphasizes user research",
        "Draft the first paragraph applying for a product role at a media tech company",
        "Write an opening paragraph for a PM role at a company rebuilding a legacy product",
    ],
    "outreach": [
        "Draft a cold LinkedIn message to a VP of Product at a Series B startup",
        "Write a networking message to a PM leader you admire but have never met",
        "Draft a LinkedIn message to an ex-colleague who moved to a company you're targeting",
        "Write a brief outreach message to a founder whose product you use daily",
        "Draft a cold message to a hiring manager whose team just posted a PM role",
        "Write a LinkedIn note to a product leader after commenting on their blog post",
        "Draft an outreach message to someone who spoke at a product conference you attended",
        "Write a brief networking message referencing a mutual connection",
        "Draft a cold LinkedIn message to a CPO at a company with no open roles yet",
        "Write an outreach message to a PM who wrote something you disagreed with publicly",
    ],
    "prd": [
        "Write the problem statement section for a feature that adds dark mode",
        "Write the problem statement for a feature that lets users export data as CSV",
        "Draft the problem statement section for adding collaborative editing to a notes app",
        "Write the problem statement for a notification preferences overhaul",
        "Draft the problem section for adding keyboard shortcuts to a web app",
        "Write the problem statement for a feature that syncs reading progress across devices",
        "Draft the problem statement for reducing onboarding time from 10 minutes to 2",
        "Write the problem section for adding search to a document library",
        "Draft the problem statement for a feature that auto-tags content by topic",
        "Write the problem statement for rebuilding a settings page that users can't navigate",
    ],
    "blog": [
        "Write a paragraph arguing that most product roadmaps are theater",
        "Write a paragraph on why user interviews often produce misleading signals",
        "Draft a paragraph arguing that shipping speed matters more than shipping quality",
        "Write a paragraph on why most product metrics measure the wrong thing",
        "Draft a paragraph arguing that feature requests are symptoms, not diagnoses",
        "Write a paragraph on why the best products are opinionated about their audience",
        "Draft a paragraph arguing that consensus-driven product decisions produce mediocrity",
        "Write a paragraph on why PMs should write more and meet less",
        "Draft a paragraph arguing that competitive analysis is mostly noise",
        "Write a paragraph on why internal tools deserve the same design rigor as external ones",
    ],
    "resume": [
        "Write a bullet point for leading a product redesign that increased retention 15%",
        "Write a resume bullet for launching a feature that reduced support tickets by 40%",
        "Draft a bullet point for building an internal tool that saved 20 hours per week",
        "Write a resume bullet for leading a cross-functional team through a platform migration",
        "Draft a bullet for identifying and killing a feature that 90% of users never touched",
        "Write a resume bullet for launching a product in a new market segment",
        "Draft a bullet for reducing page load time by 60% through a frontend rewrite",
        "Write a resume bullet for designing a pricing experiment that increased ARPU 12%",
        "Draft a bullet for building a prototype that secured a partnership with a major client",
        "Write a resume bullet for leading a team through a pivot after launch metrics disappointed",
    ],
    "slack": [
        "Write a message asking your team to review a doc before Friday",
        "Draft a Slack message announcing a change to the sprint process",
        "Write a message asking for volunteers to help with a user research session",
        "Draft a Slack message sharing a post-mortem after an incident",
        "Write a brief message updating the team on a blocked dependency",
        "Draft a Slack message proposing to cancel a recurring meeting",
        "Write a message asking for async feedback on a design mockup",
        "Draft a Slack message thanking the team after a successful launch",
        "Write a message flagging a risk you noticed in the current sprint",
        "Draft a Slack message introducing a new team member",
    ],
    "pitch": [
        "Write the opening of a pitch deck for a reading annotation tool",
        "Draft the opening slide narrative for a tool that turns reading into writing rules",
        "Write the opening of a pitch for a personal knowledge management system",
        "Draft the hook slide for a product that helps writers maintain editorial consistency",
        "Write the opening of a pitch deck for a tool that captures editorial judgment",
        "Draft the first slide narrative for a desktop app that replaces browser-based reading",
        "Write the opening of a pitch for a system that mechanically enforces writing quality",
        "Draft the hook for a product that learns your editorial voice from corrections",
        "Write the opening of a pitch deck for a tool that bridges reading and writing workflows",
        "Draft the opening slide narrative for an AI writing tool that improves through feedback",
    ],
}


def expand_prompts(
    base_prompts: dict[str, str] | None = None,
    target_count: int = 10,
) -> dict[str, list[str]]:
    """Expand base prompts to target_count variations per writing type.

    Uses hand-crafted variations. If base_prompts is None, uses ADVERSARIAL_PROMPTS.
    Returns dict of {type: [prompts]}.
    """
    if base_prompts is None:
        base_prompts = ADVERSARIAL_PROMPTS

    result: dict[str, list[str]] = {}
    for writing_type, base_prompt in base_prompts.items():
        variations = _VARIATIONS.get(writing_type, [base_prompt])
        # Ensure the base prompt is first
        if variations[0] != base_prompt:
            variations = [base_prompt] + [v for v in variations if v != base_prompt]
        result[writing_type] = variations[:target_count]

    return result


def save_training_prompts(prompts: dict[str, list[str]], path: str) -> None:
    """Write expanded prompts to a JSON file."""
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(prompts, f, indent=2)


if __name__ == "__main__":
    prompts = expand_prompts()
    total = sum(len(v) for v in prompts.values())
    for wtype, variations in prompts.items():
        print(f"  {wtype}: {len(variations)} prompts")
    print(f"Total: {total} prompts across {len(prompts)} types")
