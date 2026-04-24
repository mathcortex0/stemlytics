// AUTO-CREATE TABLE FUNCTION
async function ensureTableExists(env) {
    try {
        // Check if table exists
        const check = await env.DB.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='posts'"
        ).all();
        
        if (check.results.length === 0) {
            // Table doesn't exist, create it
            await env.DB.prepare(`
                CREATE TABLE posts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    content TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `).run();
            console.log("✅ Posts table created successfully");
        }
        return true;
    } catch (error) {
        console.error("Table check failed:", error);
        return false;
    }
}

export async function onRequest(context) {
    const { request, env } = context;
    
    // Ensure table exists on EVERY request
    await ensureTableExists(env);
    
    // Handle GET request - fetch all posts
    if (request.method === 'GET') {
        try {
            const stmt = env.DB.prepare(
                "SELECT * FROM posts ORDER BY created_at DESC"
            );
            const response = await stmt.all();
            const posts = response.results || [];
            
            return new Response(JSON.stringify(posts), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            console.error("GET Error:", error);
            return new Response(JSON.stringify([]), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
    
    // Handle POST request - add new post
    if (request.method === 'POST') {
        try {
            const { content } = await request.json();
            
            if (!content || content.trim().length === 0) {
                return new Response(
                    JSON.stringify({ error: 'Please write something first!' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            
            const insertStmt = env.DB.prepare(
                "INSERT INTO posts (content) VALUES (?)"
            );
            const result = await insertStmt.bind(content).run();
            
            return new Response(
                JSON.stringify({ 
                    success: true, 
                    id: result.meta.last_row_id 
                }), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            console.error("POST Error:", error);
            return new Response(
                JSON.stringify({ error: 'Database error: ' + error.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
    
    return new Response('Method not allowed', { status: 405 });
}
