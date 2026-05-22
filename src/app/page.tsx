export default function Dashboard() {
  return (
    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm">
      <div className="flex flex-col items-center gap-1 text-center">
        <h3 className="text-2xl font-bold tracking-tight">
          Welcome to your Dashboard
        </h3>
        <p className="text-sm text-muted-foreground">
          This is where the AI coordination feed and tasks will be displayed.
        </p>
      </div>
    </div>
  );
}
