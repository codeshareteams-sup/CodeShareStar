const express = require('express');
const supabase = require('../utils/supabase');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Helper to check if user is a member of a workspace
async function isMember(workspaceId, userId) {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .single();
  
  if (error || !data) return false;
  return data.role;
}

// ── POST /api/workspaces (Create a Workspace) ────────────────────────────────
router.post('/', verifyToken, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Workspace name is required.' });
    }

    // 1. Create workspace
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .insert({
        name: name.trim(),
        created_by: req.userId
      })
      .select()
      .single();

    if (wsError || !workspace) {
      console.error('Create workspace error:', wsError);
      return res.status(500).json({ error: 'Failed to create workspace.' });
    }

    // 2. Add creator as owner
    const { error: memberError } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: workspace.id,
        user_id: req.userId,
        role: 'owner'
      });

    if (memberError) {
      console.error('Create member error:', memberError);
      return res.status(500).json({ error: 'Workspace created but failed to join as owner.' });
    }

    res.status(201).json({ workspace, role: 'owner' });
  } catch (err) {
    console.error('Workspaces create catch error:', err);
    res.status(500).json({ error: 'Server error creating workspace.' });
  }
});

// ── GET /api/workspaces (List user's Workspaces) ─────────────────────────────
router.get('/', verifyToken, async (req, res) => {
  try {
    // 1. Fetch user's workspace memberships
    const { data: memberships, error: memberError } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', req.userId);

    if (memberError) {
      console.error('List workspaces memberships error:', memberError);
      return res.status(500).json({ error: 'Failed to fetch workspace list.' });
    }

    if (!memberships || memberships.length === 0) {
      return res.json([]);
    }

    const workspaceIds = memberships.map(m => m.workspace_id);

    // 2. Fetch workspace details
    const { data: workspaces, error: wsError } = await supabase
      .from('workspaces')
      .select('*')
      .in('id', workspaceIds);

    if (wsError) {
      console.error('Fetch workspaces details error:', wsError);
      return res.status(500).json({ error: 'Failed to fetch workspace details.' });
    }

    // 3. Merge workspace details with user role
    const wsWithRoles = workspaces.map(ws => {
      const match = memberships.find(m => m.workspace_id === ws.id);
      return {
        ...ws,
        role: match ? match.role : 'member'
      };
    });

    res.json(wsWithRoles);
  } catch (err) {
    console.error('Workspaces list catch error:', err);
    res.status(500).json({ error: 'Server error listing workspaces.' });
  }
});

// ── POST /api/workspaces/join (Join an existing Workspace) ────────────────────
router.post('/join', verifyToken, async (req, res) => {
  try {
    const { workspaceId } = req.body;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID is required.' });
    }

    // 1. Check if workspace exists
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id, name')
      .eq('id', workspaceId)
      .single();

    if (wsError || !workspace) {
      return res.status(404).json({ error: 'Workspace not found.' });
    }

    // 2. Check if already a member
    const existingRole = await isMember(workspaceId, req.userId);
    if (existingRole) {
      return res.status(409).json({ error: 'You are already a member of this workspace.' });
    }

    // 3. Add user as member
    const { error: joinError } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: workspaceId,
        user_id: req.userId,
        role: 'member'
      });

    if (joinError) {
      console.error('Join workspace error:', joinError);
      return res.status(500).json({ error: 'Failed to join workspace.' });
    }

    res.json({ message: `Successfully joined workspace ${workspace.name}`, workspace });
  } catch (err) {
    console.error('Workspaces join catch error:', err);
    res.status(500).json({ error: 'Server error joining workspace.' });
  }
});

// ── GET /api/workspaces/:id/members (List Workspace Members) ──────────────────
router.get('/:id/members', verifyToken, async (req, res) => {
  try {
    const workspaceId = req.params.id;

    // 1. Authorize: Check if requesting user is a member
    const userRole = await isMember(workspaceId, req.userId);
    if (!userRole) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this workspace.' });
    }

    // 2. Fetch all members
    const { data: members, error: membersError } = await supabase
      .from('workspace_members')
      .select('user_id, role')
      .eq('workspace_id', workspaceId);

    if (membersError || !members) {
      console.error('Fetch members role error:', membersError);
      return res.status(500).json({ error: 'Failed to list members.' });
    }

    const userIds = members.map(m => m.user_id);

    // 3. Fetch user details
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, username, display_name, avatar_url, plan')
      .in('id', userIds);

    if (usersError || !users) {
      console.error('Fetch members users details error:', usersError);
      return res.status(500).json({ error: 'Failed to fetch member details.' });
    }

    // 4. Merge details
    const result = users.map(u => {
      const match = members.find(m => m.user_id === u.id);
      return {
        ...u,
        role: match ? match.role : 'member'
      };
    });

    res.json(result);
  } catch (err) {
    console.error('Workspaces members catch error:', err);
    res.status(500).json({ error: 'Server error listing members.' });
  }
});

module.exports = router;
