# LINE Intern - Attendance System Documentation

## 📋 Overview

The Attendance System is a comprehensive mobile-first solution integrated into the LINE Intern bot that allows employees to check in and check out of work via LINE Direct Messages. The system features photo capture, GPS validation, geofencing, automated daily summaries, and a full admin dashboard.

---

## 🎯 Key Features

### For Employees
- ✅ **Check-in/Check-out via LINE DM** - Simple text commands
- ✅ **One-time secure links** - Token-based attendance submission
- ✅ **Mobile photo capture** - Front camera integration
- ✅ **GPS location verification** - Automatic location detection
- ✅ **Geofence validation** - Ensures employees are at correct location
- ✅ **Instant confirmations** - DM notifications after submission
- ✅ **Branch announcements** - Posts to configured LINE groups

### For HR/Admins
- ✅ **Employee management** - Link LINE accounts to employee records
- ✅ **Branch configuration** - Set up locations with geofences
- ✅ **Live attendance logs** - Real-time monitoring with filters
- ✅ **Analytics dashboard** - Trends, peak hours, late patterns
- ✅ **Daily summaries** - Automated reports sent to LINE groups
- ✅ **Flexible settings** - Global, branch, or employee-level rules
- ✅ **Flagged events** - Automatic detection of anomalies

---

## 🚀 Employee Workflow

### Step 1: Send Command in LINE DM

Employee opens a **private chat** with the LINE Intern bot and sends:
- `checkin` or `เช็คอิน` or `เข้างาน`
- `checkout` or `เช็คเอาต์` or `ออกงาน`

**⚠️ Important:** Commands ONLY work in Direct Messages (DM), not in group chats.

### Step 2: Receive Secure Link

The bot immediately responds with:
```
✅ กรุณากดลิงก์ด้านล่างเพื่อยืนยันเช็คอิน

🔗 https://[app-url]/attendance?t=[token]

⏰ ลิงก์นี้จะหมดอายุใน 10 นาที
```

### Step 3: Open Link on Mobile

Clicking the link opens a mobile-optimized web page that:
1. **Validates the token** (checks not expired, not already used)
2. **Shows employee and branch info**
3. **Requests camera access** (if photo required)
4. **Requests location access** (if location required)

### Step 4: Take Photo

If photo is required:
- Tap "Take Photo" button
- Allow camera access
- Camera opens (front-facing by default)
- Tap "Capture" to take the photo
- Review photo, retake if needed

### Step 5: Confirm Location

If location is required:
- Tap "Get Location" button
- Allow location access
- GPS coordinates are captured
- System validates against branch geofence

### Step 6: Submit

- Tap "Submit Check In/Out" button
- System processes submission:
  - Uploads photo (if provided)
  - Validates geofence (if location provided)
  - Records attendance log
  - Marks token as used

### Step 7: Receive Confirmations

**DM Confirmation:**
```
✅ เช็คอินสำเร็จ
⏰ เวลา: 09:15
📍 สาขา: Bangkok Office
```

**Group Announcement** (if configured):
```
คุณ Somchai Jaidee เช็คอินเวลา 09:15 ที่ Bangkok Office
```

**Flagged Events:**
If outside geofence:
```
⚠️ คำเตือน: นอกพื้นที่ (ห่าง 350 เมตร)
```

---

## 🏢 Admin Features

### 1. Employee Management (`/attendance/employees`)

**Features:**
- Create/edit employee records
- Link LINE accounts to employees
- Assign employees to branches
- Set employee-specific settings
- Activate/deactivate employees
- Configure announcement groups

**Key Fields:**
- Employee Code (unique identifier)
- Full Name
- Role (office, field, remote, etc.)
- LINE User ID (for linking)
- Branch assignment
- Announcement Group LINE ID

### 2. Branch Management (`/attendance/branches`)

**Features:**
- Create/edit branch locations
- Configure geofences (latitude, longitude, radius)
- Set branch-specific attendance rules
- Set standard start times
- Configure photo requirements
- Link to LINE announcement groups

**Key Fields:**
- Branch Name
- Type (office, warehouse, store, etc.)
- Address
- GPS Coordinates (lat/long)
- Geofence Radius (meters)
- Standard Start Time
- Photo Required (yes/no)
- LINE Group ID for announcements

### 3. Attendance Logs (`/attendance/logs`)

**Features:**
- Real-time attendance log viewing
- Advanced filtering:
  - By date range
  - By employee
  - By branch
  - By event type (check-in/check-out)
  - Flagged events only
