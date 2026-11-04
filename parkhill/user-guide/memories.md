# Memories

**Memories** are short notes about you that Parkhill AI keeps between chats: your role, the
projects you're on, how you like answers written. With them, you don't have to introduce yourself
at the start of every conversation.

For example:

- "Project architect, mostly K-12 work."
- "Prefers short answers with bullet points; US units; no emoji."
- "Currently working on the design development set for a new elementary school."

---

## How memories are used

Your saved memories are given to the assistant at the start of each chat, so answers take them
into account without you repeating them.

This happens in every chat, with any agent, as long as **Reference saved memories** is on. See
[Turning memories off](#turning-memories-off).

---

## How memories are created

Parkhill AI **doesn't save memories in the background**. A memory is created only in one of
these ways:

**1. You add it yourself.** Open **Memories** in the side panel and click **Create Memory**.
Give it a key (a category, see below) and write the note.

**2. You ask the assistant to remember something**, in a chat where memory is on:

- Turn on **Memory** in the tools under the message box, then say, for example, "Remember that
  I'm on the new elementary school project and I prefer metric dimensions."
- Agents with the **Memory** capability can do the same. The assistant may also save something on
  its own when you tell it a lasting preference.

You'll see **Saved memory** in the chat when one is stored, and you can ask it to forget
something the same way ("Forget my old project").

---

## Keys and limits

Each memory has a **key** that says what kind of note it is:

| Key | For |
|---|---|
| `work_info` | Role, office, team, current projects |
| `preferences` | How you like answers: length, format, tone, units |
| `skills` | Your expertise and the software you use |
| `interests` | Topics you care about |
| `context` | Ongoing situations worth carrying over |
| `personal_info` | Personal details you choose to share |

All your memories together are limited in size (about 2,000 tokens, or a page of text). If
storage is full, delete or shorten older memories before adding new ones.

---

## Agent memories

By default, every agent reads and writes the same set of **personal** memories.

An agent's owner can turn on **Keep memories separate for this agent** in the Agent Builder. That
agent then keeps its own memories for each user, apart from your personal ones. This is useful
for agents that need to track their own context, like a coach agent remembering your progress,
without cluttering your personal memories.

In the **Memories** panel, use the filter to view **Personal** memories or those of a specific
agent. Agent memories show an **Agent-scoped memory** badge.

---

## Reviewing and editing

Open **Memories** in the side panel at any time to see everything saved about you. You can
**Edit** or **Delete** any memory. Review it occasionally and remove anything outdated, such as a
finished project; old memories can steer answers the wrong way.

---

## Turning memories off

Go to **Settings → Personalization** and turn off **Reference saved memories**. The assistant then
stops reading and saving memories. Your existing memories stay in the Memories panel until you
delete them.

---

## Good practice

- **Save lasting facts**, not one-off details. "I prefer US units" is a good memory; "the meeting
  is at 3 today" is not.
- **Don't store sensitive information**: passwords, personal financial or health data, or
  confidential client details.
- **Keep project memories current.** Update `work_info` when you move to a new project.
