/* ================================================================
   supabase-client.js — Supabase 客户端初始化
   使用 CDN: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
   ================================================================ */

// TODO: 替换为你的 Supabase 项目凭证
// 从 https://app.supabase.com → Settings → API 获取
const SUPABASE_URL = 'https://krvztfxtybxnlqauefhz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtydnp0Znh0eWJ4bmxxYXVlZmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MDk3MDcsImV4cCI6MjA5NDA4NTcwN30.uM4YA0Yng2bkdhXeH4GdY8lByuUWgU78byDubwESg9k';

let __sb = null;

function getSupabase() {
  if (!__sb) {
    if (typeof supabase === 'undefined' || !supabase.createClient) {
      throw new Error('Supabase SDK 未加载，请检查 index.html 中的 CDN script 标签');
    }
    if (SUPABASE_URL.startsWith('__')) {
      throw new Error('请在 js/supabase-client.js 中配置 SUPABASE_URL 和 SUPABASE_ANON_KEY');
    }
    __sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  }
  return __sb;
}
