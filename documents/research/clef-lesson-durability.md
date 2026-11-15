# CLEF as a weigher for lesson durability

**2026-11-15.** Investigation, per the owner: "investigate how decision model 'clef' can help weigh in a
lesson as durable or not after 'grill-me' round".

## What CLEF is

Cloudflare's open-source **decision model** (Clef, 27B, multimodal; plus Clef-flash), hosted on Workers AI
under Apache-2.0 and API-compatible with Typesafe's Jev. Its shape is the point: it takes a **state**
(text, JSON, images, video) and a **schema of typed questions**, and returns a **probability for every
option** rather than free-form prose. It is positioned for classification and agentic routing, is
described as 2.5x faster than Jev at the median, and can be fine-tuned with the same RL product.

Sources: `blog.cloudflare.com/clef-decision-models`;
`developers.cloudflare.com/workers-ai/models/clef`;
`developers.cloudflare.com/ai/models/@cf/cloudflare/clef/` ("turns a state and a schema of typed questions
into decisions … returns a probability for every [option]").

## Why it fits the durability question

The call this repo needs is exactly that shape: **one question with a small closed option set**, judged
from a body of evidence.

| Element        | Here                                                                      |
| -------------- | ------------------------------------------------------------------------- |
| State          | the proposition, its trigger, the evidence, and the grill round's answers |
| Typed question | `durable` \| `note` \| `insufficient evidence`                            |
| Output         | a probability per option, which is a _weight_, not a verdict              |

A model that returns a distribution is useful precisely because the question is a judgement with a soft
boundary — and because "insufficient evidence" is a real third answer that a binary prompt tends to lose.

## Availability here, measured

**Not reachable from this machine.** The configured providers expose no decision model: the model
catalogue returns zero matches for `clef`, `jev` and `decision`, across every provider. Wiring it would
mean adding a Cloudflare Workers AI provider and an API token, and the admission step is a governance
gate — it must not fail because a vendor is unavailable, which is the same rule the repo applies to its
auth and mail ports (a port with a local implementation, never a hard dependency).

## The recommendation

1. **Define the decision now, as a schema**, and have the grill seat answer it. The durable/note text in
   `documents/lessons.md` already carries the criterion; this note carries the option set.
2. **Adopt CLEF behind a port** if it is ever wired: `weighLesson(state) → { durable, note, insufficient }`
   with a local implementation (the grill seat) and a CLEF implementation, chosen by configuration. That
   keeps the gate working when the vendor does not answer, and makes the swap a one-line change.
3. **Keep the owner's acceptance as the final gate.** A probability is evidence for a decision, not the
   decision: the same reason the repo's spec review is a seat and not a score.

## What it does not solve

- **Calibration.** A 27B model's probability on a two-option governance question is not a measurement
  unless it is calibrated against labelled examples; the repo has none yet.
- **Justification.** A probability does not explain itself, and a lesson entry must name its rule and its
  evidence — so the grill round's prose stays required whatever the model says.
- **Drift.** A hosted model changes under you; the local implementation is the stable one.
