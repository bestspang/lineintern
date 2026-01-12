import { WifiOff, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NetworkError() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
            <WifiOff className="w-8 h-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">ไม่สามารถเชื่อมต่อได้</CardTitle>
          <CardDescription>
            กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตของคุณ
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>• ตรวจสอบว่าเชื่อมต่อ Wi-Fi หรือมือถือแล้ว</p>
            <p>• ลองเปิดหน้าเว็บอื่นเพื่อทดสอบการเชื่อมต่อ</p>
            <p>• หากปัญหายังคงอยู่ ติดต่อผู้ดูแลระบบ</p>
          </div>
          
          <Button onClick={handleRetry} className="w-full" size="lg">
            <RefreshCw className="w-4 h-4 mr-2" />
            ลองอีกครั้ง
          </Button>
          
          <div className="text-center">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground underline">
              กลับหน้าหลัก
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
