export default async function handler(req, res) {
  const { path } = req.query;

  if (!path) return res.status(400).send("Missing file path");

  try {
    const bucket = getStorage().bucket();
    const file = bucket.file(path);

    const [metadata] = await file.getMetadata();
    res.setHeader("Content-Type", metadata.contentType || "application/octet-stream");

    file.createReadStream().pipe(res);
  } catch (err) {
    console.error("Error streaming file:", err);
    res.status(500).send("Failed to fetch file");
  }
}
