# Tools and MCP servers

**MCP servers** (Model Context Protocol) connect Parkhill AI to other systems. They let the
assistant read your email, search RED or work in a Revit model instead of only talking about
them.

---

## Servers available at Parkhill

| Server | What it gives the assistant |
|---|---|
| **Microsoft 365** | Your Outlook email and calendar, and other Microsoft 365 data. |
| **RED** | Parkhill's RED intranet. |
| **Parkhill Tech Hub** | Company-approved apps and the Ideas board (read-only). |
| **Pirros** | Parkhill's Pirros library of details, families and standards. |
| **Parkhill Docs** | This guide and other Parkhill documentation. |
| **Revit, SketchUp, Rhino** | The model open on **your own workstation**. Needs the Parkhill desktop connector installed and running. |

The list may grow. The MCP menu in the message box always shows what you can use.

---

## Using MCP in a chat

1. Click the **MCP** button under the message box.
2. Turn on the servers you want for this chat.
3. If a server shows **Needs Auth**, click it and sign in. Most use your Microsoft account. You
   sign in once and it stays connected.
4. Ask in plain language, for example: "Find the latest email from the contractor about the roof
   submittal and summarize the open questions."

The assistant shows each tool call in the chat, so you can see exactly what it did.

Status labels: **Connected** (ready), **Needs Auth** (sign in first), **On-demand** (connects
when first used), **Error** (try **Reconnect**, then contact IT).

---

## Using MCP in agents

Adding MCP servers to an agent is the most effective way to use them.

1. In the **Agent Builder**, add the MCP server under tools.
2. Keep only the tools the agent needs. Fewer tools means faster, more accurate answers.
3. In the instructions, say when to use each tool, for example: "Before drafting, use the Pirros
   search tool to find our standard detail for this condition."

Servers you sign in to, such as Microsoft 365 and RED, use **each person's own** sign-in, so the
agent sees only what that person is allowed to see.

---

## Tips

- Long tool tasks such as auditing a whole Revit model take many steps. If an answer stops early,
  click continue, or raise **Max Agent Steps** on the agent.
- The desktop servers (Revit, SketchUp, Rhino) work only while the application and the Parkhill
  desktop connector are open on your machine.
