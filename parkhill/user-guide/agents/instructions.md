# Write good instructions

The instructions decide whether an agent is an expert or just a chat with a name. Write them the
way you would brief a capable new hire.

---

## A template

```markdown
## Role
You are Parkhill's <role>. You help <who> with <what>.

## When you are given <input>
1. <first step>
2. <second step>
3. <how to check the result>

## Standards
- <our rule, with the reason>
- Use the attached <document> as the source of truth. If it doesn't cover something, say so.

## Output
<format: headings, table columns, length, tone>

## Don't
- <common mistake to avoid>
- Don't invent code sections, product names or numbers. Ask instead.
```

---

## Tips

- **Be specific about the output.** "A table with Section, Issue, Recommendation" beats "a
  summary".
- **Give the why.** "Keep it under 200 words because it goes in an email to the owner" helps the
  agent make good decisions in cases you didn't foresee.
- **Point to the knowledge files by name**, and say what to do when they don't have the answer.
- **Name the tools.** For example: "Use the Microsoft 365 tools to find the latest email thread
  before drafting a reply."
- **Show one example** of a great answer. A single good example teaches more than a page of
  rules.
- **Test with real work.** Try three or four real cases, read the results, and adjust. Repeat
  whenever someone reports a weak answer.
