import { ServerCrash, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ServerError() {
  const handleRetry = () => {
    window.location.reload();
  };

  const handleGoHome = () => {
    window.location.href = '/';
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
            <ServerCrash className="w-8 h-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">เซิร์ฟเวอร์ขัดข้อง</CardTitle>
          <CardDescription>
            เกิดข้อผิดพลาดกับเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted p-4 rounded-lg text-sm text-muted-foreground">
            <p className="font-semibold mb-2">รหัสข้อผิดพลาด: 500</p>
            <p>เราได้รับแจ้งปัญหาแล้ว และกำลังแก้ไขโดยเร็วที่สุด</p>
          </div>
          
          <div className="flex gap-2">
            <Button onClick={handleRetry} variant="default" className="flex-1">
              <RefreshCw className="w-4 h-4 mr-2" />
              ลองอีกครั้ง
            </Button>
            <Button onClick={handleGoHome} variant="outline" className="flex-1">
              <Home className="w-4 h-4 mr-2" />
              หน้าหลัก
            </Button>
          </div>
          
          <div className="text-xs text-center text-muted-foreground pt-2">
            หากปัญหาไม่หาย กรุณาติดต่อผู้ดูแลระบบ
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
