import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Construction, ArrowLeft } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';

interface PortalPlaceholderProps {
  title: string;
  titleEn: string;
  description?: string;
  descriptionEn?: string;
}

export default function PortalPlaceholder({ 
  title, 
  titleEn, 
  description = 'หน้านี้กำลังพัฒนา',
  descriptionEn = 'This page is under development'
}: PortalPlaceholderProps) {
  const navigate = useNavigate();
  const { locale } = usePortal();

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-sm w-full text-center">
        <CardHeader>
          <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Construction className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle>{locale === 'th' ? title : titleEn}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            {locale === 'th' ? description : descriptionEn}
          </p>
          <Button variant="outline" onClick={() => navigate('/portal')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {locale === 'th' ? 'กลับหน้าหลัก' : 'Back to Home'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
