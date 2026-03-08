import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const model = req.nextUrl.searchParams.get("model");
  const prompt = req.nextUrl.searchParams.get("prompt");

  if (!model || !prompt) {
    return NextResponse.json({ error: "model and prompt required" }, { status: 400 });
  }

  const token = process.env.HF_API_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "HF_API_TOKEN not configured" }, { status: 500 });
  }

  try {
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

    // Still loading
    if (res.status === 503) {
      const data = await res.json();
      return NextResponse.json({
        status: "pending",
        estimatedTime: data.estimated_time || 60,
      });
    }

    if (!res.ok) {
      return NextResponse.json({ status: "failed", error: `HF error: ${res.status}` });
    }

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/octet-stream") || contentType.includes("model/gltf-binary")) {
      const buffer = await res.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const dataUrl = `data:model/gltf-binary;base64,${base64}`;
      return NextResponse.json({ status: "done", url: dataUrl });
    }

    const data = await res.json();
    if (data.url) {
      return NextResponse.json({ status: "done", url: data.url });
    }

    return NextResponse.json({ status: "failed", error: "Unexpected response format" });
  } catch (err) {
    return NextResponse.json(
      { status: "failed", error: err instanceof Error ? err.message : "Status check failed" },
    );
  }
}
