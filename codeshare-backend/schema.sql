-- ⚡ SUPABASE DATABASE SCHEMA FOR CODESHARE ⚡
-- Copy and run this script in your Supabase SQL Editor.

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create the USERS table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'FREE' CHECK (plan IN ('FREE', 'PRO', 'PREMIUM')),
    plan_selected_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    codeshare_count INTEGER NOT NULL DEFAULT 0 CHECK (codeshare_count >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create the ROOMS table
CREATE TABLE IF NOT EXISTS public.rooms (
    id TEXT PRIMARY KEY, -- Stores the nanoid(8) room code
    owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    owner_token TEXT NOT NULL, -- Stores the nanoid(16) creator token
    code TEXT NOT NULL DEFAULT '// Start coding here...
',
    language TEXT NOT NULL DEFAULT 'javascript',
    view_only_mode BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Indexes for performance optimizations
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_rooms_owner_id ON public.rooms(owner_id);

-- 4. Row Level Security (RLS) Configuration
-- Enable RLS on both tables for security best practices.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Note on RLS Policies:
-- Since the Node.js backend runs in a trusted server environment, it should use 
-- the SUPABASE_SERVICE_ROLE_KEY. The service_role key bypasses RLS policies automatically.
-- This keeps your database secure from direct public access while letting the backend
-- handle authentication and authorization.

-- If you ever want to allow direct client-side querying in the future, you can uncomment
-- and define policies like below, but for this project structure, using service_role is recommended:
-- CREATE POLICY "Allow service role full access" ON public.users TO service_role USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow service role full access" ON public.rooms TO service_role USING (true) WITH CHECK (true);
