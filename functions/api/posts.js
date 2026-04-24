export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    // Handle GET request - fetch all posts
    if (request.method === 'GET') {
        try {
            const { results } = await env.DB.prepare(
                "SELECT * FROM posts ORDER BY created_at DESC"
            ).all();
            
            return new Response(JSON.stringify(results), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    // Handle POST request - add new post
    if (request.method === 'POST') {
        try {
            const { content } = await request.json();
            
            if (!content || content.trim().length === 0) {
                return new Response(JSON.stringify({ error: 'Content is required' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            const result = await env.DB.prepare(
                "INSERT INTO posts (content) VALUES (?)"
            ).bind(content).run();

            return new Response(JSON.stringify({ 
                success: true, 
                id: result.meta.last_row_id 
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    // Handle other methods
    return new Response('Method not allowed', { status: 405 });
}
