import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UploadRequest {
  lineUserId: string;
  receiptId: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  year?: string;
  month?: string;
}

async function getValidAccessToken(supabase: any, lineUserId: string): Promise<string | null> {
  const { data: tokenData } = await supabase
    .from('google_tokens')
    .select('*')
    .eq('line_user_id', lineUserId)
    .single();

  if (!tokenData) return null;

  // Check if token is expired
  const isExpired = new Date(tokenData.token_expiry) < new Date();
  
  if (!isExpired) {
    return tokenData.access_token;
  }

  // Token expired, refresh it
  const { data: clientIdConfig } = await supabase
    .from('api_configurations')
    .select('key_value')
    .eq('key_name', 'GOOGLE_CLIENT_ID')
    .single();

  const { data: clientSecretConfig } = await supabase
    .from('api_configurations')
    .select('key_value')
    .eq('key_name', 'GOOGLE_CLIENT_SECRET')
    .single();

  if (!clientIdConfig?.key_value || !clientSecretConfig?.key_value) {
    return null;
  }

  const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientIdConfig.key_value,
      client_secret: clientSecretConfig.key_value,
      refresh_token: tokenData.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  const refreshData = await refreshResponse.json();
  if (refreshData.error) {
    console.error('[Google Drive] Token refresh failed:', refreshData);
    return null;
  }

  // Update stored token
  const newExpiry = new Date(Date.now() + (refreshData.expires_in * 1000));
  await supabase
    .from('google_tokens')
    .update({
      access_token: refreshData.access_token,
      token_expiry: newExpiry.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('line_user_id', lineUserId);

  return refreshData.access_token;
}

async function ensureFolderStructure(accessToken: string, supabase: any, lineUserId: string, year: string, month: string): Promise<string> {
  const { data: tokenData } = await supabase
    .from('google_tokens')
    .select('drive_folder_id')
    .eq('line_user_id', lineUserId)
    .single();

  let rootFolderId = tokenData?.drive_folder_id;

  // Create root folder if not exists
  if (!rootFolderId) {
    rootFolderId = await createFolder(accessToken, 'Receipts', null);
    await supabase
      .from('google_tokens')
      .update({ drive_folder_id: rootFolderId, updated_at: new Date().toISOString() })
      .eq('line_user_id', lineUserId);
  }

  // Create year folder
  const yearFolderId = await findOrCreateFolder(accessToken, year, rootFolderId);

  // Create month folder
  const monthFolderId = await findOrCreateFolder(accessToken, month, yearFolderId);

  return monthFolderId;
}

async function createFolder(accessToken: string, name: string, parentId: string | null): Promise<string> {
  const metadata: any = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const response = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });

  const data = await response.json();
  return data.id;
}

async function findOrCreateFolder(accessToken: string, name: string, parentId: string): Promise<string> {
  // Search for existing folder
  const query = `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    }
  );
  const searchData = await searchResponse.json();

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create new folder
  return await createFolder(accessToken, name, parentId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: UploadRequest = await req.json();
    const { lineUserId, receiptId, fileName, fileUrl, mimeType = 'image/jpeg' } = body;

    // Get current date for folder structure
    const now = new Date();
    const year = body.year || now.getFullYear().toString();
    const month = body.month || String(now.getMonth() + 1).padStart(2, '0');

    // Get valid access token
    const accessToken = await getValidAccessToken(supabase, lineUserId);
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: 'Google account not connected or token invalid' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure folder structure exists
    const folderId = await ensureFolderStructure(accessToken, supabase, lineUserId, year, month);

    // Download file from Supabase Storage
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      throw new Error('Failed to fetch file from storage');
    }
    const fileBlob = await fileResponse.blob();

    // Upload to Google Drive using multipart upload
    const metadata = {
      name: fileName,
      parents: [folderId],
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', fileBlob, fileName);

    const uploadResponse = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
        body: form,
      }
    );

    const uploadData = await uploadResponse.json();

    if (uploadData.error) {
      console.error('[Google Drive] Upload error:', uploadData);
      return new Response(
        JSON.stringify({ error: uploadData.error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update receipt with Google file ID
    await supabase
      .from('receipts')
      .update({ 
        google_file_id: uploadData.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', receiptId);

    console.log(`[Google Drive] Uploaded file ${fileName} to folder ${folderId}, fileId: ${uploadData.id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        fileId: uploadData.id,
        webViewLink: uploadData.webViewLink
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[Google Drive] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});