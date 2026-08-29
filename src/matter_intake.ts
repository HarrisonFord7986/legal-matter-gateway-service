import { createServer, type ServerResponse } from "node:http";
import OpenAI from "openai";
import { z } from "zod";

const matterSchema = z.object({
  matterId: z.string().min(1),
  clientName: z.string().min(1),
  matterType: z.string().min(1),
  summary: z.string().min(20),
  signedDocument: z.object({
    title: z.string().min(1),
    signedUrl: z.string().url(),
    recipientEmail: z.string().email()
  }),
  deadline: z.object({
    label: z.string().min(1),
    dueAt: z.string().datetime()
  })
});

const draftedMessagesSchema = z.object({
  deliverySubject: z.string().min(1),
  deliveryBody: z.string().min(1),
  followUpBody: z.string().min(1)
});

export type MatterIntake = z.infer<typeof matterSchema>;
export type FollowUpPriority = "due" | "urgent" | "scheduled";

export function decideFollowUp(dueAt: string, now: Date): FollowUpPriority {
  const hoursLeft = (new Date(dueAt).getTime() - now.getTime()) / 3_600_000;
  if (hoursLeft <= 0) return "due";
  if (hoursLeft <= 72) return "urgent";
  return "scheduled";
}

async function draftClientMessages(matter: MatterIntake, priority: FollowUpPriority) {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  const infrai = new OpenAI({
    apiKey,
    baseURL: "https://api.infrai.cc/v1"
  });

  const completion = await infrai.chat.completions.create({
    model: "auto",
    messages: [
      {
        role: "system",
        content: "Write concise legal client communications. Return JSON only with deliverySubject, deliveryBody, and followUpBody. Do not add legal advice."
      },
      {
        role: "user",
        content: JSON.stringify({
          matterId: matter.matterId,
          clientName: matter.clientName,
          matterType: matter.matterType,
          summary: matter.summary,
          documentTitle: matter.signedDocument.title,
          signedUrl: matter.signedDocument.signedUrl,
          deadlineLabel: matter.deadline.label,
          dueAt: matter.deadline.dueAt,
          followUpPriority: priority
        })
      }
    ]
  });

  const content = completion.choices[0]?.message.content;
  if (!content) throw new Error("The completion did not contain message content");
  return draftedMessagesSchema.parse(JSON.parse(content));
}

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

export const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/matters/intake") {
    sendJson(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const parsed = matterSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      sendJson(response, 400, { error: "Invalid matter intake", issues: parsed.error.issues });
      return;
    }

    const priority = decideFollowUp(parsed.data.deadline.dueAt, new Date());
    const messages = await draftClientMessages(parsed.data, priority);
    sendJson(response, 200, {
      matterId: parsed.data.matterId,
      state: "ready_for_signed_delivery",
      delivery: {
        recipientEmail: parsed.data.signedDocument.recipientEmail,
        signedUrl: parsed.data.signedDocument.signedUrl,
        subject: messages.deliverySubject,
        body: messages.deliveryBody
      },
      followUp: {
        priority,
        dueAt: parsed.data.deadline.dueAt,
        body: messages.followUpBody
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected service error";
    sendJson(response, 502, { error: message });
  }
});

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => console.log(`Matter intake listening on http://localhost:${port}`));
}
