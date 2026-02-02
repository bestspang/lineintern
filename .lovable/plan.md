

## แผน: ปรับปรุง Broadcast Management - เพิ่ม Logs และการแปลภาษา

### สรุปความต้องการ

| ฟีเจอร์ | รายละเอียด |
|--------|-----------|
| **Broadcast Logs** | เพิ่ม Tab "Logs" แสดงประวัติการส่งแบบละเอียด พร้อมค้นหา/กรองได้ |
| **Language Toggle** | เพิ่มปุ่มสลับภาษา TH/EN ทั้งหน้า Broadcast |

---

### การเปลี่ยนแปลง

#### 1. เพิ่ม Tab "Logs" แสดงประวัติการส่ง

**ฐานข้อมูล:** มีตาราง `broadcast_logs` อยู่แล้ว
- `id`, `broadcast_id`, `recipient_id`, `recipient_name`
- `line_id`, `delivery_status`, `error_message`, `sent_at`

**UI ใหม่:**
```
┌─────────────────────────────────────────────────────────────┐
│ Tab: Delivery Logs                                          │
├─────────────────────────────────────────────────────────────┤
│ [Search: ชื่อผู้รับ, LINE ID]  [Filter: Status ▼] [Date ▼]  │
├─────────────────────────────────────────────────────────────┤
│ Broadcast    │ Recipient    │ Status │ Sent At    │ Error  │
│─────────────────────────────────────────────────────────────│
│ Newsletter   │ Pass         │ ✓ Sent │ 26 Jan 10:50│ -     │
│ Newsletter   │ Nu           │ ✓ Sent │ 26 Jan 10:50│ -     │
│ Promo        │ Fern         │ ✗ Fail │ 25 Jan 09:00│ No ID │
└─────────────────────────────────────────────────────────────┘
```

**ฟีเจอร์:**
- ค้นหาตาม: ชื่อ Broadcast, ชื่อผู้รับ, LINE ID
- กรองตาม: Status (sent/failed/skipped), Date range
- เรียงลำดับ: ใหม่สุดก่อน
- Pagination: 50 รายการ/หน้า

---

#### 2. เพิ่ม Detail View สำหรับ History Tab

**ปรับปรุง History Tab:**
- เพิ่มปุ่ม "View Logs" ในแต่ละ Broadcast row
- คลิกแล้วเปิด Dialog แสดง delivery logs ของ Broadcast นั้น

```
┌──────────────────────────────────────────────────────────┐
│ ❐ Newsletter December - Delivery Details                 │
├──────────────────────────────────────────────────────────┤
│ Summary: 50 sent | 2 failed                              │
├──────────────────────────────────────────────────────────┤
│ [Search recipient...]                                    │
├──────────────────────────────────────────────────────────┤
│ Recipient    │ LINE ID        │ Status │ Time    │ Error │
│──────────────────────────────────────────────────────────│
│ Pass         │ Ub1df...       │ ✓ Sent │ 10:50   │ -     │
│ Fern         │ U0576...       │ ✗ Fail │ 10:49   │ Token │
└──────────────────────────────────────────────────────────┘
```

---

#### 3. เพิ่ม Language Toggle (TH/EN)

**ตำแหน่ง:** Header ของหน้า Broadcast
```
┌─────────────────────────────────────────────────────────────┐
│ 📻 Broadcast Management              [TH] [EN]              │
│ Send messages to users, groups, and employees               │
└─────────────────────────────────────────────────────────────┘
```

**Translations ที่ต้องเพิ่ม:**

