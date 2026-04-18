// apps/web/src/routes/blogs/+page.ts
// Marketing index — server load only reads markdown files (no per-user data),
// so we can prerender at build time. SSR + CSR remain default.
export const prerender = true;
