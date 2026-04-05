// web/serve.ts — Deno dev server for sevo-life visualization
// Serves index.html + the bundled sim engine

const PORT = Number(Deno.env.get("PORT") ?? 8080);
const DIR = new URL(".", import.meta.url).pathname;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
};

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);
  const path = url.pathname === "/" ? "/v2.html" : url.pathname;
  const ext = path.substring(path.lastIndexOf("."));
  const contentType = MIME[ext];

  if (!contentType) return new Response("Not found", { status: 404 });

  try {
    const file = await Deno.readFile(DIR + path.slice(1));
    return new Response(file, {
      headers: { "content-type": contentType, "cache-control": "no-cache" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
});

console.log(`sevo-life web → http://localhost:${PORT}`);
