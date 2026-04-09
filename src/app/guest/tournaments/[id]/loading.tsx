import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function GuestTournamentLoading() {
  return (
    <div className="container mx-auto px-4 md:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <Skeleton className="h-9 w-40 mb-4" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-64" />
              <Skeleton className="h-5 w-16" />
            </div>
            <div className="flex items-center gap-4 mt-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
      </div>

      {/* Tabs */}
      <div className="space-y-6">
        <Skeleton className="h-10 w-full max-w-md" />

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-12 mt-1" />
              </CardHeader>
            </Card>
          ))}
        </div>

        {/* Courts Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-6 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

