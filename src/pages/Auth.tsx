import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { z } from 'zod';
import { ArrowLeft, Mail, Home, LogOut } from 'lucide-react';

const signInSchema = z.object({
  email: z.string().email('Invalid email address').max(255, 'Email must be less than 255 characters'),
  password: z.string().min(1, 'Password is required'),
});

const signUpSchema = z.object({
  email: z.string().email('Invalid email address').max(255, 'Email must be less than 255 characters'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  displayName: z.string()
    .trim()
    .min(2, 'Display name must be at least 2 characters')
    .max(50, 'Display name must be less than 50 characters'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address').max(255, 'Email must be less than 255 characters'),
});

export default function Auth() {
  const { user, signIn, signUp, resetPassword, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth('google', {
        redirect_uri: window.location.origin,
      });
      if (result.redirected) return; // browser will redirect to Google
      if (result.error) {
        toast({
          variant: 'destructive',
          title: 'Google sign-in failed',
          description: result.error.message ?? 'Unknown error',
        });
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Google sign-in failed',
        description: err?.message ?? String(err),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearSession = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[Auth] signOut error (ignored):', err);
    }
    try {
      // Best-effort: clear any leftover Supabase auth keys that might block re-login
      Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-') || k.includes('supabase'))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    toast({
      title: 'ล้าง session แล้ว',
      description: 'คุณสามารถลองเข้าสู่ระบบใหม่ได้',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const input = {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
    };

    const result = signInSchema.safeParse(input);
    if (!result.success) {
      toast({
        variant: 'destructive',
        title: 'Validation failed',
        description: result.error.issues[0].message,
      });
      setIsLoading(false);
      return;
    }

    const { error } = await signIn(result.data.email, result.data.password);
    
    setIsLoading(false);
    
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Sign in failed',
        description: error.message,
      });
    }
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const input = {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      displayName: formData.get('displayName') as string,
    };

    const result = signUpSchema.safeParse(input);
    if (!result.success) {
      toast({
        variant: 'destructive',
        title: 'Validation failed',
        description: result.error.issues[0].message,
      });
      setIsLoading(false);
      return;
    }

    const { error } = await signUp(result.data.email, result.data.password, result.data.displayName);
    
    setIsLoading(false);
    
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Sign up failed',
        description: error.message,
      });
    } else {
      toast({
        title: 'Account created',
        description: 'Please check your email to verify your account before signing in.',
      });
    }
  };

  const handleForgotPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const input = {
      email: formData.get('email') as string,
    };

    const result = forgotPasswordSchema.safeParse(input);
    if (!result.success) {
      toast({
        variant: 'destructive',
        title: 'Validation failed',
        description: result.error.issues[0].message,
      });
      setIsLoading(false);
      return;
    }

    const { error } = await resetPassword(result.data.email);
    
    setIsLoading(false);
    
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Request failed',
        description: error.message,
      });
    } else {
      setResetEmailSent(true);
      toast({
        title: 'Reset link sent',
        description: 'Check your email for the password reset link.',
      });
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center p-4 sm:p-6">
          <CardTitle className="text-xl sm:text-2xl">LINE Intern Control Panel</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Internal admin dashboard</CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {/* Google Sign-In (Lovable Cloud managed OAuth) */}
          <Button
            type="button"
            variant="outline"
            className="w-full text-sm sm:text-base h-9 sm:h-10 mb-4"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
          >
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {isLoading ? 'กำลังเข้าสู่ระบบ...' : 'Sign in with Google'}
          </Button>

          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">หรือ / or</span>
            </div>
          </div>

          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2 h-auto">
              <TabsTrigger value="signin" className="text-xs sm:text-sm">Sign In</TabsTrigger>
              <TabsTrigger value="signup" className="text-xs sm:text-sm">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin">
              {showForgotPassword ? (
                resetEmailSent ? (
                  <div className="space-y-4 text-center py-4">
                    <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                      <Mail className="w-6 h-6 text-primary" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-medium">Check your email</h3>
                      <p className="text-sm text-muted-foreground">
                        We've sent a password reset link to your email address.
                      </p>
                    </div>
                    <Button 
                      type="button" 
                      variant="outline" 
                      className="w-full"
                      onClick={() => {
                        setShowForgotPassword(false);
                        setResetEmailSent(false);
                      }}
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back to Sign In
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="text-center py-2">
                      <h3 className="font-medium text-sm sm:text-base">Reset Your Password</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                        Enter your email and we'll send you a reset link
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reset-email" className="text-xs sm:text-sm">Email</Label>
                      <Input
                        id="reset-email"
                        name="email"
                        type="email"
                        placeholder="admin@example.com"
                        className="text-sm"
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? 'Sending...' : 'Send Reset Link'}
                    </Button>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      className="w-full text-xs sm:text-sm"
                      onClick={() => setShowForgotPassword(false)}
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back to Sign In
                    </Button>
                  </form>
                )
              ) : (
                <form onSubmit={handleSignIn} className="space-y-3 sm:space-y-4">
                  <div className="space-y-1 sm:space-y-2">
                    <Label htmlFor="signin-email" className="text-xs sm:text-sm">Email</Label>
                    <Input
                      id="signin-email"
                      name="email"
                      type="email"
                      placeholder="admin@example.com"
                      className="text-sm"
                      required
                    />
                  </div>
                  <div className="space-y-1 sm:space-y-2">
                    <Label htmlFor="signin-password" className="text-xs sm:text-sm">Password</Label>
                    <Input
                      id="signin-password"
                      name="password"
                      type="password"
                      className="text-sm"
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full text-sm sm:text-base h-9 sm:h-10" disabled={isLoading}>
                    {isLoading ? 'Signing in...' : 'Sign In'}
                  </Button>
                  <Button 
                    type="button" 
                    variant="link" 
                    className="w-full text-xs sm:text-sm text-muted-foreground"
                    onClick={() => setShowForgotPassword(true)}
                  >
                    Forgot Password?
                  </Button>
                </form>
              )}
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Display Name</Label>
                  <Input
                    id="signup-name"
                    name="displayName"
                    type="text"
                    placeholder="John Doe"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    name="email"
                    type="email"
                    placeholder="admin@example.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Creating account...' : 'Create Account'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {/* Recovery actions — visible escape hatches in case of stale session / lockout */}
          <div className="mt-6 pt-4 border-t flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 text-xs sm:text-sm"
              onClick={() => navigate('/')}
            >
              <Home className="w-4 h-4 mr-2" />
              ไปหน้าหลัก
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="flex-1 text-xs sm:text-sm"
              onClick={handleClearSession}
            >
              <LogOut className="w-4 h-4 mr-2" />
              ออกจากระบบ / ล้าง session
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
