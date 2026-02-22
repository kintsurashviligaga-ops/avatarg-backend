const baseUrl = (process.env.BACKEND_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

const response = await fetch(`${baseUrl}/api/health`, { cache: 'no-store' });
const text = await response.text();

console.log(`[smoke:health] status=${response.status}`);
console.log(text);

if (!response.ok) {
  process.exit(1);
}
