import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AppendRequest {
  lineUserId: string;
  receiptId: string;
  receiptData: {
    date: string;
    vendor: string;
    category: string;
    amount: number;
    tax?: number;
    total: number;
    description?: string;
    fileLink?: string;
    businessName?: string;
  };
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
    console.error('[Google Sheets] Token refresh failed:', refreshData);
    return null;
  }

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

async function ensureSpreadsheet(accessToken: string, supabase: any, lineUserId: string, year: string, month: string): Promise<{ spreadsheetId: string; sheetName: string }> {
  const sheetName = `${year}-${month}`;
  
  // Get stored spreadsheet ID
  const { data: tokenData } = await supabase
    .from('google_tokens')
    .select('spreadsheet_id, drive_folder_id')
    .eq('line_user_id', lineUserId)
    .single();

  let spreadsheetId = tokenData?.spreadsheet_id;

  // Create spreadsheet if not exists
  if (!spreadsheetId) {
    const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: 'Receipt Ledger',
        },
        sheets: [{
          properties: { title: sheetName },
        }],
      }),
    });

    const createData = await createResponse.json();
    if (createData.error) {
      throw new Error(createData.error.message);
    }

    spreadsheetId = createData.spreadsheetId;

    // Store spreadsheet ID
    await supabase
      .from('google_tokens')
      .update({ spreadsheet_id: spreadsheetId, updated_at: new Date().toISOString() })
      .eq('line_user_id', lineUserId);

    // Add headers to the sheet
    await addSheetHeaders(accessToken, spreadsheetId, sheetName);

    // Move spreadsheet to Receipts folder if exists
    if (tokenData?.drive_folder_id) {
      await moveToFolder(accessToken, spreadsheetId, tokenData.drive_folder_id);
    }

    return { spreadsheetId, sheetName };
  }

  // Check if sheet for this month exists
  const sheetExists = await checkSheetExists(accessToken, spreadsheetId, sheetName);
  if (!sheetExists) {
    await createSheet(accessToken, spreadsheetId, sheetName);
    await addSheetHeaders(accessToken, spreadsheetId, sheetName);
  }

  return { spreadsheetId, sheetName };
}

async function checkSheetExists(accessToken: string, spreadsheetId: string, sheetName: string): Promise<boolean> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  const data = await response.json();
  return data.sheets?.some((s: any) => s.properties.title === sheetName) ?? false;
}

async function createSheet(accessToken: string, spreadsheetId: string, sheetName: string): Promise<void> {
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [{
        addSheet: {
          properties: { title: sheetName },
        },
      }],
    }),
  });
}

async function addSheetHeaders(accessToken: string, spreadsheetId: string, sheetName: string): Promise<void> {
  const headers = [
    ['Date', 'Vendor', 'Category', 'Amount', 'Tax', 'Total', 'Description', 'Business', 'Receipt ID', 'File Link']
  ];

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:J1?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: headers }),
    }
  );
}

async function moveToFolder(accessToken: string, fileId: string, folderId: string): Promise<void> {
  // Get current parents
  const getResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  const fileData = await getResponse.json();
  const previousParents = fileData.parents?.join(',') || '';

  // Move file
  await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${folderId}&removeParents=${previousParents}`,
    {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    }
  );
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

    const body: AppendRequest = await req.json();
    const { lineUserId, receiptId, receiptData } = body;

    // Parse date for folder/sheet structure
    const receiptDate = new Date(receiptData.date);
    const year = body.year || receiptDate.getFullYear().toString();
    const month = body.month || String(receiptDate.getMonth() + 1).padStart(2, '0');

    // Get valid access token
    const accessToken = await getValidAccessToken(supabase, lineUserId);
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: 'Google account not connected or token invalid' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure spreadsheet and sheet exist
    const { spreadsheetId, sheetName } = await ensureSpreadsheet(accessToken, supabase, lineUserId, year, month);

    // Prepare row data
    const rowData = [
      receiptData.date,
      receiptData.vendor || '',
      receiptData.category || '',
      receiptData.amount || 0,
      receiptData.tax || 0,
      receiptData.total || 0,
      receiptData.description || '',
      receiptData.businessName || '',
      receiptId,
      receiptData.fileLink || ''
    ];

    // Append row
    const appendResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:J:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [rowData] }),
      }
    );

    const appendData = await appendResponse.json();

    if (appendData.error) {
      console.error('[Google Sheets] Append error:', appendData);
      return new Response(
        JSON.stringify({ error: appendData.error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract row number from updated range
    const updatedRange = appendData.updates?.updatedRange;
    const rowMatch = updatedRange?.match(/!A(\d+):/);
    const rowNumber = rowMatch ? parseInt(rowMatch[1]) : null;

    // Update receipt with sheet row
    if (rowNumber) {
      await supabase
        .from('receipts')
        .update({ 
          google_sheet_row: rowNumber,
          updated_at: new Date().toISOString()
        })
        .eq('id', receiptId);
    }

    console.log(`[Google Sheets] Appended receipt ${receiptId} to row ${rowNumber}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        spreadsheetId,
        sheetName,
        rowNumber
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[Google Sheets] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});