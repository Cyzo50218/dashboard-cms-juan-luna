export default async function handler(req, res) {
  const { path } = req.query;

  if (!path) {
    return res.status(400).send('Missing file path');
  }

  const firebaseProxyURL = `https://us-central1-juan-luna-db.cloudfunctions.net/downloadProxy?path=${encodeURIComponent(path)}`;

  try {
    const firebaseResponse = await fetch(firebaseProxyURL, { redirect: 'manual' });

    if (firebaseResponse.status === 302 || firebaseResponse.status === 301) {
      const finalImageUrl = firebaseResponse.headers.get('Location');

      if (finalImageUrl) {
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        return res.redirect(302, finalImageUrl);
      }
    }

    // Error handling for when Firebase does not redirect
    const errorText = await firebaseResponse.text();
    console.error("[vercel-proxy] Firebase function failed to redirect. Status:", firebaseResponse.status);
    console.error("[vercel-proxy] Firebase function response:", errorText);
    return res.status(502).send("Bad response from upstream server.");

  } catch (error) {
    console.error("[vercel-proxy] Internal error:", error);
    return res.status(500).send("Proxy encountered an internal error.");
  }
}