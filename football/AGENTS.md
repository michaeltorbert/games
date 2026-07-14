# Football Agent Instructions

These instructions apply to work under `football/` and supplement the
repository-level `AGENTS.md`.

## Curriculum Reference

- Use `Math Mammoth Grade 1-A.pdf` as the primary curriculum reference for
  issue #54 and future Football learning-system changes.
- The PDF is committed with permission from the license holder for educational
  use. Treat it as an intentional repository asset, not an accidental binary.
- The learner's dated progress and near-term lesson map live in
  `curriculum-progress.json`.
- Do not infer that the learner completed two pages on every calendar day.
  `usualPagesPerDay` is a pacing norm; `completedThroughPage` changes only when
  the user provides a new progress update.
- Summarize or cite lesson concepts in implementation notes and reviews. Do not
  paste long passages or reproduce workbook pages in generated artifacts.

## Learning Design Rules

- Keep football outcome/risk separate from instructional difficulty. Exciting
  play calls must not automatically force harder math.
- Distinguish computational difficulty from the size of a displayed number.
  Addition/subtraction fluency may remain within 10 or 20 while current place-
  value work legitimately reads, decomposes, compares, and moves through
  two-digit numbers up to 100.
- Use current and recently completed curriculum skills for graded questions.
  Use upcoming topics as supported or no-stakes exposure until the progress
  record says they are completed.
- Preserve the real football state separately from any child-facing math model
  or visualization.
- Apply the same instructional profile and retry/support policy on offense and
  defense.
