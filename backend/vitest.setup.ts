// Global test env bootstrap to satisfy zod env schema before module imports
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'test';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test';
process.env.CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000';
process.env.CHROMA_USERNAME = process.env.CHROMA_USERNAME || 'user';
process.env.CHROMA_PASSWORD = process.env.CHROMA_PASSWORD || 'pass';
process.env.CHROMA_SERVER_HOST = process.env.CHROMA_SERVER_HOST || 'localhost';
process.env.CHROMA_SERVER_HTTP_PORT =
  process.env.CHROMA_SERVER_HTTP_PORT || '8000';
process.env.REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