| Key | Thai | English |
|-----|------|---------|
| pageTitle | การแพร่สัญญาณ | Broadcast Management |
| pageDesc | ส่งข้อความถึงผู้ใช้ กลุ่ม และพนักงาน | Send messages to users, groups, and employees |
| tabCreate | สร้างใหม่ | Create New |
| tabCalendar | ปฏิทิน | Calendar |
| tabHistory | ประวัติ | History |
| tabLogs | บันทึกการส่ง | Delivery Logs |
| tabTemplates | เทมเพลต | Templates |
| tabGroups | กลุ่มผู้รับ | Recipient Groups |
| messageContent | เนื้อหาข้อความ | Message Content |
| composeMessage | เขียนข้อความ | Compose your broadcast message |
| titleLabel | หัวข้อ (ภายใน) | Title (Internal) |
| messageType | ประเภทข้อความ | Message Type |
| textOnly | ข้อความเท่านั้น | Text Only |
| imageOnly | รูปภาพเท่านั้น | Image Only |
| textImage | ข้อความ + รูปภาพ | Text + Image |
| sendNow | ส่งตอนนี้ | Send Now |
| schedule | ตั้งเวลาส่ง | Schedule |
| scheduleFor | กำหนดเวลา | Schedule for |
| recurring | ส่งซ้ำ | Recurring |
| recipients | ผู้รับ | Recipients |
| selectRecipients | เลือกผู้รับ | Select recipients |
| users | ผู้ใช้ | Users |
| groups | กลุ่ม | Groups |
| employees | พนักงาน | Employees |
| savedGroups | กลุ่มที่บันทึก | Saved Groups |
| preview | ดูตัวอย่าง | Preview |
| sendBroadcast | ส่งข้อความ | Send Broadcast |
| noRecipients | ยังไม่ได้เลือกผู้รับ | No recipients selected |
| sent | ส่งแล้ว | Sent |
| failed | ล้มเหลว | Failed |
| skipped | ข้าม | Skipped |
| pending | รอดำเนินการ | Pending |
| cancelled | ยกเลิก | Cancelled |
| viewLogs | ดูบันทึก | View Logs |
| searchPlaceholder | ค้นหา... | Search... |
| filterByStatus | กรองตามสถานะ | Filter by status |
| allStatus | ทั้งหมด | All |
| deliveryDetails | รายละเอียดการส่ง | Delivery Details |

---

### ไฟล์ที่ต้องแก้ไข

| ไฟล์ | การเปลี่ยนแปลง |
|------|---------------|
| `src/pages/Broadcast.tsx` | เพิ่ม Tab "Logs", Language toggle, แปลทุก label |
| `src/lib/translations.ts` | เพิ่ม translations สำหรับ Broadcast page |

---

### รายละเอียดทางเทคนิค

#### Query สำหรับ Logs Tab
```typescript
const { data: logs } = useQuery({
  queryKey: ['broadcast-logs', searchTerm, statusFilter, dateRange],
  queryFn: async () => {
    let query = supabase
      .from('broadcast_logs')
      .select(`
        *,
        broadcast:broadcasts(id, title)
      `)
      .order('sent_at', { ascending: false })
      .limit(50);
    
    if (searchTerm) {
      query = query.or(`recipient_name.ilike.%${searchTerm}%,line_id.ilike.%${searchTerm}%`);
    }
    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('delivery_status', statusFilter);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }
});
```

#### State สำหรับ Search/Filter
```typescript
const [logSearchTerm, setLogSearchTerm] = useState('');
const [logStatusFilter, setLogStatusFilter] = useState<'all' | 'sent' | 'failed' | 'skipped'>('all');
const [selectedBroadcastForLogs, setSelectedBroadcastForLogs] = useState<string | null>(null);
```

#### Language Toggle Component
```typescript
const { locale, setLocale, t } = useLocale();

// Header area
<div className="flex items-center gap-2">
  <Button
    variant={locale === 'th' ? 'default' : 'outline'}
    size="sm"
    onClick={() => setLocale('th')}
  >
    TH
  </Button>
  <Button
    variant={locale === 'en' ? 'default' : 'outline'}
    size="sm"
    onClick={() => setLocale('en')}
  >
    EN
  </Button>
</div>
```

---

### ผลลัพธ์ที่คาดหวัง

| ฟีเจอร์ | Before | After |
|--------|--------|-------|
| Broadcast logs | ❌ ไม่มี | ✅ Tab "Logs" + Detail view |
| ค้นหา logs | ❌ ไม่ได้ | ✅ Search by name/LINE ID |
| กรอง logs | ❌ ไม่ได้ | ✅ Filter by status |
| ภาษา Thai | ✅ บางส่วน | ✅ ทั้งหน้า |
| ภาษา English | ❌ ไม่มี | ✅ ทั้งหน้า |
| Language toggle | ❌ ไม่มี | ✅ ปุ่ม TH/EN ที่ header |