- View submission details:
  - Photo preview
  - GPS coordinates
  - Device info
  - Flag reasons
- Export to CSV
- Bulk actions

### 4. Analytics Dashboard (`/attendance/analytics`)

**Features:**
- **Overview Cards**: Total check-ins/outs, active employees, flagged events
- **Trends Tab**: Daily check-in/check-out line chart
- **Peak Hours Tab**: Check-in distribution by hour
- **Late Patterns Tab**:
  - Late arrival percentage by branch
  - Flagged event reasons breakdown
  - Late arrival details table
- **Branch Comparison Tab**:
  - Check-ins vs flagged events comparison
  - Individual branch performance cards

### 5. Daily Summaries (`/attendance/summaries`)

**Features:**
- View past daily summary reports
- Filter by branch and date range
- See summary stats:
  - Total employees
  - Check-in/check-out counts
  - Late arrivals
  - Absent employees
  - Flagged events
- View original LINE message sent

### 6. Settings Management (`/attendance/settings`)

**Three-tier configuration:**

**Global Settings** (default for all):
- Enable/disable attendance system
- Require location
- Require photo
- Token validity (minutes)
- Daily summary time
- Time zone
- Standard start time

**Branch Settings** (override global):
- Same fields as global
- Applied to all employees in that branch

**Employee Settings** (override branch):
- Same fields as global/branch
- Applied to specific employee only

---

## 🏗️ Technical Architecture

### Database Schema

**employees**
- Employee records linked to LINE accounts
- Branch assignments
- Settings overrides

**branches**
- Branch locations and geofences
- Announcement group configurations
- Branch-specific settings

**attendance_tokens**
- One-time use tokens for submissions
- Expiration tracking
- Status tracking (pending/used/expired)

**attendance_logs**
- All check-in/check-out records
- Photo URLs (in storage bucket)
- GPS coordinates
- Device information
- Flagging data

**attendance_settings**
- Global, branch, and employee-level configurations
- Hierarchical settings resolution

**daily_attendance_summaries**
- Automated summary records
- LINE message IDs
- Statistical snapshots

### Edge Functions

#### 1. `attendance-validate-token`
**Purpose:** Validates attendance submission tokens

**Endpoint:** `GET /attendance-validate-token?t=[token]`

**Response:**
```json
{
  "valid": true,
  "token": {
    "id": "...",
    "type": "check_in",
    "expires_at": "..."
  },
  "employee": {
    "id": "...",
    "full_name": "...",
    "code": "..."
  },
  "branch": { ... },
  "settings": {
    "require_location": true,
    "require_photo": false,
    "token_validity_minutes": 10
  }
}
```

#### 2. `attendance-submit`
**Purpose:** Processes photo and location submissions

**Endpoint:** `POST /attendance-submit`

**Request:** FormData with:
- `token` - Token ID
- `latitude` - GPS latitude
- `longitude` - GPS longitude
- `deviceTime` - Device timestamp
- `timezone` - Device timezone
- `deviceInfo` - Device metadata JSON
- `photo` - File (if required)

**Process:**
1. Re-validate token
2. Upload photo to storage bucket
3. Calculate distance from branch geofence
4. Flag if outside radius or other issues
5. Mark token as used
6. Insert attendance log
7. Send DM confirmation
8. Post to announcement group

**Response:**
```json
{
  "success": true,
  "log": {
    "id": "...",
    "event_type": "check_in",
    "server_time": "...",
    "is_flagged": false,
    "flag_reason": null
  }
}
```

#### 3. `attendance-daily-summary`
**Purpose:** Generates and sends daily attendance summaries

**Triggered by:** Cron job (6:00 PM daily)

**Process:**
1. Get all active branches with LINE groups
2. For each branch:
   - Get all employees
   - Get today's check-in/check-out logs
   - Calculate statistics
   - Generate summary text
   - Post to LINE group
   - Store summary record

**Summary Format:**
```
📊 สรุปการเข้างาน 2024-01-15
📍 Bangkok Office

- Somchai Jaidee: เช็คอิน 09:05, เช็คเอาต์ 18:30
- Piyaporn Lee: เช็คอิน 09:15 (สาย), เช็คเอาต์ ยังไม่เช็คเอาต์
- Nattapong Wong: ไม่พบการเช็คอิน

📈 สรุป:
- เช็คอินแล้ว: 2/3 คน
- เช็คเอาต์แล้ว: 1/3 คน
- มาสาย: 1 คน
- มีข้อสังเกต: 0 คน
```

### LINE Webhook Integration

In `line-webhook` function, attendance command detection:

