import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const ROUTER_PROMPT = `You are a strict routing classifier for a voxel editor's AI pipeline.

Given a user's text description of an object, classify it into exactly one route:

1. PROCEDURAL - ONLY for extreme low-poly primitives, very simple structures (<50 voxels), mathematical functions, or code snippets.
   - Valid: "a red 5x5 cube", "a simple pyramid", "y = sin(x) + cos(z)", "console.log('hello')"
   - INVALID: "a car", "a guitar", "a human" (These are too complex for raw coordinate generation).

2. SEARCH - The DEFAULT route for >=90% of requests. Use this for ANY real-world, tangible noun.
   - Valid: "a rusty old sports car", "a grand piano", "a fluffy dog", "a modern house"
   - Your job: Extract ONLY the 1-2 core keywords for the API search (e.g., "sports car", "piano").

3. GENERATE - ONLY for highly imaginative, fictional, or impossible objects that definitely will not exist on a stock 3D model site.
   - Valid: "a dragon wearing a top hat and sunglasses", "a cyberpunk skyscraper made of jelly".

4. REJECT - Use this if the prompt is completely nonsensical or violates safety guidelines.

Respond with ONLY a JSON object:
{"route": "PROCEDURAL"|"SEARCH"|"GENERATE"|"REJECT", "keywords": "search terms for Poly Pizza (null if not SEARCH)", "reasoning": "one sentence explanation"}`;

const PROCEDURAL_PROMPT = `You are a procedural 3D architect. The user wants a 3D structure.
Do NOT generate a JSON array of coordinates.
Generate ONLY a pure JavaScript code snippet that builds the shape.

Rules:
- You have access to one function: \`place(x, y, z, color, material)\`
- The grid is from x=0 to 49, y=0 to 49, z=0 to 49. y=0 is the ground.
- Use realistic hex colors.
- Use standard JavaScript \`for\` loops and \`Math\` functions.
- Output ONLY the raw JavaScript code. No markdown, no backticks, no explanations.

Example for a red surface wave:
for (let x = 0; x < 50; x++) {
  for (let z = 0; z < 50; z++) {
    let y = 10 + Math.sin(x / 3) * 5 + Math.cos(z / 3) * 5;
    if (y >= 0 && y < 50) {
      place(x, Math.floor(y), z, "#cc0000");
    }
  }
}

Example for a house:
// walls
for (let x = 10; x <= 20; x++) {
  for (let y = 0; y <= 8; y++) {
    place(x, y, 10, "#aa8866");
    place(x, y, 20, "#aa8866");
  }
}
// window
for (let y = 3; y <= 6; y++) {
  for (let z = 13; z <= 17; z++) {
    place(10, y, z, "#88ccff");
  }
}`;

// --- Router ---
async function routePrompt(client: Anthropic, prompt: string) {
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 200,
    system: ROUTER_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("No router response");

  const parsed = JSON.parse(text.text);
  return parsed as { route: "PROCEDURAL" | "SEARCH" | "GENERATE" | "REJECT"; keywords: string | null; reasoning: string };
}

// Extract keywords quickly for manual SEARCH overrides
async function extractKeywords(client: Anthropic, prompt: string) {
  const message = await client.messages.create({
    model: "claude-haiku-3-5-20241022",
    max_tokens: 50,
    system: "Extract 1-2 core keywords from the user's prompt to be used in a 3D model search engine. Respond with ONLY the keywords. E.g. prompt: 'a rusty old sports car' -> output: 'sports car'",
    messages: [{ role: "user", content: prompt }],
  });
  const text = message.content.find((b) => b.type === "text");
  return text && text.type === "text" ? text.text.trim() : prompt;
}

// --- Bucket A: PROCEDURAL ---
async function handleProcedural(client: Anthropic, prompt: string) {
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: PROCEDURAL_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("No procedural response");

  let rawCode = text.text.trim();

  // Strip markdown formatting if Claude disobeys
  if (rawCode.startsWith("```")) {
    rawCode = rawCode.replace(/^```[a-z]*\n/, "").replace(/\n```$/, "");
  }

  // Return the type as 'code' so the frontend knows what to do
  return { type: "code" as const, code: rawCode };
}

// --- Bucket B: SEARCH (Poly Pizza) ---
interface PolyPizzaModel {
  ID: string;
  Title: string;
  Thumbnail: string;
  Download: string;
  "Tri Count": number;
  Creator: { Username: string };
  Category: string;
  Licence: string;
}

