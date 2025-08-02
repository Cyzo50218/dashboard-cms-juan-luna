export default async function handler(req, res) {
  const { path } = req.query;

  console.log("===== [vercel-proxy] Incoming Request =====");
  console.log("Request method:", req.method);
  console.log("Request query path param:", path);
  console.log("Full request URL:", req.url);

  if (!path) {
    console.error("[vercel-proxy] Missing 'path' parameter");
    return res.status(400).send('Missing file path');
  }

  // Add a timestamp to ensure uniqueness for the request
  const firebaseProxyURL = `https://us-central1-juan-luna-db.cloudfunctions.net/downloadProxy?path=${encodeURIComponent(path)}&cb=${Date.now()}`;
  console.log("[vercel-proxy] Constructed Firebase Proxy URL:", firebaseProxyURL);

  try {
    console.log("[vercel-proxy] Fetching from Firebase downloadProxy...");
    const firebaseResponse = await fetch(firebaseProxyURL);
    console.log("[vercel-proxy] Firebase status code:", firebaseResponse.status);

    if (!firebaseResponse.ok) {
      console.error("[vercel-proxy] Firebase response failed with status:", firebaseResponse.status);
      const errorText = await firebaseResponse.text();
      console.error("[vercel-proxy] Firebase error response body:", errorText);
      return res.status(502).send("Bad response from upstream server.");
    }

    const signedUrl = await firebaseResponse.text();
    console.log("[vercel-proxy] Received signed URL from Firebase:", signedUrl);

    console.log("[vercel-proxy] Fetching the actual image from signed URL...");
    const imageResponse = await fetch(signedUrl);
    console.log("[vercel-proxy] Image fetch status code:", imageResponse.status);

    if (!imageResponse.ok) {
      console.error("[vercel-proxy] Failed to fetch signed URL. Status:", imageResponse.status);
      const errorText = await imageResponse.text();
      console.error("[vercel-proxy] Image fetch error body:", errorText);
      return res.status(502).send("Failed to fetch image from signed URL.");
    }

    // Log the content type
    const contentType = imageResponse.headers.get("content-type");
    console.log("[vercel-proxy] Image content type:", contentType);

    // Prevent browser from caching this response at all
    res.setHeader("Cache-Control", "no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    // Pass along the correct content type
    res.setHeader("Content-Type", contentType);

    console.log("[vercel-proxy] Streaming image bytes to client...");
    imageResponse.body.pipe(res);

  } catch (error) {
    console.error("[vercel-proxy] Internal error:", error);
    return res.status(500).send("Proxy encountered an internal error.");
  }
}
