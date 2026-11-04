# Skills

A **skill** is a reusable pack of instructions, and optionally files, for one kind of task. Brand
guidelines, a report format or a QA checklist all make good skills.

Skills and agents work together:

- An **agent** is *who* does the work: role, model, tools.
- A **skill** is *how* to do a specific task. Many agents can use it.

Write the "how to format a Parkhill memo" instructions once as a skill and attach it to every agent
that writes memos, instead of copying them into each one.

---

## Using a skill in chat

Type `$` in the message box and choose a skill. It applies to that message.

Agents can also pick up a skill **automatically** when the request matches the skill's
description.

---

## Creating a skill

1. Open **Skills** and click **Create Skill**, or **Upload SKILL.md** if you already have one.
2. **Name:** lowercase words joined by dashes, for example `parkhill-memo-format`.
3. **Description:** explains *when* the skill applies. The agent uses this text to decide whether
   to use the skill, so be specific: "Use when writing an internal memo or letter on Parkhill
   letterhead."
4. **Instructions:** the steps and rules, in Markdown.
5. Optionally add **files** such as templates, examples or reference sheets.

---

## Adding skills to an agent

In the **Agent Builder**, open **Skills** and add the ones the agent should use. Turn on
**Available to agent** for each. An agent with no skills listed can use any skill you have
access to.

---

## Sharing skills

Skills are shared like agents, with Viewer, Editor and Owner roles. If you don't see a **Share**
option, ask the AI team to publish your skill for others.
