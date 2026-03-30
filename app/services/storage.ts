import * as ImageManipulator from "expo-image-manipulator";
import { supabase } from "./supabase";
import { logError, logInfo } from "../utils/logger";

const BUCKET = "car-images";

export type UploadedImage = {
  path: string;
  publicUrl: string;
  analysisUrl: string;
};

async function convertToJpeg(uri: string) {
  const converted = await ImageManipulator.manipulateAsync(uri, [], {
    compress: 0.9,
    format: ImageManipulator.SaveFormat.JPEG
  });
  return converted.uri;
}

async function readImageFileAsJpeg(uri: string) {
  const convertedUri = await convertToJpeg(uri);
  const response = await fetch(convertedUri);
  const fileBuffer = await response.arrayBuffer();

  return {
    fileBuffer,
    contentType: "image/jpeg",
    extension: "jpg"
  };
}

export async function uploadCarImage(
  uri: string,
  userId: string,
  fileHint: string
): Promise<UploadedImage> {
  try {
    const { fileBuffer, contentType, extension } = await readImageFileAsJpeg(uri);
    const safeHint = fileHint.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40) || "photo";
    const fileName = `${Date.now()}-${safeHint}.${extension}`;
    const path = `${userId}/${fileName}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, fileBuffer, {
      contentType,
      upsert: false
    });

    if (uploadError) {
      throw new Error(`Image upload failed: ${uploadError.message}`);
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

    if (!data.publicUrl) {
      throw new Error("Could not create image URL.");
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 30);

    if (signedError) {
      throw new Error(`Could not create signed URL: ${signedError.message}`);
    }

    const analysisUrl = signedData?.signedUrl ?? data.publicUrl;

    logInfo("Storage", "Image converted and uploaded.", {
      fileHint: safeHint,
      path,
      contentType,
      extension
    });
    return { path, publicUrl: data.publicUrl, analysisUrl };
  } catch (error) {
    logError("Storage", error, { fileHint, userId });
    throw error;
  }
}
