

## แผนปรับปรุง Direct Messages - แก้ปัญหาความซ้ำซ้อนและพื้นที่เสียเปล่า

### ปัญหาที่พบจาก Screenshot

| ปัญหา | รายละเอียด | ความรุนแรง |
|-------|-----------|-----------|
| **Header ซ้ำซ้อน** | "แชท" แสดง 2 ครั้งพร้อม icon เดียวกัน | สูง |
| **พื้นที่ว่างด้านบน** | Header รวม ~150px ก่อนถึงเนื้อหา | สูง |
| **Empty state ซ้ำ** | แสดงข้อความ "เลือกการสนทนา" ทั้งกลางและขวา | กลาง |
| **Info panel ว่างเปล่า** | แสดงแม้ไม่ได้เลือกการสนทนา | กลาง |
| **Double border** | border-r ซ้ำทั้งใน List และ wrapper | ต่ำ |

---

### การออกแบบใหม่

**Before (ปัจจุบัน):**
```
┌────────────────────────────────────────────────────────┐
│ 💬 แชท                                  [ซ่อนข้อมูล]  │  ← Header #1
│ สนทนากับผู้ใช้ LINE พร้อมบันทึก...                      │
├────────────────────────────────────────────────────────┤
│ 💬 แชท  (10)                                          │  ← Header #2 (ซ้ำ!)
│ [🔍 ค้นหา...]                                          │
│ [ทั้งหมด] [พนักงาน] [ภายนอก]                           │
├────────┬─────────────────────────┬─────────────────────┤
│ List   │  เลือกการสนทนา...       │ เลือกการสนทนา...    │  ← Empty ซ้ำกัน!
└────────┴─────────────────────────┴─────────────────────┘
```

**After (ใหม่):**
```
┌────────────────────────────────────────────────────────┐
│ 💬 แชท (10)    [🔍 ค้นหา...]    [ซ่อน/แสดงข้อมูล] │  ← Compact header
│ [ทั้งหมด] [พนักงาน] [ภายนอก]                           │
├────────┬───────────────────────────────────────────────┤
│        │                                               │
│  List  │         เลือกการสนทนาเพื่อเริ่มแชท            │  ← Empty เดียว
│        │                                               │    (Info panel ซ่อนไว้)
│        │                                               │
└────────┴───────────────────────────────────────────────┘
```

---

### การเปลี่ยนแปลง

#### 1. DirectMessages.tsx - ลบ Page Header

**ลบทิ้ง:**
```tsx
// ลบ header section นี้ทั้งหมด (line 187-209)
<div className="flex items-center justify-between px-6 py-4 border-b">
  <div>
    <h1>แชท</h1>
    <p>สนทนากับ...</p>
  </div>
  <Button>ซ่อนข้อมูล</Button>
</div>
```

**เหลือแค่:**
```tsx
<div className="h-[calc(100vh-64px)] flex overflow-hidden">
  {/* 3 columns layout โดยไม่มี header */}
</div>
```

#### 2. ConversationList.tsx - ปรับเป็น Compact Header

**รวม toggle button เข้ามาใน ConversationList:**
```tsx
interface ConversationListProps {
  // ... existing props
  showInfoPanel?: boolean;
  onToggleInfoPanel?: () => void;
}

// Header section ใหม่
<div className="p-3 space-y-2">
  {/* Row 1: Title + Search + Toggle */}
  <div className="flex items-center gap-2">
    <div className="flex items-center gap-2 shrink-0">
      <MessageSquare className="h-5 w-5 text-primary" />
      <span className="font-semibold">แชท</span>
      <Badge variant="secondary">{conversations.length}</Badge>
    </div>
    
    {/* Compact search */}
    <div className="relative flex-1">
      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5" />
      <Input placeholder="ค้นหา..." className="h-8 pl-7 text-sm" />
    </div>
    
    {/* Toggle button (desktop only) */}
    {onToggleInfoPanel && (
      <Button variant="ghost" size="icon" className="h-8 w-8">
        {showInfoPanel ? <PanelRightClose /> : <PanelRight />}
      </Button>
    )}
  </div>
  
  {/* Row 2: Filter tabs */}
  <Tabs ...>
    <TabsList className="h-7">
      <TabsTrigger className="text-xs h-6">ทั้งหมด</TabsTrigger>
      ...
    </TabsList>
  </Tabs>
</div>
```

