# Image generation

Parkhill AI can create and edit images: concept sketches, mood boards, presentation graphics,
marketing visuals, or a quick change to a rendering.

**Images are made by an agent that has an image tool.** A plain chat with a model won't produce
images. Use an image agent from the [Agent Marketplace](agents/marketplace.md), or add an image
tool to your own agent.

---

## The two image tools

| Tool | Listed in the Agent Builder as | Good at |
|---|---|---|
| **OpenAI image generation** | OpenAI Image Tools | Clean graphics, readable text in the image, **transparent backgrounds** (logos, icons, cut-outs) and precise edits to an uploaded image. |
| **Nano Banana Pro** (Google Gemini) | Gemini Image Tools | Photoreal scenes and renderings, **wide formats** (16:9, 21:9 and others), **high resolution up to 4K**, and combining several reference images into one result. |

Both can create new images and edit existing ones. If you're unsure, try the same request with
both and keep the better result.

---

## Using an existing image agent

1. Open the [Agent Marketplace](agents/marketplace.md) and search for "image".
2. Click **Start Chat**, or type `@` and the agent's name in any chat.
3. Describe the image you want, or attach an image and describe the change.

---

## Building your own image agent

Build your own when you need a particular style or job, for example "Presentation Graphics in
Parkhill colors" or "Rendering Touch-ups".

1. In the **Agent Builder**, create an agent. See [Create an agent](agents/create.md).
2. Click **Add tools** and add **OpenAI Image Tools**, **Gemini Image Tools**, or both.
3. In the instructions, describe the style and defaults, for example:

   ```markdown
   You create presentation graphics for Parkhill.
   - Default to 16:9 landscape unless the user asks otherwise.
   - Clean, flat style; Parkhill palette (navy, warm gray, white); no stock-photo look.
   - Never add text or logos to the image unless the user asks for them.
   - If the request is vague, ask one question about subject and use before generating.
   ```

4. If the agent has both tools, say when to use each, for example: "Use Gemini Image Tools for
   renderings and wide formats; use OpenAI Image Tools when the user needs a transparent
   background."
5. Add conversation starters such as "Make a 16:9 title slide image for a K-12 project".
6. [Share it](agents/share.md) with your team.

---

## Writing a good image request

- **Subject:** what's in the picture ("a two-story brick elementary school entrance").
- **Setting and light:** "late afternoon, warm sun, students arriving".
- **Style:** "photoreal", "watercolor sketch", "flat vector illustration".
- **Format:** "16:9 landscape", "square", "portrait for a poster", "transparent background".
- **What to avoid:** "no people", "no text", "no cars in the foreground".

To change an image, attach it (or point to one generated earlier in the chat) and describe only
the change: "Same view, but make the canopy wood instead of metal." Keep refining in the same
chat; the agent can build on its earlier images.

---

## Downloading and the Tech Hub gallery

Click an image to open it, then use **Download** to save it.

{% hint style="info" %}
**Images you generate and download appear in the Tech Hub gallery** at
[tech.parkhill.com/gallery](https://tech.parkhill.com/gallery), where everyone at Parkhill can see
them. The gallery shows the best AI-generated images across the firm.
{% endhint %}

- Only images generated in Parkhill AI and saved with the **Download** button in the image viewer
  go to the gallery. Images you generate but don't download aren't added.
- Images you upload, and images saved with the browser's right-click "Save image as", are not
  included.
- Don't download an image through the viewer if it shouldn't be visible firm-wide, for example
  one based on confidential client material.

---

## Things to keep in mind

- **Generated images are concepts, not design documents.** Don't use them for dimensions, code
  compliance or anything a client could read as a design commitment.
- **Check text in images.** Spelling and numbers can come out wrong.
- **Don't recreate real people, brands or other firms' work.** Don't upload client imagery the
  contract doesn't allow us to use.
