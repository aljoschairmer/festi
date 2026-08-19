import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NotificationHistory } from "@/features/notification/components/notificationHistory";

export default function NotificationsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
        <p className="text-muted-foreground">
          Your full notification history — click one to jump to the ride, group,
          or rider
        </p>
      </div>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Newest first</CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationHistory />
        </CardContent>
      </Card>
    </div>
  );
}