```typescript
const attendanceCommands = {
  checkIn: ['checkin', 'เช็คอิน', 'เข้างาน', 'check in'],
  checkOut: ['checkout', 'เช็คเอาต์', 'ออกงาน', 'check out']
};

// In DM only
if (isDM) {
  if (attendanceCommands.checkIn.some(cmd => messageTextLower === cmd)) {
    await handleAttendanceCommand(user, 'check_in', lineUserId);
    return;
  }
  if (attendanceCommands.checkOut.some(cmd => messageTextLower === cmd)) {
    await handleAttendanceCommand(user, 'check_out', lineUserId);
    return;
  }
}

// In group, redirect to DM
if (!isDM && /* attendance command detected */) {
  await replyMessage(
    event.replyToken,
    'กรุณาเช็คอิน/เช็คเอาต์ผ่านแชทส่วนตัวกับบอทเท่านั้นครับ'
  );
  return;
}
```

### Storage Bucket

**Bucket:** `attendance-photos`
- **Public:** No (authenticated access only)
- **File size limit:** 5MB
- **Allowed types:** image/jpeg, image/png, image/webp
- **Path structure:** `{employee_id}/{timestamp}.{ext}`

**RLS Policies:**
- Authenticated users can upload
- Authenticated users can view their own photos

---

## ⚙️ Configuration Guide

### Setting Up a New Branch

1. Go to `/attendance/branches`
2. Click "Add Branch"
3. Fill in:
   - Name (e.g., "Bangkok Office")
   - Type (office/warehouse/store)
   - Address
   - Latitude and Longitude (use Google Maps)
   - Geofence Radius (meters, default 200)
   - Photo Required (yes/no)
   - Standard Start Time (e.g., 09:00)
   - LINE Group ID (for announcements)
4. Save

### Adding an Employee

1. Go to `/attendance/employees`
2. Click "Add Employee"
3. Fill in:
   - Employee Code (unique)
   - Full Name
   - Role
   - Branch (select from dropdown)
   - LINE User ID (get from LINE, starts with "U...")
   - Announcement Group LINE ID (optional override)
   - Is Active (yes/no)
4. Save

### Linking LINE Account

**Option 1: Manual** (as described above)
- Get LINE User ID from LINE Developers Console
- Enter in employee record

**Option 2: Self-Service** (future enhancement)
- Employee sends command in DM
- Bot replies with linking code
- Employee enters code in dashboard

### Configuring Settings Hierarchy

**Global (affects all):**
1. Go to `/attendance/settings`
2. Edit global settings
3. Save

**Branch-specific (overrides global):**
1. Go to `/attendance/branches`
2. Edit a branch
3. Click "Settings" tab
4. Enable "Override global settings"
5. Set branch-specific values
6. Save

**Employee-specific (overrides branch):**
1. Go to `/attendance/employees`
2. Edit an employee
3. Click "Settings" tab
4. Enable "Override branch settings"
5. Set employee-specific values
6. Save

**Resolution Order:** Employee > Branch > Global

---

## 🧪 Testing Guide

### Test Checklist

**1. Employee Linking**
- [ ] Create employee record
- [ ] Add valid LINE User ID
- [ ] Verify employee shows as linked

**2. Check-in Flow**
- [ ] Send `checkin` in DM
- [ ] Receive one-time link
- [ ] Open link on mobile
- [ ] Token validates successfully
- [ ] Employee and branch info displayed
- [ ] Take photo (if required)
- [ ] Allow location (if required)
- [ ] Submit succeeds
- [ ] DM confirmation received
- [ ] Group announcement posted (if configured)
- [ ] Log appears in dashboard

**3. Check-out Flow**
- [ ] Send `checkout` in DM
- [ ] Same flow as check-in
- [ ] Verify event_type is "check_out"

**4. Geofence Validation**
- [ ] Set branch geofence (e.g., 200m radius)
- [ ] Check in from inside radius → no flag
- [ ] Check in from outside radius → flagged with distance
- [ ] Flag reason shows in log

**5. Token Security**
- [ ] Try using link twice → "already used" error
- [ ] Wait for token to expire → "expired" error
- [ ] Try invalid token → "not found" error

**6. Photo & Location**
- [ ] Set `require_photo = true` → photo capture required
- [ ] Set `require_location = true` → location required
- [ ] Submit without required field → error
- [ ] Photo appears in logs
- [ ] GPS coordinates recorded

