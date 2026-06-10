-- ⚡ SUPABASE DATABASE SCHEMA FOR CODESHARE (UPDATED FOR WORKSPACES & ADVANCED FEATURES) ⚡
-- Copy and run this script in your Supabase SQL Editor.

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create/Extend the USERS table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'FREE' CHECK (plan IN ('FREE', 'PRO', 'PREMIUM')),
    plan_selected_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    codeshare_count INTEGER NOT NULL DEFAULT 0 CHECK (codeshare_count >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    avatar_url TEXT DEFAULT NULL,
    display_name TEXT DEFAULT NULL
);

-- Ensure columns exist if table was already created
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS display_name TEXT DEFAULT NULL;

-- 2. Create the WORKSPACES table
CREATE TABLE IF NOT EXISTS public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create the WORKSPACE_MEMBERS table
CREATE TABLE IF NOT EXISTS public.workspace_members (
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (workspace_id, user_id)
);

-- 4. Create the ROOMS table
CREATE TABLE IF NOT EXISTS public.rooms (
    id TEXT PRIMARY KEY, -- Stores the nanoid(8) room code
    owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    owner_token TEXT NOT NULL, -- Stores the nanoid(16) creator token
    code TEXT NOT NULL DEFAULT '// Start coding here...
',
    language TEXT NOT NULL DEFAULT 'javascript',
    view_only_mode BOOLEAN NOT NULL DEFAULT false,
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure workspace_id column exists if table was already created
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- 5. Create the MESSAGES table (persistent chat with read receipts)
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id TEXT REFERENCES public.rooms(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    read_by JSONB NOT NULL DEFAULT '[]'::jsonb, -- Stores user IDs who have read this message
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Create the FILES table (screenshot and file uploads metadata)
CREATE TABLE IF NOT EXISTS public.files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id TEXT REFERENCES public.rooms(id) ON DELETE CASCADE,
    uploader_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT NOT NULL,
    caption TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure caption column exists if table was already created
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS caption TEXT DEFAULT NULL;

-- 7. Indexes for performance optimizations
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_rooms_owner_id ON public.rooms(owner_id);
CREATE INDEX IF NOT EXISTS idx_rooms_workspace_id ON public.rooms(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON public.workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_room_id ON public.messages(room_id);
CREATE INDEX IF NOT EXISTS idx_files_room_id ON public.files(room_id);

-- 8. Row Level Security (RLS) Configuration
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- Note on RLS Policies:
-- Since the Node.js backend runs in a trusted server environment, it uses 
-- the SUPABASE_SERVICE_ROLE_KEY which bypasses RLS policies automatically.
