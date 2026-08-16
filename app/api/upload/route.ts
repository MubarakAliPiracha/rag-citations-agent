// POST /api/upload — accept a PDF, index it, and hand back a session id.
//
// The session id is the only handle the browser gets. It cannot name a storage path or a
// URL, which keeps the client from steering what the server reads.

import { NextResponse } from "next/server";

import { describeError } from "@/lib/agent";
import { MAX_UPLOAD_BYTES, processUpload, UploadError } from "@/lib/upload";

/** Chunking plus embedding a full document takes longer than a normal request. */
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  let file: File | null = null;

  try {
    const form = await request.formData();
    const value = form.get("file");
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "No file was attached." }, { status: 400 });
  }

  try {
    const result = await processUpload(file);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: describeError(error) }, { status: 500 });
  }
}

/** Advertised so the client can validate size before spending bandwidth on an upload. */
export async function GET(): Promise<Response> {
  return NextResponse.json({ maxBytes: MAX_UPLOAD_BYTES });
}
