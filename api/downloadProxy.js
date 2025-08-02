export default async function handler(req, res) {
  const { path } = req.query;

  if (!path) {
    return res.status(400).send('Missing file path');
  }

  // Add a timestamp to ensure uniqueness for the request
  const firebaseProxyURL = `https://us-central1-juan-luna-db.cloudfunctions.net/downloadProxy?path=${encodeURIComponent(path)}&cb=${Date.now()}`;

  try {
    // Get signed URL from Firebase
    const firebaseResponse = await fetch(firebaseProxyURL);
    if (!firebaseResponse.ok) {
      console.error("[vercel-proxy] Firebase response failed:", firebaseResponse.status);
      return res.status(502).send("Bad response from upstream server.");
    }

    const signedUrl = await firebaseResponse.text();

    // Fetch the image
    const imageResponse = await fetch(signedUrl);
    if (!imageResponse.ok) {
      console.error("[vercel-proxy] Failed to fetch signed URL:", imageResponse.status);
      return res.status(502).send("Failed to fetch image from signed URL.");
    }

    // Prevent browser from caching this response at all
    res.setHeader("Cache-Control", "no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    // Pass along the correct content type
    res.setHeader("Content-Type", imageResponse.headers.get("content-type"));

    // Stream image bytes directly
    imageResponse.body.pipe(res);

  } catch (error) {
    console.error("[vercel-proxy] Internal error:", error);
    return res.status(500).send("Proxy encountered an internal error.");
  }
}
