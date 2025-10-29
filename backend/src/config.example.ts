export const configExample = {
  SUPABASE_URL: 'your_supabase_project_url_here',
  SUPABASE_SERVICE_ROLE_KEY: 'your_supabase_service_role_key_here',
  SUPABASE_ANON_KEY: 'your_supabase_anon_key_here',
  CHROMA_URL: 'http://localhost:8000',
  CHROMA_USERNAME: 'admin',
  CHROMA_PASSWORD: 'password',
  CHROMA_SERVER_HOST: 'localhost',
  CHROMA_SERVER_HTTP_PORT: '8000',
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
  REDIS_PASSWORD: 'optional_redis_password',
  OLLAMA_BASE: 'http://localhost:11434',
  OLLAMA_MODEL: 'llama3',
  OPENAI_API_KEY: 'your_openai_api_key_here',
  LLM_PROVIDER: 'ollama', // or 'openai'
  DEFAULT_TZ: 'Australia/Sydney',
};
