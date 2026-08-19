const NotFoundComponent = () => {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="max-w-md">
        <h1 className="text-6xl font-semibold tracking-tight text-foreground">
          404
        </h1>

        <h2 className="mt-4 text-2xl font-medium text-foreground">
          Page not found
        </h2>

        <p className="mt-3 text-sm text-muted-foreground">
          The page you are looking for doesn’t exist or may have been removed.
        </p>
      </div>
    </div>
  );
};

export default NotFoundComponent;
