import { LogOut, LogIn } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SessionExpired() {
  const navigate = useNavigate();

  const handleLogin = () => {
    navigate('/auth');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-warning/10 rounded-full flex items-center justify-center mb-4">
            <LogOut className="w-8 h-8 text-warning" />
          </div>
          <CardTitle className="text-2xl">เซสชันหมดอายุ</CardTitle>
          <CardDescription>
            กรุณาเข้าสู่ระบบอีกครั้งเพื่อดำเนินการต่อ
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted p-4 rounded-lg text-sm text-muted-foreground">
            <p>เซสชันของคุณหมดอายุเนื่องจาก:</p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>ไม่มีการใช้งานเป็นเวลานาน</li>
              <li>เข้าสู่ระบบจากอุปกรณ์อื่น</li>
              <li>เพื่อความปลอดภัยของข้อมูล</li>
            </ul>
          </div>
          
          <Button onClick={handleLogin} className="w-full" size="lg">
            <LogIn className="w-4 h-4 mr-2" />
            เข้าสู่ระบบอีกครั้ง
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
