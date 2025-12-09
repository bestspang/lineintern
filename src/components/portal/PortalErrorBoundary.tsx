import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  locale?: 'th' | 'en';
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PortalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Portal Error]:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    const token = sessionStorage.getItem('portal_token');
    if (token) {
      window.location.href = `/portal?token=${token}`;
    } else {
      window.location.href = '/portal';
    }
  };

  public render() {
    const { locale = 'th' } = this.props;
    
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <Card className="w-full max-w-md">
            <CardContent className="p-6 text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
              
              <div>
                <h2 className="text-lg font-semibold mb-2">
                  {locale === 'th' ? 'เกิดข้อผิดพลาด' : 'Something went wrong'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {locale === 'th' 
                    ? 'กรุณาลองใหม่อีกครั้ง หากปัญหายังคงอยู่ กรุณาติดต่อผู้ดูแลระบบ' 
                    : 'Please try again. If the problem persists, contact your administrator.'}
                </p>
              </div>

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="bg-muted p-3 rounded-lg text-left">
                  <p className="text-xs font-mono text-destructive break-all">
                    {this.state.error.message}
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={this.handleGoHome}
                >
                  <Home className="h-4 w-4 mr-2" />
                  {locale === 'th' ? 'หน้าหลัก' : 'Home'}
                </Button>
                <Button 
                  className="flex-1"
                  onClick={this.handleRetry}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {locale === 'th' ? 'ลองใหม่' : 'Retry'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
