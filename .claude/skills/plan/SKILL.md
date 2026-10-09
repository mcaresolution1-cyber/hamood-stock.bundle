---
description: Plan a feature — save the spec, run the planner and cross-examiner, and ask the user the blocking questions. No code is written.
argument-hint: <spec file path | short feature description> [slug]
disable-model-invocation: true
---

# /plan — plan + cross-question a feature

Input: `$ARGUMENTS`

1. **Spec.** If the input is a file path, use it. Otherwise write the description (and anything the user
   attached in this conversation) verbatim to `docs/specs/<slug>.md`, where `<slug>` is the second
   argument or a short kebab-case name you choose. Never paraphrase the user's spec — copy it.
2. **Plan.** Delegate to the **planner** agent: "Plan `docs/specs/<slug>.md` into `docs/plans/<slug>.md`
   using `docs/plans/_template.md`."
3. **Cross-examine.** Delegate to the **cross-examiner** agent with both paths. Paste its output into the
   plan's *Open questions*, *Conflicts with CLAUDE.md* and *Edge cases* sections. Set
   `status: questions` in the plan front matter.
4. **Ask.** Put the blocking questions to the user with AskUserQuestion (max 4 per call, recommended option
   first and labelled "(Recommended)"). List the non-blocking ones in your reply with their recommended
   defaults and say they'll be used unless the user objects.
5. Record each answer with the `/decide` procedure (Decisions log), then stop.

Do not write application code in this command. End with: plan path, number of phases, questions
answered / still open, and "Run `/build <slug>` to start phase 1."