async function handleSearch(client: Anthropic, prompt: string, keywords: string) {
  const token = process.env.POLY_PIZZA_API_KEY;
  if (!token) throw new Error("NO_POLY_PIZZA_KEY");

  // Search Poly Pizza
  const searchUrl = `https://api.poly.pizza/v1.1/search/${encodeURIComponent(keywords)}?Limit=3`;
  const searchRes = await fetch(searchUrl, {
    headers: { "x-auth-token": token },
  });
  if (!searchRes.ok) throw new Error("Poly Pizza search failed");
  const searchData = await searchRes.json();

  const results: PolyPizzaModel[] = searchData.results;
  if (!results || results.length === 0) throw new Error("NO_RESULTS");

  // If only 1 result, use it directly
  let selectedIndex = 0;
  if (results.length > 1) {
    // Ask Claude Vision to pick the best match
    const imageContent = results.slice(0, 3).map((r, i) => ([
      { type: "text" as const, text: `Option ${i}: "${r.Title}" (${r.Category})` },
      { type: "image" as const, source: { type: "url" as const, url: r.Thumbnail } },
    ])).flat();

    try {
      const visionMessage = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 50,
        messages: [{
          role: "user",
          content: [
            ...imageContent,
            { type: "text", text: `Which option best matches: "${prompt}"? Reply with ONLY the number (0, 1, or 2).` },
          ],
        }],
      });

      const visionText = visionMessage.content.find((b) => b.type === "text");
      if (visionText && visionText.type === "text") {
        const idx = parseInt(visionText.text.trim());
        if (!isNaN(idx) && idx >= 0 && idx < results.length) {
          selectedIndex = idx;
        }
      }
    } catch {
      // Vision failed, use first result
    }
  }

  const selected = results[selectedIndex];

  return {
    type: "glb" as const,
    url: selected.Download,
    name: selected.Title,
    attribution: `${selected.Title} by ${selected.Creator.Username} (${selected.Licence})`,
  };
}

// --- Bucket C: GENERATE (Hugging Face Inference) ---
async function handleGenerate(prompt: string) {
  const token = process.env.HF_API_TOKEN;
  if (!token) throw new Error("NO_HF_TOKEN");

  // Use Hugging Face text-to-3D model
  const model = "tencent/Hunyuan3D-2";
  const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: { output_type: "glb" },
    }),
  });

  // Model might be loading (503)
  if (res.status === 503) {
    const data = await res.json();
    const estimatedTime = data.estimated_time || 60;
    return {
      type: "pending" as const,
      taskId: `hf_${model}_${Date.now()}`,
      estimatedTime,
      model,
      prompt,
    };
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(`HF API error: ${res.status} ${JSON.stringify(errData)}`);
  }

  // Check if response is binary (GLB) or JSON
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/octet-stream") || contentType.includes("model/gltf-binary")) {
    // Binary GLB — we need to save it and serve a URL
    // For now, convert to base64 data URL (works for small models)
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const dataUrl = `data:model/gltf-binary;base64,${base64}`;
    return { type: "glb" as const, url: dataUrl, name: prompt };
  }

  // JSON response — might contain a URL
  const data = await res.json();
  if (data.url) {
    return { type: "glb" as const, url: data.url, name: prompt };
  }

  throw new Error("Unexpected HF response format");
}

// --- Main handler ---
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = body.prompt;
    const forceRoute = body.forceRoute as "AUTO" | "PROCEDURAL" | "SEARCH" | "GENERATE" | undefined;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }
    if (prompt.length > 500) {
      return NextResponse.json({ error: "Prompt too long (max 500 characters)" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    const client = new Anthropic({ apiKey });

    // Step 1: Route the prompt
    let routeResult: { route: "PROCEDURAL" | "SEARCH" | "GENERATE" | "REJECT", keywords: string | null, reasoning: string };

    if (forceRoute && forceRoute !== "AUTO") {
      // Manual override
      let keywords = null;
      if (forceRoute === "SEARCH") {
        keywords = await extractKeywords(client, prompt.trim());
      }
      routeResult = { route: forceRoute, keywords, reasoning: "User manually selected this route." };
    } else {
      // Automatic routing
      try {
        routeResult = await routePrompt(client, prompt.trim());
      } catch {
        routeResult = { route: "PROCEDURAL" as const, keywords: null, reasoning: "Router fallback" };
      }
    }

    const { route, keywords, reasoning } = routeResult;

    if (route === "REJECT") {
      return NextResponse.json({ error: "Input rejected. Please describe a physical 3D object." }, { status: 400 });
    }

    // Step 2: Execute the selected bucket
    try {
      if (route === "SEARCH" && keywords) {
        const result = await handleSearch(client, prompt.trim(), keywords);
        return NextResponse.json({ route, reasoning, ...result });
      }

      if (route === "GENERATE") {
        const result = await handleGenerate(prompt.trim());
        return NextResponse.json({ route, reasoning, ...result });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "NO_POLY_PIZZA_KEY" || msg === "NO_HF_TOKEN" || msg === "NO_RESULTS") {
        console.log(`Falling back to PROCEDURAL: ${msg}`);
      } else {
        console.error(`${route} bucket failed, falling back to PROCEDURAL:`, err);
      }
    }

    // PROCEDURAL (default / fallback)
    const result = await handleProcedural(client, prompt.trim());
    return NextResponse.json({ route: route === "PROCEDURAL" ? route : `${route}→PROCEDURAL`, reasoning, ...result });

  } catch (err) {
    console.error("Generate error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