**7. Daily Summary**
- [ ] Trigger cron manually or wait for scheduled time
- [ ] Verify summary posted to correct LINE groups
- [ ] Check summary includes all employees
- [ ] Verify stats are accurate
- [ ] Check summary stored in database

**8. Admin Dashboard**
- [ ] View logs with filters
- [ ] Export CSV
- [ ] Edit settings (global/branch/employee)
- [ ] View analytics charts
- [ ] View past summaries

---

## 🐛 Troubleshooting

### "Employee record not found"

**Cause:** LINE User ID not linked to employee record

**Fix:**
1. Get employee's LINE User ID
2. Go to `/attendance/employees`
3. Edit employee record
4. Add LINE User ID
5. Save

### "Token expired"

**Cause:** Link not used within validity period (default 10 minutes)

**Fix:**
1. Send command again to get new link
2. Use link faster
3. Increase `token_validity_minutes` in settings

### Photo upload fails

**Cause:** File too large or unsupported format

**Fix:**
1. Check file size < 5MB
2. Ensure format is JPG, PNG, or WebP
3. Check storage bucket configuration
4. Review edge function logs

### Geofence not working

**Cause:** Incorrect branch coordinates or radius

**Fix:**
1. Verify branch latitude/longitude
2. Test coordinates in Google Maps
3. Adjust geofence radius if needed
4. Ensure location permission granted on mobile

### Daily summary not sent

**Cause:** Cron job not configured or failed

**Fix:**
1. Check cron job status in database
2. Manually trigger edge function for testing
3. Check edge function logs for errors
4. Verify branch has LINE Group ID configured

### "Outside geofence" flag

**Cause:** Employee is genuinely outside radius, or GPS inaccuracy

**Fix:**
1. Check if employee is at correct location
2. Increase geofence radius if needed
3. Consider GPS accuracy (typically ±10-50 meters)
4. Review branch coordinates for accuracy

---

## 🔒 Security Considerations

### Token Security
- Tokens are one-time use only
- Tokens expire after configured minutes (default 10)
- Tokens cannot be reused or shared
- Token IDs are UUIDs (impossible to guess)

### Photo Privacy
- Photos stored in private storage bucket
- Only authenticated users can access
- RLS policies enforce access control
- Consider GDPR compliance for photo storage

### Location Privacy
- GPS coordinates stored but not publicly visible
- Used only for geofence validation
- Consider informing employees about tracking

### Access Control
- Admin features require authentication
- RLS policies on all tables
- Service role key used only in edge functions
- Secrets never exposed to client

---

## 📊 Analytics & Reporting

### Available Metrics

**Attendance Rates:**
- Daily check-in percentage
- Daily check-out percentage
- On-time vs late arrivals

**Peak Hours:**
- Check-in distribution by hour
- Busiest times

**Patterns:**
- Late arrival trends
- Consistent latecomers
- Branch comparisons

**Flagged Events:**
- Outside geofence frequency
- Photo upload failures
- Reasons breakdown

### Export Options

**CSV Export** (from Logs page):
- All fields included
- Filtered results only
- Date-stamped filename

**API Access** (future):
- RESTful endpoints for external systems
- Payroll integration
- Custom reporting tools

---

## 🚀 Future Enhancements

### High Priority
1. **Employee Self-Service Portal**
   - View own attendance history
   - Request corrections
   - Download attendance reports

2. **Smart Notifications**
   - Remind employees who haven't checked in
   - Alert managers of unusual patterns
   - Escalate repeated late arrivals

3. **Leave Management**
   - Request time off via LINE
   - Approval workflows
   - Leave balance tracking

### Medium Priority
4. **Shift Management**
   - Multiple shifts per branch
   - Shift assignments
   - Shift change requests

5. **Overtime Tracking**
   - Detect overtime based on check-out time
   - Approval requests
   - Overtime reports

6. **Enhanced Analytics**
   - Predictive analytics (who's likely to be late)
   - Attendance forecasting
   - Custom date range reports

### Low Priority
7. **Payroll Integration**
   - Export for payroll systems
   - Automatic hour calculation
   - Deduction calculations

8. **QR Code Check-in**
   - Alternative to GPS
   - Scan QR at entrance
   - Faster for high-traffic locations

9. **Facial Recognition**
   - AI-powered face matching
   - Prevent proxy check-ins
   - Privacy-preserving options

---

## 📞 Support

For issues or questions:
1. Check edge function logs in Lovable Cloud
2. Review attendance logs in dashboard
3. Check LINE group for announcement posts
4. Verify settings configuration
5. Test with a known-good employee record

---

## 📄 License

Internal use only - LINE Intern Control Panel
