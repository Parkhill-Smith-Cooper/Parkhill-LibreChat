# Why agents

An **agent** is a saved assistant with:

- a **model** (for example, a Claude or GPT model);
- **instructions** that describe its role, how it should work and what a good answer looks like;
- optional **knowledge files** it can search;
- **tools** it may use: web search, code, MCP servers such as Microsoft 365 or Revit;
- optional **skills** and **conversation starters**.

You set all of this up once. Everyone who uses the agent gets the same expertise without writing
a long prompt.

---

## Specialists beat generalists

One broad "help me with everything" agent rarely does well. Build small agents that each do one
job well:

| Instead of… | Build… |
|---|---|
| "Architecture helper" | **Spec Section Reviewer**: checks a spec section against our master spec and flags gaps. |
| "Email assistant" | **RFI Responder**: drafts RFI responses in our tone from the RFI and drawing references. |
| "Revit bot" | **Revit Sheet Auditor**: uses the Revit MCP to list sheets that break our naming standard. |
| "Proposal writer" | **Proposal Narrative Writer**: drafts narrative sections from past proposals attached as knowledge. |

A good rule: if you can't describe the agent's job in one sentence, split it.

---

## Where to go next

1. Look in the [Agent Marketplace](marketplace.md). Someone may have built it already.
2. If not, [create one](create.md) and [write good instructions](instructions.md).
3. [Share it](share.md) with your team.
