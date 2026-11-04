# Create an agent

1. Open the **Agent Builder** from the side panel.
2. Click to create a new agent.
3. Fill in the fields below, then click **Create**. After that, changes save when you click
   **Save**.

---

## The fields

**Avatar, name and description.** Choose a clear name, such as "RFI Responder", and a
one-sentence description of what it does and when to use it. Colleagues browsing the
[Marketplace](marketplace.md) see these first.

**Category.** Puts the agent under a tab in the Marketplace.

**Model.** The model the agent runs on. Use a stronger model for reasoning-heavy work and a
faster one for simple, high-volume tasks.

**Instructions.** The most important field. See [Write good instructions](instructions.md).

**Conversation starters.** Example first messages shown as buttons when someone opens the agent.
They teach people how to use it, so add two or three.

**Capabilities and tools.** Turn on only what the agent needs:

- **File Search** searches knowledge files you attach to the agent.
- **File Context** puts the full text of attached files in front of the agent.
- **Run Code** lets the agent run Python to analyze data and create files and charts.
- **Web Search** looks things up on the internet.
- **Artifacts** renders documents, diagrams and small apps beside the chat.
- **MCP servers** connect outside systems. See [Tools and MCP servers](../mcp.md).
- **Skills** give the agent reusable instruction packs. See [Skills](../skills.md).
- **Image tools** let the agent create and edit images. See [Image generation](../images.md).

**Advanced.** Includes **Max Agent Steps**, the number of steps (mostly tool calls) the agent may
take in one answer. Raise it for agents that do long, multi-step tool work.

**Support Contact.** Name and email of the person who maintains the agent. Shown to users.

---

## Knowledge files

Attach reference material the agent should always have, such as master specs, standards,
templates or past examples. Create the agent first; files can be added once it exists.

- Use **File Search** for large or many documents. The agent looks up relevant passages.
- Use **File Context** for a few short documents the agent should read in full every time.

Keep knowledge files current. An agent that quotes an outdated standard is worse than no agent.

---

## Agents working together

Under advanced settings you can connect agents:

- **Handoffs** pass the conversation to a specialist agent when its expertise is needed.
- **Subagents** let an agent spin up helpers for parts of a task.
- **Chain** runs a fixed sequence of agents, one after another.

Start with a single agent. Connect several only when a single one clearly can't do the job.

---

## Duplicating and version history

- **Duplicate** copies an agent so you can make a variant without touching the original.
- **Version History** lists earlier saved versions. **Restore** puts an earlier version back if
  a change made the agent worse.
