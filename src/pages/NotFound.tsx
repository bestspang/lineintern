import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="text-center">
        <h1 className="mb-3 sm:mb-4 text-5xl sm:text-6xl md:text-7xl font-bold">404</h1>
        <p className="mb-4 sm:mb-6 text-lg sm:text-xl text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="text-sm sm:text-base text-primary underline hover:text-primary/90">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
