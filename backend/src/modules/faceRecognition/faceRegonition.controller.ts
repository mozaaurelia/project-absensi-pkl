import { Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";
import cloudinary from "../../config/cloudinary";
import { pool } from "../../config/database";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });


interface RegisterFaceBody {
  employeeId: string; // UUID
  image: string; // base64
}


interface VerifyFaceBody {
  referenceImage: string; // base64, boleh dengan atau tanpa prefix "data:image/jpeg;base64,"
  capturedImage: string;
}

function stripBase64Prefix(base64: string): string {
  return base64.includes(",") ? base64.split(",")[1] : base64;
}

interface VerifyFaceBody {
  employeeId: string; // UUID
  capturedImage: string; // base64, dari kamera saat clock-in
}

async function fetchImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch reference image: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
}

export async function verifyFace(req: Request, res: Response) {
  try {
    const { employeeId, capturedImage } = req.body as VerifyFaceBody;

    if (!employeeId || !capturedImage) {
      return res.status(400).json({
        message: "employeeId and capturedImage are required",
      });
    }

    const referenceResult = await pool.query(
      `SELECT image_url FROM employee_face_references
       WHERE employee_id = $1 AND is_active = true
       LIMIT 1`,
      [employeeId],
    );

    if (referenceResult.rows.length === 0) {
      return res.status(404).json({
        message: "This employee does not have a reference face photo yet",
      });
    }

    const referenceImageBase64 = await fetchImageAsBase64(
      referenceResult.rows[0].image_url,
    );

    const prompt = `Kamu adalah sistem verifikasi wajah untuk aplikasi absensi karyawan.
Bandingkan foto pertama (foto referensi karyawan saat registrasi) dengan foto kedua (foto selfie saat absen).
Tentukan apakah kedua foto menunjukkan orang yang sama.
Jawab HANYA dalam format JSON tanpa teks tambahan, dengan struktur persis seperti ini:
{"match": boolean, "confidence": number antara 0 dan 1, "reason": "penjelasan singkat"}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: referenceImageBase64,
              },
            },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: stripBase64Prefix(capturedImage),
              },
            },
          ],
        },
      ],
    });

    const rawText = response.text ?? "";
    const cleaned = rawText.replace(/```json|```/g, "").trim();

    let result: { match: boolean; confidence: number; reason: string };
    try {
      result = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({
        message: "Failed to parse Gemini response",
        raw: rawText,
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("[verifyFace] Error:", error);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  }
}

export async function registerFaceReference(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const { employeeId, image } = req.body as RegisterFaceBody;

    if (!employeeId || !image) {
      return res
        .status(400)
        .json({ message: "employeeId and image are required" });
    }

    const dataUri = image.includes(",")
      ? image
      : `data:image/jpeg;base64,${image}`;

    const uploadResult = await cloudinary.uploader.upload(dataUri, {
      folder: "sams/face-references",
    });

    await client.query("BEGIN");

    await client.query(
      `UPDATE employee_face_references SET is_active = false WHERE employee_id = $1 AND is_active = true`,
      [employeeId],
    );

    const insertResult = await client.query(
      `INSERT INTO employee_face_references (employee_id, image_url, cloudinary_public_id, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING id, image_url, created_at`,
      [employeeId, uploadResult.secure_url, uploadResult.public_id],
    );

    await client.query("COMMIT");

    return res.status(201).json(insertResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[registerFaceReference] Error:", error);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    });
  } finally {
    client.release();
  }
}
