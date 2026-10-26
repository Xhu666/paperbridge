---
name: reviewer-response-writing
description: Draft and revise point-by-point academic responses to reviewer comments using a respectful acknowledgement, evidence-based reasoning, concrete manuscript changes, and precise revision locations. Use when a user provides reviewer comments and manuscript changes or asks for a response letter.
metadata:
  short-description: Write evidence-grounded reviewer responses
---

# Reviewer Response Writing

## Purpose

Write a professional, point-by-point response to academic reviewer comments. The response should acknowledge the value of the comment before explaining the author's position, then connect that position to concrete changes in the revised manuscript.

This skill drafts a response for author review. It must not invent experiments, results, references, page numbers, line numbers, or completed revisions.

## Required Inputs

Use the information available in the request:

- Reviewer comment in full;
- Reviewer comment breakdown, if available;
- Original manuscript context, if available;
- Revised manuscript context or program-generated diff, if available;
- Actual changes made by the authors, if provided;
- Confirmed section/page/line locations, if available;
- Desired response language and tone.

If a required fact is missing, preserve the uncertainty and insert a short author-confirmation placeholder rather than guessing.

## Response Logic

For every comment, follow this reasoning sequence:

1. Identify the reviewer's actual request. Separate multiple requests in one comment before drafting.
2. Acknowledge the value, relevance, or helpfulness of the comment. This is an acknowledgement of the comment, not necessarily agreement with every premise.
3. State the response position clearly: fully addressed, partially addressed, clarified without changing the method, or not adopted with a reason.
4. Explain the reasoning. Use the manuscript's method, data, assumptions, literature, results, or scope. If the reviewer is correct, say what was clarified or corrected. If the suggestion is not adopted, explain the technical or scope constraint respectfully.
5. Describe the actual change. Name the section, figure, table, equation, paragraph, or wording that was added, removed, or revised.
6. Give the revision location only when it is supported by the supplied manuscript or diff. Do not create a page or line number.
7. Close the point by stating how the change improves clarity, correctness, reproducibility, interpretation, or presentation.

The preferred logical pattern is:

```text
Acknowledgement -> Position -> Reasoning -> Action taken -> Evidence/location -> Effect
```

Do not force every response to have the same number of paragraphs. A minor language comment may need only acknowledgement, action, and location. A methodological comment may need several reasoning paragraphs and a separate change-location paragraph.

## Response Stance Patterns

### Fully accepted and revised

Use when the supplied evidence shows the manuscript was changed as requested:

```text
We thank the reviewer for this valuable suggestion. We agree that [issue] should be clarified. Accordingly, we have [specific change]. The revision appears in [supported location]. This change clarifies [effect].
```

### Accepted in principle, addressed by clarification

Use when the issue is addressed by explanation, definition, assumption, or added discussion rather than a new experiment:

```text
We appreciate the reviewer’s observation. We agree that [issue] required clarification. In the revised manuscript, we have clarified [assumption/definition/reasoning] and explained [scope or rationale]. The relevant explanation has been added to [supported location].
```

### Partially accepted

Use when only part of a compound request is supported by the revision:

```text
We thank the reviewer for raising this important point. We have addressed [part that was changed] by [specific action]. However, [remaining part] is outside the scope of the current study / cannot be reliably quantified with the available data. We have clarified this limitation in [supported location].
```

### Respectfully not adopted

Use when the author has a defensible reason not to make the requested change:

```text
We appreciate this thoughtful suggestion. We agree that [general concern] is important. However, we did not adopt [specific suggestion] because [evidence-based reason]. To make this boundary clear, we have added [scope clarification/limitation/future-work statement] in [supported location].
```

Never use a dismissive phrase such as “the reviewer is wrong.” Distinguish disagreement with a premise from rejection of the reviewer’s concern.

### Language, formatting, figure, or notation correction

Use a concise pattern:

```text
We thank the reviewer for pointing this out. We have carefully checked the manuscript and corrected [specific issue]. The relevant correction is shown in [supported location], and the same check was applied to the remaining [sentences/figures/equations/references].
```

Do not claim that the entire manuscript was checked unless that check is actually confirmed by the input.

### New idea reserved for future work

Use when the comment identifies a meaningful extension that cannot be completed in the current revision:

```text
We appreciate this valuable suggestion. We agree that [extension] would improve the broader applicability of the study. Because [scope/data/method constraint], we do not claim to have completed this extension in the present revision. We have added it as a limitation or future research direction in [supported location].
```

## Formatting Rules

Use the following structure for each point:

```text
Comment [number]
[Verbatim reviewer comment]

Response:
[Point-by-point response]

Changes in the manuscript:
[Actual change and supported location]
```

For a comment with multiple independent requests, address them in the same order as the original comment. Use numbered subpoints only when they improve traceability.

For a complete response letter, use:

```text
Response to the Reviewers

General Response
[Short overall acknowledgement and summary of confirmed changes]

Reviewer [number]

Comment 1
...

Comment 2
...
```

Use the requested language. When writing in English, prefer precise academic wording and avoid exaggerated claims such as “fully solved,” “perfectly addressed,” or “completely eliminates” unless the supplied evidence supports them.

## Evidence and Truthfulness Rules

- Treat the reviewer comment, manuscript text, revised text, program diff, and author-confirmed facts as separate evidence sources.
- Do not treat a proposed change as a completed change.
- Do not treat a similarity in keywords as proof that a comment was resolved.
- Do not turn an uncertain location into a page or line citation.
- If the response needs a fact that is unavailable, use `[AUTHOR TO CONFIRM: ...]`.
- If no revised manuscript is supplied, write a proposed response or revision plan, not a claim that the revision was completed.
- If the comment is unresolved, state that it remains to be addressed instead of concealing the gap.
- Preserve technical terms, symbols, indicator names, equation numbers, figure numbers, and numerical results exactly as supplied.
- Never fabricate a citation to support a response. If a new citation is needed but not supplied, mark it for author confirmation.

## Quality Check Before Returning

Check each response for:

1. Direct coverage of every request in the reviewer comment;
2. An acknowledgement before disagreement or limitation;
3. A clear response position;
4. Reasoning tied to supplied evidence;
5. Specific actual changes rather than vague promises;
6. A supported revision location;
7. No invented facts, experiments, citations, pages, or line numbers;
8. No claim that an unconfirmed change is complete;
9. Professional, non-defensive tone;
10. Consistency between response text and the revised manuscript.

## Output Behavior

When asked to draft a response, return the formatted response letter or point-by-point response, not an explanation of this skill. When evidence is incomplete, keep the response useful by writing a cautious draft with clearly marked author-confirmation placeholders.
