import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function TournamentLoading() {
  return (
    <div className="container py-8">
      {/* Back button */}
      <Skeleton className="h-10 w-40 mb-4" />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="flex items-center gap-4 mt-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-28" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-10" />
        </div>
      </div>

      {/* Tabs */}
      <Skeleton className="h-10 w-80 mb-6" />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-16 mb-1" />
              <Skeleton className="h-8 w-12" />
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Courts grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <Skeleton className="h-6 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

