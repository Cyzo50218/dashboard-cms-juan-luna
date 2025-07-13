export default async function handler(req, res) {
    const { path } = req.query;

    if (!path) return res.status(400).send('Missing file path');

    const firebaseProxyURL = `https://us-central1-juan-luna-db.cloudfunctions.net/downloadProxy?path=${encodeURIComponent(path)}`;

    const response = await fetch(firebaseProxyURL);

    if (!response.ok) {
        return res.status(404).send("File not found.");
    }

    // Set headers to stream the content
    res.setHeader("Content-Type", response.headers.get("Content-Type") || "application/octet-stream");
    res.setHeader("Content-Disposition", response.headers.get("Content-Disposition") || "inline");

    // Stream the response
    response.body.pipe(res);
}
