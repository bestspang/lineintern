import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

type Tx = {
  id: string;
  category: string;
  transaction_type: string;
  description: string | null;
  employees?: { full_name?: string; code?: string };
};

export function PointTransactionSendStreakButton({
  tx,
  alreadySent,
}: {
  tx: Tx;
  alreadySent?: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  const isEligible = useMemo(() => {
    return tx.category === "streak" && tx.transaction_type === "bonus";
  }, [tx.category, tx.transaction_type]);

  const mutation = useMutation({
    mutationFn: async (vars: { markOnly?: boolean }) => {
      const { data, error } = await supabase.functions.invoke("manual-streak-notify", {
        body: {
          transaction_id: tx.id,
          notify_group: true,
          notify_dm: false,
          mark_only: Boolean(vars?.markOnly),
        },
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      if (data?.status === "already_sent") {
        toast({ title: "ส่งไปแล้ว", description: "รายการนี้มี log ว่าส่งสำเร็จแล้ว (จะไม่ backfill ซ้ำ)" });
      } else if (data?.status === "marked_sent") {
        toast({
          title: "บันทึกว่าส่งแล้ว",
          description: "โหมดไม่ส่งซ้ำ: ระบบสร้าง log กัน backfill เรียบร้อย",
        });
      } else {
        toast({ title: "ส่งประกาศแล้ว", description: "ระบบบันทึก log ให้เรียบร้อยเพื่อกันส่งซ้ำ" });
      }
      setDone(true);
      qc.invalidateQueries({ queryKey: ["point-transactions"] });
      qc.invalidateQueries({ queryKey: ["streak-weekly-notify-markers"] });
      setOpen(false);
    },
    onError: (err: any) => {
      toast({
        title: "ทำรายการไม่สำเร็จ",
        description: err?.message || "Unknown error",
        variant: "destructive",
      });
    },
  });

  if (!isEligible) return null;

  if (alreadySent || done) {
    return (
      <Button variant="secondary" size="sm" disabled>
        สำเร็จแล้ว
      </Button>
    );
  }

  const employeeLabel = tx.employees?.full_name
    ? `${tx.employees.full_name}${tx.employees.code ? ` (${tx.employees.code})` : ""}`
    : "พนักงาน";

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="secondary" size="sm" disabled={mutation.isPending}>
          ส่งประกาศ
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>ส่งประกาศ streak ตอนนี้ (ครั้งเดียว)</AlertDialogTitle>
          <AlertDialogDescription>
            จะส่งข้อความไปที่กลุ่มประกาศของ {employeeLabel} และจะเขียน log ผูกกับ transaction นี้
            เพื่อให้ระบบ backfill ไม่ส่งซ้ำในอนาคต
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                mutation.mutate({ markOnly: true });
              }}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "กำลังบันทึก..." : "ยืนยันว่าได้ส่งแล้ว (ไม่ส่งซ้ำ)"}
            </AlertDialogAction>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
                mutation.mutate({ markOnly: false });
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "กำลังส่ง..." : "ส่งเลย"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
