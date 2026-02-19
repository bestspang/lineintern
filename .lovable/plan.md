

## Fix: Access Matrix ไม่สามารถ scroll ซ้ายขวาได้

### สาเหตุ

`ScrollArea` component (Radix UI) จะแสดงแค่ vertical scrollbar เป็น default ต้องเพิ่ม `<ScrollBar orientation="horizontal" />` เข้าไปด้วยถึงจะ scroll แนวนอนได้

### การแก้ไข

**ไฟล์เดียว**: `src/pages/settings/AIQueryControl.tsx`

1. Import `ScrollBar` จาก `@/components/ui/scroll-area` (ปัจจุบัน import แค่ `ScrollArea`)
2. เพิ่ม `<ScrollBar orientation="horizontal" />` ข้างใน `<ScrollArea>` ของ Access Matrix tab

### ตัวอย่างโค้ดที่จะเปลี่ยน

```text
ก่อน:
<ScrollArea className="w-full">
  <div className="min-w-[600px]">
    <Table>...</Table>
  </div>
</ScrollArea>

หลัง:
<ScrollArea className="w-full">
  <div className="min-w-[600px]">
    <Table>...</Table>
  </div>
  <ScrollBar orientation="horizontal" />
</ScrollArea>
```

### สิ่งที่จะไม่แตะ

- ไม่แก้ tab อื่น
- ไม่แก้ logic / data / styling อื่นใด
- แก้แค่ 2 บรรทัด (import + ScrollBar element)

