import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { logError, logInfo } from "@/lib/utils/logger";

/**
 * Simple image upload endpoint.
 * 
 * For production, consider using:
 * - UploadThing (https://uploadthing.com)
 * - Cloudinary (https://cloudinary.com)
 * - AWS S3 + CloudFront
 * 
 * This endpoint accepts base64-encoded images or multipart/form-data.
 * Returns a URL that can be stored in the database.
 */
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = req.headers.get("content-type");
    
    if (contentType?.includes("application/json")) {
      // Handle base64 image
      const body = await req.json();
      const { image } = body;
      
      if (!image || typeof image !== "string") {
        return NextResponse.json(
          { ok: false, error: "Invalid image data" },
          { status: 400 }
        );
      }

      // For now, return the base64 data URL as-is
      // In production, upload to CDN and return CDN URL
      logInfo("Base64 image received", "[api/upload/image]");
      
      return NextResponse.json({
        ok: true,
        url: image, // Store base64 data URL (or upload to CDN and return CDN URL)
        note: "For production, upload to CDN (Cloudinary/UploadThing/S3) and return CDN URL",
      });
    } else if (contentType?.includes("multipart/form-data")) {
      // Handle file upload
      const formData = await req.formData();
      const file = formData.get("file") as File;
      
      if (!file) {
        return NextResponse.json(
          { ok: false, error: "No file provided" },
          { status: 400 }
        );
      }

      // Validate file type
      if (!file.type.startsWith("image/")) {
        return NextResponse.json(
          { ok: false, error: "File must be an image" },
          { status: 400 }
        );
      }

      // Validate file size (max 4MB)
      if (file.size > 4 * 1024 * 1024) {
        return NextResponse.json(
          { ok: false, error: "File size must be less than 4MB" },
          { status: 400 }
        );
      }

      // Convert to base64 for now
      // In production, upload to CDN
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString("base64");
      const dataUrl = `data:${file.type};base64,${base64}`;

      logInfo(`Image uploaded: ${file.name} (${file.size} bytes)`, "[api/upload/image]");

      return NextResponse.json({
        ok: true,
        url: dataUrl,
        filename: file.name,
        size: file.size,
        note: "For production, upload to CDN (Cloudinary/UploadThing/S3) and return CDN URL",
      });
    } else {
      return NextResponse.json(
        { ok: false, error: "Unsupported content type" },
        { status: 400 }
      );
    }
  } catch (error) {
    logError(error, "[api/upload/image] POST");
    return NextResponse.json(
      { ok: false, error: "Failed to upload image" },
      { status: 500 }
    );
  }
}

