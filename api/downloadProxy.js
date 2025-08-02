export default async function handler(req, res) {
  const { path } = req.query;

  if (!path) {
    return res.status(400).send('Missing file path');
  }

  const firebaseProxyURL = `https://us-central1-juan-luna-db.cloudfunctions.net/downloadProxy?path=${encodeURIComponent(path)}`;

  try {
    // Fetch the Firebase function, but tell it NOT to follow redirects automatically
    const firebaseResponse = await fetch(firebaseProxyURL, { redirect: 'manual' });

    // Check if Firebase responded with a redirect (status 301 or 302)
    if (firebaseResponse.status === 302 || firebaseResponse.status === 301) {
      // Get the real image URL from the 'Location' header
      const finalImageUrl = firebaseResponse.headers.get('Location');

      if (finalImageUrl) {
        // Success! Redirect the user's browser to the actual image.
        return res.redirect(302, finalImageUrl);
      }
    }

    // If we get here, it means Firebase did NOT redirect, which is an error.
    const errorText = await firebaseResponse.text();
    console.error("[vercel-proxy] Firebase function failed to redirect. Status:", firebaseResponse.status);
    console.error("[vercel-proxy] Firebase function response:", errorText);
    return res.status(502).send("Bad response from upstream server.");

  } catch (error) {
    console.error("[vercel-proxy] Internal error:", error);
    return res.status(500).send("Proxy encountered an internal error.");
  }
}