#### 3. Info Panel - ซ่อนเมื่อไม่มี Selection

**ก่อน:**
```tsx
{showInfoPanel && (
  <div className="w-80 ...">
    <EmployeeInfoCard conversation={selectedConversation} />  {/* แสดง empty state */}
  </div>
)}
```

**หลัง:**
```tsx
{showInfoPanel && selectedConversation && (
  <div className="w-80 ...">
    <EmployeeInfoCard conversation={selectedConversation} />
  </div>
)}
```

#### 4. EmployeeInfoCard.tsx - ลบ Empty State

**ลบ section นี้:**
```tsx
// ลบออก - ไม่จำเป็นเพราะจะไม่แสดง component เลยถ้าไม่มี conversation
if (!conversation) {
  return (
    <div className="p-4 text-center ...">
      <User className="h-8 w-8 ..." />
      <p>เลือกการสนทนาเพื่อดูข้อมูล</p>
    </div>
  );
}
```

#### 5. ConversationList.tsx - ลบ border-r ที่ซ้ำ

**ก่อน:**
```tsx
<div className="flex flex-col h-full border-r">  {/* ซ้ำกับ parent */}
```

**หลัง:**
```tsx
<div className="flex flex-col h-full">  {/* ลบ border-r */}
```

---

### ไฟล์ที่ต้องแก้ไข

| ไฟล์ | การเปลี่ยนแปลง |
|------|---------------|
| `src/pages/DirectMessages.tsx` | ลบ page header, ปรับ layout, pass toggle props |
| `src/components/dm/ConversationList.tsx` | รับ toggle props, compact header, ลบ border-r |
| `src/components/dm/EmployeeInfoCard.tsx` | ลบ empty state (return null แทน) |

---

### Visual Comparison

**พื้นที่ที่ได้คืน:**

| ส่วน | Before | After | ประหยัด |
|------|--------|-------|--------|
| Page header | 80px | 0px | 80px |
| List header | 110px | 70px | 40px |
| **รวม** | **190px** | **70px** | **120px** |

**ลดความซ้ำซ้อน:**
- ❌ "แชท" แสดง 2 ครั้ง → ✅ แสดง 1 ครั้ง
- ❌ Empty state 2 ที่ → ✅ แสดง 1 ที่ (กลางเท่านั้น)
- ❌ Double border → ✅ Single border

---

### รายละเอียดทางเทคนิค

#### ConversationList Props Update
```typescript
interface ConversationListProps {
  conversations: ConversationItem[];
  selectedId: string | null;
  onSelect: (conversation: ConversationItem) => void;
  isLoading: boolean;
  // New props
  showInfoPanel?: boolean;
  onToggleInfoPanel?: () => void;
}
```

#### DirectMessages Layout Update
```tsx
// Desktop view
<div className="h-[calc(100vh-64px)] flex overflow-hidden">
  {/* Left: Conversation list with integrated header */}
  <div className="w-80 shrink-0 border-r">
    <ConversationList
      conversations={conversations}
      selectedId={selectedConversation?.id || null}
      onSelect={handleSelectConversation}
      isLoading={isLoading}
      showInfoPanel={showInfoPanel}
      onToggleInfoPanel={() => setShowInfoPanel(!showInfoPanel)}
    />
  </div>

  {/* Center: Chat panel */}
  <div className="flex-1 flex flex-col min-w-0">
    <ChatPanel conversation={selectedConversation} />
  </div>

  {/* Right: Info panel - ONLY when has selection */}
  {showInfoPanel && selectedConversation && (
    <div className="w-72 shrink-0 border-l bg-muted/30 overflow-y-auto">
      <EmployeeInfoCard conversation={selectedConversation} />
      <EmployeeNotes conversation={selectedConversation} />
    </div>
  )}
</div>
```

---

### ผลลัพธ์ที่คาดหวัง

| ด้าน | Before | After |
|------|--------|-------|
| **Header** | ซ้ำ 2 ชั้น | 1 ชั้น compact |
| **พื้นที่แนวตั้ง** | เสีย ~120px | ได้คืน |
| **Empty state** | ซ้ำ 2 ที่ | 1 ที่ (center only) |
| **Info panel ว่าง** | แสดงตลอด | ซ่อนเมื่อไม่มี selection |
| **ความซับซ้อน** | สูง | ลดลง |
| **First impression** | ดูรก | สะอาดตา |

