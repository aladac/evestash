// SPA fallback: serve index.html for /s/:id routes
// The client-side JS reads the path and loads the shared appraisal
export const onRequestGet: PagesFunction = async (context) => {
  const url = new URL(context.request.url)
  // Rewrite to serve the root index.html
  const indexUrl = new URL("/", url.origin)
  const resp = await context.env.ASSETS.fetch(new Request(indexUrl.toString()))
  return new Response(resp.body, {
    status: 200,
    headers: resp.headers,
  })
}
