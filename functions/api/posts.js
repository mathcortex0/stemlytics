export async function onRequest(context) {
    const { request, env } = context;
    
    // Handle GET request - fetch all posts
    if (request.method === 'GET') {
        try {
            // Get all posts from database
            const stmt = env.DB.prepare(
                "SELECT * FROM posts ORDER BY created_at DESC"
            );
            const response = await stmt.all();
            
            // Extract the results array
            const posts = response.results || [];
            
            // Return posts as JSON
            return new Response(JSON.stringify(posts), {
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
            
        } catch (error) {
            // Return empty array on error
            return new Response(JSON.stringify([]), {
                headers: { 'Content-Type': 'application/json' },
                status: 200
            });
        }
    }
    
    // Handle POST request - add new post
    if (request.method === 'POST') {
        try {
            // Get the text from the request body
            const { content } = await request.json();
            
            // Validate content
            if (!content || content.trim().length === 0) {
                return new Response(
                    JSON.stringify({ error: 'Please write something first!' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            
            // Insert into database
            const insertStmt = env.DB.prepare(
                "INSERT INTO posts (content) VALUES (?)"
            );
            const result = await insertStmt.bind(content).run();
            
            // Return success response
            return new Response(
                JSON.stringify({ 
                    success: true, 
                    id: result.meta.last_row_id,
                    message: 'Post added successfully!'
                }), {
                headers: { 'Content-Type': 'application/json' }
            });
            
        } catch (error) {
            // Return error response
            return new Response(
                JSON.stringify({ error: 'Database error: ' + error.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
    
    // Handle any other HTTP method
    return new Response('Method not allowed', { 
        status: 405,
        headers: { 'Content-Type': 'text/plain' }
    });
}
