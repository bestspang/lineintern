import { Suspense, lazy } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Skeleton } from '@/components/ui/skeleton';
import { BranchReportProvider, useBranchReportContext } from './context/BranchReportContext';
import BranchReportHeader from './components/BranchReportHeader';

// Lazy load heavy components
const BranchReportOverview = lazy(() => import('./components/BranchReportOverview'));
const BranchReportCharts = lazy(() => import('./components/BranchReportCharts'));
const BranchReportTable = lazy(() => import('./components/BranchReportTable'));

function BranchReportContent() {
  const { isLoading, error } = useBranchReportContext();

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-destructive mb-2">เกิดข้อผิดพลาด: {error.message}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="text-primary underline"
          >
            ลองใหม่
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <BranchReportHeader />

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <>
          <Suspense fallback={<Skeleton className="h-24" />}>
            <BranchReportOverview />
          </Suspense>

          <Suspense fallback={<Skeleton className="h-64" />}>
            <BranchReportCharts />
          </Suspense>

          <Suspense fallback={<Skeleton className="h-96" />}>
            <BranchReportTable />
          </Suspense>
        </>
      )}
    </div>
  );
}

export default function BranchReportsPage() {
  return (
    <ErrorBoundary>
      <BranchReportProvider>
        <BranchReportContent />
      </BranchReportProvider>
    </ErrorBoundary>
  );
}
