export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (key !== env.ADMIN_PASS) {
    return new Response("Unauthorized", { status: 401 });
  }

  const data = await request.json();
  await env.DB.prepare(
    "INSERT INTO university_notices (uni_name, unit_name, exam_date, apply_deadline, apply_link, important_note) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(data.uni_name, data.unit_name, data.exam_date, data.apply_deadline, data.apply_link, data.important_note).run();

  return Response.json({ success: true });
}
