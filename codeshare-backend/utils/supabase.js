const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL && process.env.SUPABASE_URL.startsWith('http') 
  ? process.env.SUPABASE_URL 
  : 'https://placeholder.supabase.co';
  
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'placeholder_key';

const isPlaceholder = supabaseUrl === 'https://placeholder.supabase.co';

if (isPlaceholder) {
  console.warn('⚠️ No valid Supabase credentials found in .env.');
  console.warn('🚀 Using IN-MEMORY MOCK SUPABASE so the app can run locally!');
  console.warn('Data will be lost on server restart. Add real keys to persist data.');
}

// ── MOCK SUPABASE CLIENT ──────────────────────────────────────────────────────
class MockQuery {
  constructor(tableData) {
    this.tableData = tableData;
    this.op = 'select';
    this.filters = [];
    this.isSingle = false;
    this.payload = null;
  }
  select() { 
    if (this.op !== 'insert' && this.op !== 'update') {
      this.op = 'select'; 
    }
    return this; 
  }
  insert(data) { this.op = 'insert'; this.payload = data; return this; }
  update(data) { this.op = 'update'; this.payload = data; return this; }
  eq(col, val) { this.filters.push({ col, val }); return this; }
  single() { this.isSingle = true; return this; }
  
  then(resolve) {
    let result = [...this.tableData];
    
    if (this.op === 'insert') {
      const crypto = require('crypto');
      const records = Array.isArray(this.payload) ? this.payload : [this.payload];
      const inserted = records.map(r => ({
        id: r.id || crypto.randomUUID(),
        created_at: r.created_at || new Date().toISOString(),
        codeshare_count: r.codeshare_count || 0,
        ...r
      }));
      this.tableData.push(...inserted);
      result = inserted;
    } else {
      this.filters.forEach(f => {
        result = result.filter(item => item[f.col] === f.val);
      });
      if (this.op === 'update') {
        result.forEach(item => Object.assign(item, this.payload));
      }
    }
    
    setTimeout(() => {
      resolve({ data: this.isSingle ? (result[0] || null) : result, error: null });
    }, 10);
  }
}

class MockSupabase {
  constructor() {
    this.db = { 
      users: [
        {
          id: 'test-user-1',
          email: 'sharadgupta829950@gmail.com',
          username: 'Sharad',
          password_hash: 'mock_hash',
          plan: 'PREMIUM',
          plan_selected_at: new Date(),
          codeshare_count: 5
        },
        {
          id: 'test-user-2',
          email: 'sharadgupta6393@gmail.com',
          username: 'Sharad',
          password_hash: 'mock_hash',
          plan: 'PREMIUM',
          plan_selected_at: new Date(),
          codeshare_count: 5
        }
      ], 
      rooms: [] 
    };
  }
  from(table) {
    if (!this.db[table]) this.db[table] = [];
    return new MockQuery(this.db[table]);
  }
}

const supabase = isPlaceholder 
  ? new MockSupabase() 
  : createClient(supabaseUrl, supabaseKey);

module.exports = supabase;


