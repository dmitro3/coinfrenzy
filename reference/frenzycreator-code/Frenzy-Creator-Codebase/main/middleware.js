export const config = {
  matcher: ['/admin', '/admin.html'],
};

export default function middleware(request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/__admin_gate=([^;]+)/);
  const token = match ? decodeURIComponent(match[1]) : '';

  const secret = process.env.ADMIN_SESSION_SECRET || '';

  if (!secret || token !== secret) {
    const url = new URL('/admin-login', request.url);
    return new Response(null, {
      status: 302,
      headers: { Location: url.toString() },
    });
  }
}
