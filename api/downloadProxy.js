export default async function handler(req, res) {
  const { path } = req.query;

  if (!path) return res.status(400).send('Missing file path');

  const firebaseProxyURL = `https://us-central1-juan-luna-db.cloudfunctions.net/downloadProxy?path=${encodeURIComponent(path)}`;

  try {
    const firebaseResponse = await fetch(firebaseProxyURL);
    if (!firebaseResponse.ok) {
      console.error("[vercel-proxy] Firebase response failed:", firebaseResponse.status);
      return res.status(502).send("Bad response from upstream server.");
    }

    // Signed URL returned as plain text
    const signedUrl = await firebaseResponse.text();

    const imageResponse = await fetch(signedUrl);
    if (!imageResponse.ok) {
      console.error("[vercel-proxy] Failed to fetch signed URL:", imageResponse.status);
      return res.status(502).send("Failed to fetch image from signed URL.");
    }

    // Set appropriate cache headers
    res.setHeader('Cache-Control', 'no-store');

    // Pipe image directly
    imageResponse.body.pipe(res);

  } catch (error) {
    console.error("[vercel-proxy] Internal error:", error);
    return res.status(500).send("Proxy encountered an internal error.");
  }
}
