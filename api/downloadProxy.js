export default async function handler(req, res) {
  const { path } = req.query;

  if (!path) return res.status(400).send('Missing file path');

  const firebaseProxyURL = `https://us-central1-juan-luna-db.cloudfunctions.net/downloadProxy?path=${encodeURIComponent(path)}`;

  try {
    const response = await fetch(firebaseProxyURL);

    if (!response.ok) {
      console.error("[vercel-proxy] Firebase returned:", response.statusText);
      return res.status(response.status).send("File not found.");
    }

    const contentType = response.headers.get("Content-Type") || "application/octet-stream";
    const contentDisposition = response.headers.get("Content-Disposition") || "inline";

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", contentDisposition);
    res.setHeader("Content-Length", buffer.length);

    res.end(buffer);
  } catch (error) {
    console.error("[vercel-proxy] Error:", error);
    return res.status(500).send("Proxy error.");
  }
}
